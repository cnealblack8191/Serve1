/**
 * Command-line front of plan.ts for move.sh (infra/hosting-move/RUNBOOK.md). No AWS calls.
 *
 *   npx tsx scripts/hosting-move/cli.ts strip <cdktoolkit.json> <out.json>
 *   npx tsx scripts/hosting-move/cli.ts match <cdktoolkit.json> <serv1-hosting.json>
 *   npx tsx scripts/hosting-move/cli.ts remove-only <changeset.json>
 *   npx tsx scripts/hosting-move/cli.ts import-only <changeset.json>
 *   npx tsx scripts/hosting-move/cli.ts reimport <cdktoolkit-before.json> <current.json> <out.json>
 *   npx tsx scripts/hosting-move/cli.ts import-template <serv1-hosting.json> <out.json>
 *   npx tsx scripts/hosting-move/cli.ts live <get-app.json> <get-branch.json> <serv1-hosting.json>
 *   npx tsx scripts/hosting-move/cli.ts strip-bucket <cdktoolkit.json> <out.json>
 *   npx tsx scripts/hosting-move/cli.ts bucket-remove-only <changeset.json>
 *   npx tsx scripts/hosting-move/cli.ts bucket-empty <versions> <delete-markers> <uploads>
 *   npx tsx scripts/hosting-move/cli.ts reimport-bucket <cdktoolkit-prebucket.json> <current.json> <out.json>
 *
 * Exits 1 with the reasons when a check fails, so move.sh stops before executing anything.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  bucketEmpty,
  bucketReimportTemplate,
  checkBucketRemoveOnly,
  checkImportOnly,
  checkRemoveOnly,
  hostingMatches,
  importTemplate,
  liveMatches,
  reimportTemplate,
  stripBucket,
  stripHosting,
  type LiveApp,
  type LiveBranch,
  type ChangeRow,
  type Template,
} from "./plan";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;
/** describe-stacks/get-template give the body as an object or as a JSON string. */
const template = (p: string): Template => {
  const v = read(p) as { TemplateBody?: unknown } & Template;
  const body = v.TemplateBody ?? v;
  return (typeof body === "string" ? JSON.parse(body) : body) as Template;
};
const stop = (problems: string[]) => {
  if (!problems.length) return;
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
};

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "strip" && a && b) {
    writeFileSync(b, JSON.stringify(stripHosting(template(a)), null, 2) + "\n");
    console.log(`Wrote ${b}`);
  } else if (cmd === "match" && a && b) {
    stop(hostingMatches(template(a), template(b)));
    console.log("serv1-hosting matches what CDKToolkit declared.");
  } else if (cmd === "import-template" && a && b) {
    writeFileSync(b, JSON.stringify(importTemplate(template(a)), null, 2) + "\n");
    console.log(`Wrote ${b}`);
  } else if (cmd === "reimport" && a && b && process.argv[5]) {
    writeFileSync(
      process.argv[5],
      JSON.stringify(reimportTemplate(template(a), template(b)), null, 2) + "\n",
    );
    console.log(`Wrote ${process.argv[5]}`);
  } else if (cmd === "live" && a && b && process.argv[5]) {
    stop(liveMatches(read(a) as LiveApp, read(b) as LiveBranch, template(process.argv[5])));
    console.log("The live app and branch match serv1-hosting.");
  } else if (cmd === "strip-bucket" && a && b) {
    writeFileSync(b, JSON.stringify(stripBucket(template(a)), null, 2) + "\n");
    console.log(`Wrote ${b}`);
  } else if (cmd === "bucket-remove-only" && a) {
    const changes = ((read(a) as { Changes?: ChangeRow[] }).Changes ?? []) as ChangeRow[];
    stop(checkBucketRemoveOnly(changes));
    console.log("Change set checked: bucket-remove-only.");
  } else if (cmd === "bucket-empty" && a && b && process.argv[5]) {
    const n = (x: string) => {
      if (!/^\d+$/.test(x)) throw new Error(`not a count: ${x}`);
      return Number(x);
    };
    stop(bucketEmpty({ versions: n(a), deleteMarkers: n(b), uploads: n(process.argv[5]) }));
    console.log("The staging bucket is empty.");
  } else if (cmd === "reimport-bucket" && a && b && process.argv[5]) {
    writeFileSync(
      process.argv[5],
      JSON.stringify(bucketReimportTemplate(template(a), template(b)), null, 2) + "\n",
    );
    console.log(`Wrote ${process.argv[5]}`);
  } else if ((cmd === "remove-only" || cmd === "import-only") && a) {
    const changes = ((read(a) as { Changes?: ChangeRow[] }).Changes ?? []) as ChangeRow[];
    stop(cmd === "remove-only" ? checkRemoveOnly(changes) : checkImportOnly(changes));
    console.log(`Change set checked: ${cmd}.`);
  } else {
    console.error(
      "usage: cli.ts strip|match|import-template|reimport|live|remove-only|import-only|" +
        "strip-bucket|bucket-remove-only|bucket-empty|reimport-bucket ...",
    );
    process.exit(2);
  }
} catch (e) {
  console.error(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
