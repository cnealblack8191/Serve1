import {
  type CustomerContract,
  type JobHealth,
  type JobStatus,
  type NewOpportunity,
  type OpportunityStage,
  type WorkType,
} from "@/data/types";

import type { Cell, Sheet, SheetRow } from "./xlsx";

/**
 * One-time import of the owner's Business Services Smartsheet exports (Phase 2).
 * Pure: turns sheets into an ImportPlan; src/data/importer.ts writes the plan.
 *
 *  - Sales Pipeline rows become opportunities.
 *  - Service Pipeline rows merge into the sales row with the same name (most are duplicates);
 *    the rest become their own Service opportunities. A service row with work under way or done
 *    also becomes a job.
 *  - Task Tracker rows become jobs with tracking fields, linked to the opportunity of the same
 *    name when there is one. Parent rows name the customer contract for the rows under them.
 *  - Customer-contract spellings are cleaned ("Dekalb Service", "DeKalb Gov Service" -> DeKalb Gov.).
 */

export type SheetKind = "sales" | "service" | "tasks";

export interface PlannedJob {
  /** Stable key so a second run skips jobs already imported. */
  key: string;
  description: string;
  contract: CustomerContract;
  workType: WorkType;
  status: JobStatus;
  health: JobHealth | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  poReceived: boolean;
  materialOrdered: boolean;
  materialDelivered: boolean;
  liftConnex: boolean;
  serviceReportApproved: boolean;
  completionPhotosOnFile: boolean;
  notes: string | null;
}

export interface PlannedOpportunity {
  key: string;
  data: NewOpportunity;
  job: PlannedJob | null;
  /** e.g. ["Sales Pipeline row 12", "Service Pipeline row 4"] */
  sources: string[];
}

export interface ImportPlan {
  sheets: { file: string; sheet: string; kind: SheetKind | null; rows: number }[];
  opportunities: PlannedOpportunity[];
  /** Task rows with no matching opportunity. */
  jobs: PlannedJob[];
  mergedServiceRows: number;
  contractSpellings: { raw: string; contract: CustomerContract; rows: number }[];
  warnings: string[];
}

// ---------------------------------------------------------------- cleaning helpers

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Name used to match service and task rows to sales rows. */
export const matchName = (s: string) =>
  norm(s)
    .replace(/\b(the|service|services)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cleans every spelling of a customer contract; null when the text names none. */
export function cleanContract(text: string | null | undefined): CustomerContract | null {
  if (!text) return null;
  const t = norm(text);
  if (/\bnon ?contract\b/.test(t)) return "NonContract";
  if (t.includes("dekalb")) return /school|dcsd/.test(t) ? "DeKalbSchools" : "DeKalbGov";
  if (t.includes("gwinnett")) return "GwinnettSchools";
  if (t.includes("rockdale")) return "RockdaleGov";
  if (t.includes("barrow")) return "BarrowSchools";
  if (t.includes("decatur")) return "DecaturCitySchools";
  return null;
}

export function cleanType(text: string | null | undefined): WorkType | null {
  if (!text) return null;
  const t = norm(text);
  if (/\bhigh\b|\bhv\b/.test(t)) return "HighVoltage";
  if (/\blow\b|\blv\b/.test(t)) return "LowVoltage";
  if (/servic/.test(t)) return "Service";
  return null;
}

export function cleanStage(text: string | null | undefined): OpportunityStage | null {
  if (!text) return null;
  const t = norm(text);
  if (/no ?bid/.test(t)) return "NoBid";
  if (/\blost\b/.test(t)) return "ClosedLost";
  if (/\bwon\b|award/.test(t)) return "ClosedWon";
  const n = /^(\d)/.exec(t)?.[1];
  const byNumber: Record<string, OpportunityStage> = {
    "1": "Prospect",
    "2": "Assessment",
    "3": "ProposalBidding",
    "4": "ProposalSent",
    "5": "CustomerReview",
    "6": "CustomerFollowUp",
  };
  if (n && byNumber[n]) return byNumber[n];
  if (/prospect/.test(t)) return "Prospect";
  if (/assess|site visit/.test(t)) return "Assessment";
  if (/sent|submitted/.test(t)) return "ProposalSent";
  if (/bidding|proposal|quoting|estimat/.test(t)) return "ProposalBidding";
  if (/review/.test(t)) return "CustomerReview";
  if (/follow/.test(t)) return "CustomerFollowUp";
  return null;
}

export function cleanHealth(text: Cell): JobHealth | null {
  if (text === null || text === undefined) return null;
  const t = norm(String(text));
  if (/green|on track|good/.test(t)) return "OnTrack";
  if (/yellow|amber|watch|risk/.test(t)) return "Watch";
  if (/red|behind|off track|late/.test(t)) return "Behind";
  return null;
}

/** Job status from a Task Tracker Status or a Service Pipeline Job Stage; null = no work yet. */
export function cleanJobStatus(text: Cell): JobStatus | null {
  if (text === null || text === undefined) return null;
  const t = norm(String(text));
  if (/invoic|billed/.test(t)) return "Invoiced";
  if (/complete|done|finished|closed/.test(t)) return "Complete";
  // "Not started" must be checked before the positive "started".
  if (/not started|not yet|\bnew\b|pending|open/.test(t)) return "New";
  if (/progress|on site|working|started/.test(t)) return "InProgress";
  if (/schedul|booked/.test(t)) return "Scheduled";
  return null;
}

export const yes = (c: Cell) =>
  c === true ||
  c === 1 ||
  (typeof c === "string" && /^(true|yes|y|x|1|checked|✓|✔)$/i.test(c.trim()));

/** "$12,500.00", "12500", 0.35, "35%" -> number. Percent columns pass pct=true (0.35 -> 35). */
export function num(c: Cell, pct = false): number | null {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "boolean") return null;
  let n: number;
  if (typeof c === "number") n = c;
  else {
    const cleaned = c.replace(/[$,\s%]/g, "");
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
    n = Number(cleaned);
    if (pct && c.includes("%")) return n;
  }
  if (pct && Math.abs(n) <= 1) return Math.round(n * 1000) / 10;
  return n;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel serial number or a written date ("9/11/26", "2026-09-11") -> YYYY-MM-DD. */
export function date(c: Cell): string | null {
  if (c === null || c === undefined || typeof c === "boolean") return null;
  if (typeof c === "number") {
    if (c < 20000 || c > 80000) return null;
    const d = new Date(Math.round((c - 25569) * 86_400_000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = c.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  }
  return null;
}

const text = (c: Cell): string | null => {
  if (c === null || c === undefined) return null;
  if (typeof c === "number") return String(c);
  if (typeof c === "boolean") return c ? "Yes" : "No";
  const t = c.trim();
  return t === "" ? null : t;
};

/** Noon on a known date, or null: an unknown close date stays unknown (never invented). */
const noon = (d: string | null | undefined) => (d ? `${d}T12:00:00.000Z` : null);

/** Job statuses the importer sets, least to most finished. */
const STATUS_RANK: JobStatus[] = ["New", "Scheduled", "InProgress", "Complete", "Invoiced"];

// ---------------------------------------------------------------- sheets

type Row = { get: (header: string) => Cell; r: number; level: number; raw: SheetRow };

function headerRow(sheet: Sheet): { index: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(sheet.rows.length, 10); i++) {
    const h = sheet.rows[i]!.cells.map((c) => (typeof c === "string" ? c.trim() : ""));
    const set = new Set(h.map(norm));
    if (set.has("opportunity") || set.has("service opportunity") || set.has("task"))
      return { index: i, headers: h };
  }
  return null;
}

export function sheetKind(headers: string[]): SheetKind | null {
  const set = new Set(headers.map(norm));
  if (set.has("task") && (set.has("health") || set.has("start date"))) return "tasks";
  if (set.has("service opportunity")) return "service";
  if (set.has("opportunity")) return "sales";
  return null;
}

function rowsOf(sheet: Sheet, h: { index: number; headers: string[] }): Row[] {
  const col = new Map(h.headers.map((name, i) => [norm(name), i]));
  return sheet.rows.slice(h.index + 1).map((raw) => ({
    raw,
    r: raw.r,
    level: raw.level,
    get: (header: string) => {
      const i = col.get(norm(header));
      return i === undefined ? null : (raw.cells[i] ?? null);
    },
  }));
}

/**
 * Parent rows (headings such as "DeKalb Gov Service" or "Low Voltage") have only the primary
 * column filled, or rows indented under them. Returns, for each data row, the heading text
 * of every parent above it (nearest first).
 */
function withParents(rows: Row[], primary: string) {
  const out: { row: Row; parents: string[] }[] = [];
  const stack: { level: number; text: string }[] = [];
  rows.forEach((row, i) => {
    const filled = row.raw.cells.filter((c) => c !== null && c !== "").length;
    const name = text(row.get(primary));
    if (!name && filled === 0) return; // blank line
    const next = rows[i + 1];
    const hasChildren = !!next && next.level > row.level;
    // A name-only row is a heading when it names a contract or work type; otherwise it is an
    // incomplete record and is kept (never dropped silently).
    const headingOnly = !!name && filled === 1 && (!!cleanContract(name) || !!cleanType(name));
    while (stack.length && stack[stack.length - 1]!.level >= row.level) stack.pop();
    if (hasChildren || headingOnly) {
      if (name) stack.push({ level: row.level, text: name });
      // A name-only row with rows under it is a heading too, never a record of its own.
      if (headingOnly || filled === 1) return;
    }
    out.push({ row, parents: stack.map((s) => s.text).reverse() });
  });
  return out;
}

const firstOf = <T>(items: (T | null)[]) => items.find((x) => x !== null) ?? null;

// ---------------------------------------------------------------- the plan

const blankOpp = (): NewOpportunity => ({
  name: "",
  customerId: null,
  customerContract: "NonContract",
  type: "Service",
  stage: "Prospect",
  customerContact: null,
  invoiceContact: null,
  eciQuoteNumber: null,
  workOrderNumber: null,
  customerPoNumber: null,
  quoteDue: null,
  expectedClose: null,
  siteVisitDate: null,
  salesRep: null,
  priority: null,
  probability: null,
  hoursQuoted: null,
  quotedAmount: null,
  forecastAmount: null,
  jobCost: null,
  invoicedAmount: null,
  quotedMargin: null,
  completedMargin: null,
  notes: null,
  nextStep: null,
  nextStepDue: null,
  nextStepRemind: false,
  closedAt: null,
  jobId: null,
  importKey: null,
});

const joinNotes = (...parts: (string | null)[]) => {
  const t = parts.filter(Boolean).join("\n");
  return t === "" ? null : t;
};

export function buildImportPlan(files: { file: string; sheets: Sheet[] }[]): ImportPlan {
  const plan: ImportPlan = {
    sheets: [],
    opportunities: [],
    jobs: [],
    mergedServiceRows: 0,
    contractSpellings: [],
    warnings: [],
  };
  const spellings = new Map<string, { raw: string; contract: CustomerContract; rows: number }>();
  const noteSpelling = (raw: string | null, contract: CustomerContract | null) => {
    if (!raw || !contract) return;
    const s = spellings.get(raw) ?? { raw, contract, rows: 0 };
    s.rows++;
    spellings.set(raw, s);
  };
  const contractFrom = (candidates: (string | null)[]) => {
    for (const c of candidates) {
      const k = cleanContract(c);
      if (k) {
        noteSpelling(c, k);
        return k;
      }
    }
    return null;
  };

  const sheetsByKind: Record<SheetKind, { label: string; rows: ReturnType<typeof withParents> }[]> =
    { sales: [], service: [], tasks: [] };
  for (const f of files) {
    for (const s of f.sheets) {
      const h = headerRow(s);
      const kind = h ? sheetKind(h.headers) : null;
      const rows = h && kind ? rowsOf(s, h) : [];
      const primary =
        kind === "tasks" ? "Task" : kind === "service" ? "Service Opportunity" : "Opportunity";
      const parented = kind ? withParents(rows, primary) : [];
      plan.sheets.push({ file: f.file, sheet: s.name, kind, rows: parented.length });
      if (!kind) {
        plan.warnings.push(
          `${f.file} / ${s.name}: not a Sales Pipeline, Service Pipeline or Task Tracker sheet; skipped.`,
        );
        continue;
      }
      sheetsByKind[kind].push({ label: `${f.file} / ${s.name}`, rows: parented });
    }
  }

  /**
   * Choose the sales row a service or task row belongs to. Same-name rows of different
   * contracts are told apart by contract; when that still leaves several, the first is used
   * and the row is listed under "Check these" so nobody's numbers move silently.
   */
  const pickMatch = (
    candidates: PlannedOpportunity[],
    contract: CustomerContract | null,
    where: string,
  ): PlannedOpportunity | undefined => {
    if (candidates.length <= 1) return candidates[0];
    const same = contract ? candidates.filter((o) => o.data.customerContract === contract) : [];
    if (same.length === 1) return same[0];
    if (contract && same.length === 0) return undefined; // a different contract's work
    plan.warnings.push(
      `${where}: "${candidates[0]!.data.name}" matches ${candidates.length} sales rows; linked to the first (${candidates[0]!.sources[0]}). Check it.`,
    );
    return (same[0] ?? candidates[0])!;
  };

  // 1. Sales Pipeline
  const byName = new Map<string, PlannedOpportunity[]>();
  const index = (o: PlannedOpportunity) => {
    const k = matchName(o.data.name);
    byName.set(k, [...(byName.get(k) ?? []), o]);
  };
  for (const sheet of sheetsByKind.sales) {
    for (const { row, parents } of sheet.rows) {
      const name = text(row.get("Opportunity"));
      if (!name) continue;
      const typeText = text(row.get("Opportunity Type"));
      const status = text(row.get("Status"));
      const stage =
        cleanStage(row.get("Sales Stage") as string) ??
        cleanStage(status) ??
        (plan.warnings.push(
          `${sheet.label} row ${row.r}: stage "${text(row.get("Sales Stage")) ?? ""}" not recognised; set to 1 Prospect.`,
        ),
        "Prospect");
      const closedStage = stage === "ClosedWon" || stage === "ClosedLost" || stage === "NoBid";
      const created = date(row.get("Created"));
      const expectedClose = date(row.get("Expected Close Date"));
      const data: NewOpportunity = {
        ...blankOpp(),
        name,
        stage,
        type:
          cleanType(typeText) ??
          firstOf(parents.map(cleanType)) ??
          cleanType(sheet.label) ??
          "Service",
        customerContract: contractFrom([typeText, ...parents, name]) ?? "NonContract",
        customerContact: text(row.get("Customer Contact Name")),
        salesRep: text(row.get("Sales Rep")),
        probability: num(row.get("Probability"), true),
        hoursQuoted: num(row.get("Hours Quoted")),
        forecastAmount: num(row.get("Forecast Amount")),
        jobCost: num(row.get("Job Cost")),
        quoteDue: date(row.get("Quote Due by")),
        expectedClose,
        nextStep: text(row.get("Next Step")),
        notes: joinNotes(
          text(row.get("Notes")),
          status && !cleanStage(status) ? `Smartsheet status: ${status}` : null,
        ),
        closedAt: closedStage ? noon(expectedClose ?? created) : null,
        importKey: `sales:${norm(sheet.label)}:${row.r}:${matchName(name)}`,
      };
      const o: PlannedOpportunity = {
        key: data.importKey!,
        data,
        job: null,
        sources: [`${sheet.label} row ${row.r}`],
      };
      plan.opportunities.push(o);
      index(o);
    }
  }

  // 2. Service Pipeline: merge by name, else a new Service opportunity.
  const taken = new Set<PlannedOpportunity>();
  for (const sheet of sheetsByKind.service) {
    for (const { row, parents } of sheet.rows) {
      const name = text(row.get("Service Opportunity"));
      if (!name) continue;
      const contract = contractFrom([...parents, text(row.get("Opportunity Type")), name]);
      const match = pickMatch(
        (byName.get(matchName(name)) ?? []).filter((o) => !taken.has(o)),
        contract,
        `${sheet.label} row ${row.r}`,
      );
      const jobStageText = text(row.get("Job Stage"));
      const completedOn = date(row.get("Date Completed"));
      const jobStatus = cleanJobStatus(jobStageText) ?? (completedOn ? "Complete" : null);
      const salesStage = cleanStage(jobStageText) ?? cleanStage(row.get("Sales Stage") as string);
      const fill = (o: NewOpportunity): NewOpportunity => ({
        ...o,
        priority: o.priority ?? text(row.get("Priority")),
        invoiceContact: o.invoiceContact ?? text(row.get("Invoice Contact")),
        eciQuoteNumber: o.eciQuoteNumber ?? text(row.get("ECI Quote #")),
        customerPoNumber: o.customerPoNumber ?? text(row.get("Customer PO #")),
        quotedAmount: o.quotedAmount ?? num(row.get("Quoted Amount $")),
        invoicedAmount: o.invoicedAmount ?? num(row.get("Invoiced Amount $")),
        quotedMargin: o.quotedMargin ?? num(row.get("Quoted Margin"), true),
        completedMargin: o.completedMargin ?? num(row.get("Completed Margin"), true),
        siteVisitDate: o.siteVisitDate ?? date(row.get("Date(s) on Site")),
        customerContact: o.customerContact ?? text(row.get("Customer Contact Name")),
        salesRep: o.salesRep ?? text(row.get("Sales Rep")),
        notes: joinNotes(
          o.notes,
          text(row.get("Notes")),
          text(row.get("Date(s) on Site")) && !date(row.get("Date(s) on Site"))
            ? `Date(s) on site: ${text(row.get("Date(s) on Site"))}`
            : null,
        ),
        customerContract:
          o.customerContract === "NonContract" && contract ? contract : o.customerContract,
      });
      let target: PlannedOpportunity;
      if (match) {
        taken.add(match);
        plan.mergedServiceRows++;
        match.data = fill(match.data);
        match.sources.push(`${sheet.label} row ${row.r}`);
        target = match;
      } else {
        const stage: OpportunityStage = jobStatus ? "ClosedWon" : (salesStage ?? "Prospect");
        const data = fill({
          ...blankOpp(),
          name,
          type: "Service",
          stage,
          customerContract: contract ?? "NonContract",
          importKey: `service:${norm(sheet.label)}:${row.r}:${matchName(name)}`,
          closedAt: jobStatus ? noon(completedOn ?? date(row.get("Created"))) : null,
        });
        target = {
          key: data.importKey!,
          data,
          job: null,
          sources: [`${sheet.label} row ${row.r}`],
        };
        plan.opportunities.push(target);
        index(target);
        taken.add(target);
      }
      if (jobStatus) {
        if (target.data.stage !== "ClosedWon") {
          target.data.stage = "ClosedWon";
          target.data.closedAt ??= noon(completedOn);
        }
        target.job = {
          key: `job:${target.key}`,
          description: target.data.name,
          contract: target.data.customerContract,
          workType: target.data.type,
          status: jobStatus,
          health: null,
          startDate: target.data.siteVisitDate,
          endDate: completedOn,
          completedAt: completedOn ? `${completedOn}T17:00:00.000Z` : null,
          poReceived: !!target.data.customerPoNumber,
          materialOrdered: false,
          materialDelivered: false,
          liftConnex: false,
          serviceReportApproved: yes(row.get("Service Report Approved")),
          completionPhotosOnFile: yes(row.get("Completed Project Pics")),
          notes: null,
        };
      }
    }
  }

  // 3. Task Trackers: tracking on the matching opportunity's job, else a job of its own.
  for (const sheet of sheetsByKind.tasks) {
    for (const { row, parents } of sheet.rows) {
      const name = text(row.get("Task"));
      if (!name) continue;
      const contract = contractFrom([...parents, name]) ?? "NonContract";
      const workType = firstOf(parents.map(cleanType)) ?? cleanType(sheet.label) ?? "Service";
      const taskStatus = cleanJobStatus(row.get("Status")); // null when the cell is blank
      const status = taskStatus ?? "New";
      const assigned = text(row.get("Assigned To"));
      const tracking = {
        health: cleanHealth(row.get("Health")),
        startDate: date(row.get("Start Date")),
        endDate: date(row.get("End Date")),
        poReceived: yes(row.get("PO Received")),
        materialOrdered: yes(row.get("Material Ordered")),
        materialDelivered: yes(row.get("Material Delivered")),
        liftConnex: yes(row.get("Lift/Connex")),
      };
      const notes = joinNotes(
        text(row.get("Description")),
        assigned ? `Assigned to: ${assigned}` : null,
      );
      const match = pickMatch(
        byName.get(matchName(name)) ?? [],
        contract === "NonContract" ? null : contract,
        `${sheet.label} row ${row.r}`,
      );
      if (match) {
        const base: PlannedJob = match.job ?? {
          key: `job:${match.key}`,
          description: match.data.name,
          contract: match.data.customerContract,
          workType: match.data.type,
          status,
          health: null,
          startDate: null,
          endDate: null,
          completedAt: null,
          poReceived: !!match.data.customerPoNumber,
          materialOrdered: false,
          materialDelivered: false,
          liftConnex: false,
          serviceReportApproved: false,
          completionPhotosOnFile: false,
          notes: null,
        };
        // The task's parent rows can name the contract the sales row did not.
        if (match.data.customerContract === "NonContract" && contract !== "NonContract")
          match.data.customerContract = contract;
        const startDate = tracking.startDate ?? base.startDate; // blank task dates keep known ones
        const endDate = tracking.endDate ?? base.endDate;
        match.job = {
          ...base,
          contract: base.contract === "NonContract" ? contract : base.contract,
          ...tracking,
          health: tracking.health ?? base.health,
          // The further-along of the service status and the task's own (a blank task status
          // never sets known progress back).
          status:
            taskStatus && STATUS_RANK.indexOf(taskStatus) > STATUS_RANK.indexOf(base.status)
              ? taskStatus
              : base.status,
          startDate,
          endDate,
          completedAt: null, // set just below from the reconciled status
          poReceived: base.poReceived || tracking.poReceived,
          materialOrdered: base.materialOrdered || tracking.materialOrdered,
          materialDelivered: base.materialDelivered || tracking.materialDelivered,
          liftConnex: base.liftConnex || tracking.liftConnex,
          notes: joinNotes(base.notes, notes),
        };
        if (match.job.status === "Complete" || match.job.status === "Invoiced")
          match.job.completedAt = base.completedAt ?? (endDate ? `${endDate}T17:00:00.000Z` : null);
        match.sources.push(`${sheet.label} row ${row.r}`);
        if (match.data.stage !== "ClosedWon") {
          plan.warnings.push(
            `${sheet.label} row ${row.r}: task "${name}" matches an opportunity in stage "${match.data.stage}"; it is marked Closed won so the task can be its job.`,
          );
          match.data.stage = "ClosedWon";
          match.data.closedAt ??= noon(tracking.endDate ?? tracking.startDate);
        }
      } else {
        plan.jobs.push({
          key: `task:${row.r}:${matchName(name)}:${norm(sheet.label)}`,
          description: name,
          contract,
          workType,
          status,
          ...tracking,
          completedAt:
            status === "Complete" && tracking.endDate ? `${tracking.endDate}T17:00:00.000Z` : null,
          serviceReportApproved: false,
          completionPhotosOnFile: false,
          notes,
        });
      }
    }
  }

  plan.contractSpellings = [...spellings.values()].sort((a, b) => b.rows - a.rows);
  return plan;
}
