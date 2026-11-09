/**
 * Moving the Serv1 hosting app out of the custom CDKToolkit stack (infra/hosting-move/RUNBOOK.md).
 * Pure functions, so the plan is unit-tested without AWS (tests/unit/hosting-move.test.ts):
 *  - stripHosting: CDKToolkit's live template without the hosting app, its branch and the
 *    container repository, which every one of them keeps as DeletionPolicy Retain, so a stack
 *    update removes them from the stack and deletes nothing.
 *  - checkRemoveOnly / checkImportOnly: a change set does only that, or the run stops.
 *  - hostingMatches: the import template's App and Branch match what CDKToolkit declared.
 */

export type Template = {
  Resources: Record<string, { Type: string; DeletionPolicy?: string; Properties?: unknown }>;
  Outputs?: Record<string, { Value: unknown }>;
  [k: string]: unknown;
};

/** Leaves CDKToolkit, kept (Retain) in the account. */
export const MOVED = ["HostingApp", "HostingBranch", "ContainerAssetsRepository"] as const;

const EXPECTED_TYPES: Record<(typeof MOVED)[number], string> = {
  HostingApp: "AWS::Amplify::App",
  HostingBranch: "AWS::Amplify::Branch",
  ContainerAssetsRepository: "AWS::ECR::Repository",
};

/** Logical ids a value refers to (Ref, Fn::GetAtt, Fn::Sub "${Id}"). */
export function referencedIds(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => referencedIds(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "Ref" && typeof x === "string") out.add(x);
      else if (k === "Fn::GetAtt") {
        const id = Array.isArray(x) ? x[0] : typeof x === "string" ? x.split(".")[0] : null;
        if (typeof id === "string") out.add(id);
      } else if (k === "Fn::Sub") {
        const s = Array.isArray(x) ? x[0] : x;
        if (typeof s === "string")
          for (const m of s.matchAll(/\$\{([A-Za-z0-9]+)(\.[^}]*)?\}/g)) out.add(m[1]!);
        referencedIds(x, out);
      } else referencedIds(x, out);
    }
  }
  return out;
}

/**
 * The template without the moved resources and the outputs that name them. Refuses (throws) when
 * a moved resource is missing, of another type, not Retain on delete, or still referenced by a
 * resource that stays.
 */
export function stripHosting(t: Template): Template {
  for (const id of MOVED) {
    const r = t.Resources[id];
    if (!r) throw new Error(`CDKToolkit has no ${id}; stop and re-read the live template.`);
    if (r.Type !== EXPECTED_TYPES[id])
      throw new Error(`${id} is ${r.Type}, not ${EXPECTED_TYPES[id]}.`);
    if (r.DeletionPolicy !== "Retain")
      throw new Error(`${id} is not DeletionPolicy Retain; removing it would delete it.`);
  }
  const moved = new Set<string>(MOVED);
  const resources = Object.fromEntries(
    Object.entries(t.Resources).filter(([id]) => !moved.has(id)),
  );
  for (const [id, r] of Object.entries(resources)) {
    const hit = [...referencedIds(r)].filter((x) => moved.has(x));
    if (hit.length) throw new Error(`${id} still refers to ${hit.join(", ")}.`);
  }
  const outputs = Object.fromEntries(
    Object.entries(t.Outputs ?? {}).filter(
      ([, o]) => ![...referencedIds(o)].some((x) => moved.has(x)),
    ),
  );
  // Outputs that only describe hosting ("HostingBranch": "demo") go too.
  delete outputs.HostingBranch;
  const out: Template = { ...t, Resources: resources };
  if (Object.keys(outputs).length) out.Outputs = outputs;
  else delete out.Outputs;
  return out;
}

export interface ChangeRow {
  Type?: string;
  ResourceChange?: {
    Action?: string;
    LogicalResourceId?: string;
    ResourceType?: string;
    PolicyAction?: string;
  };
}

/** Step 1: exactly the moved resources, each a Remove that retains (never deletes). */
export function checkRemoveOnly(changes: ChangeRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of changes) {
    const rc = c.ResourceChange ?? {};
    const id = rc.LogicalResourceId ?? "?";
    seen.add(id);
    if (rc.Action !== "Remove") problems.push(`${id}: ${rc.Action}, not Remove`);
    if (!(MOVED as readonly string[]).includes(id))
      problems.push(`${id}: not one of the moved resources`);
    if (rc.PolicyAction !== undefined && rc.PolicyAction !== "Retain")
      problems.push(`${id}: PolicyAction ${rc.PolicyAction}, not Retain`);
  }
  for (const id of MOVED) if (!seen.has(id)) problems.push(`${id}: missing from the change set`);
  return problems;
}

/** Step 2: exactly HostingApp and HostingBranch, each an Import. */
export function checkImportOnly(changes: ChangeRow[]): string[] {
  const problems: string[] = [];
  const want = ["HostingApp", "HostingBranch"];
  const seen = new Set<string>();
  for (const c of changes) {
    const rc = c.ResourceChange ?? {};
    const id = rc.LogicalResourceId ?? "?";
    seen.add(id);
    if (rc.Action !== "Import") problems.push(`${id}: ${rc.Action}, not Import`);
    if (!want.includes(id)) problems.push(`${id}: not expected in the import`);
  }
  for (const id of want) if (!seen.has(id)) problems.push(`${id}: missing from the import`);
  return problems;
}

/** What CloudFormation is told the app and branch are (import changes nothing if they match). */
export interface HostingProps {
  app: { Name: unknown; Platform: unknown; CustomRules: unknown; Tags: unknown };
  branch: { BranchName: unknown; EnableAutoBuild: unknown; Stage: unknown; Tags: unknown };
}
export function hostingProps(t: Template): HostingProps {
  const app = (t.Resources.HostingApp?.Properties ?? {}) as Record<string, unknown>;
  const br = (t.Resources.HostingBranch?.Properties ?? {}) as Record<string, unknown>;
  return {
    app: { Name: app.Name, Platform: app.Platform, CustomRules: app.CustomRules, Tags: app.Tags },
    branch: {
      BranchName: br.BranchName,
      EnableAutoBuild: br.EnableAutoBuild,
      Stage: br.Stage,
      Tags: br.Tags,
    },
  };
}
export function hostingMatches(cdkToolkit: Template, hosting: Template): string[] {
  const a = hostingProps(cdkToolkit);
  const b = hostingProps(hosting);
  const out: string[] = [];
  for (const part of ["app", "branch"] as const)
    for (const [k, v] of Object.entries(a[part]))
      if (JSON.stringify(v) !== JSON.stringify((b[part] as Record<string, unknown>)[k]))
        out.push(`${part}.${k} differs`);
  for (const id of ["HostingApp", "HostingBranch"])
    if (hosting.Resources[id]?.DeletionPolicy !== "Retain")
      out.push(`${id} must be DeletionPolicy Retain in serv1-hosting`);
  return out;
}

/** `aws amplify get-app` / `get-branch` output (the parts the import template declares). */
export interface LiveApp {
  app: {
    name?: string;
    platform?: string;
    customRules?: { source?: string; target?: string; status?: string; condition?: string }[];
    tags?: Record<string, string>;
  };
}
export interface LiveBranch {
  branch: {
    branchName?: string;
    enableAutoBuild?: boolean;
    stage?: string;
    tags?: Record<string, string>;
  };
}
const tagMap = (tags: unknown) =>
  Object.fromEntries(
    ((tags as { Key: string; Value: string }[] | undefined) ?? []).map((t) => [t.Key, t.Value]),
  );
const sorted = (o: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y))));

/**
 * The live app and branch against the import template, so the import describes them exactly as
 * they are. Amplify adds its own aws:* tags; those are ignored.
 */
export function liveMatches(live: LiveApp, branch: LiveBranch, hosting: Template): string[] {
  const p = hostingProps(hosting);
  const out: string[] = [];
  const a = live.app;
  if (a.name !== p.app.Name) out.push(`app name is ${a.name}, template says ${String(p.app.Name)}`);
  if (a.platform !== p.app.Platform) out.push(`app platform is ${a.platform}`);
  const rules = (a.customRules ?? []).map((r) => ({
    Source: r.source,
    Target: r.target,
    Status: r.status,
    ...(r.condition ? { Condition: r.condition } : {}),
  }));
  if (JSON.stringify(rules) !== JSON.stringify(p.app.CustomRules))
    out.push(`app rewrite rules differ: live ${JSON.stringify(rules)}`);
  const ownTags = (t: Record<string, string> | undefined) =>
    Object.fromEntries(Object.entries(t ?? {}).filter(([k]) => !k.startsWith("aws:")));
  if (sorted(ownTags(a.tags)) !== sorted(tagMap(p.app.Tags))) out.push("app tags differ");
  const b = branch.branch;
  if (b.branchName !== p.branch.BranchName) out.push(`branch is ${b.branchName}`);
  if ((b.enableAutoBuild ?? false) !== p.branch.EnableAutoBuild)
    out.push(`branch auto build is ${String(b.enableAutoBuild)}`);
  if (b.stage !== p.branch.Stage) out.push(`branch stage is ${b.stage}`);
  if (sorted(ownTags(b.tags)) !== sorted(tagMap(p.branch.Tags))) out.push("branch tags differ");
  return out;
}

/**
 * Undo of step 1: the template that imports the app, branch and repository back into CDKToolkit.
 * An IMPORT may add only the imported resources: every other part, the Outputs included, must
 * equal the stack's current (stripped) template. The original outputs come back afterwards in a
 * separate update (move.sh undo-remove; Codex review of PR #22).
 */
export function reimportTemplate(before: Template, current: Template): Template {
  const out: Template = { ...before };
  if (current.Outputs && Object.keys(current.Outputs).length) out.Outputs = current.Outputs;
  else delete out.Outputs;
  for (const [id, r] of Object.entries(current.Resources))
    if (JSON.stringify(before.Resources[id]) !== JSON.stringify(r))
      throw new Error(`${id} differs between the saved and the current template; stop.`);
  return out;
}

/**
 * Step 2: the template the IMPORT change set uses. An import may add only the imported resources,
 * so outputs are left out here and added by a separate update once the import completes (Codex
 * review of PR #22; the CDK importer does the same for new-stack imports).
 */
export function importTemplate(full: Template): Template {
  const { Outputs: _outputs, ...rest } = full;
  return rest as Template;
}
