import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend } from "./backend";
import { keys } from "./hooks";
import { newJobNumber } from "./numbers";
import {
  JOB_TRACKING_DEFAULTS,
  type Attachment,
  type Customer,
  type Invoice,
  type Job,
  type NewJob,
  type Opportunity,
  type Signature,
  type Site,
  type SpectrumCheck,
  type TableName,
} from "./types";
import {
  SPECTRUM_ERROR_TEXT,
  type CredentialsInput,
  type SpectrumAddress,
  type SpectrumErrorCode,
  type SpectrumJob,
  type SpectrumOperation,
  type SpectrumOps,
  type SpectrumReply,
  type SpectrumWorkOrder,
} from "../../amplify/functions/spectrum/contract";

export type {
  CredentialsInput,
  CredentialsStatus,
  SpectrumAuthMode,
  SpectrumErrorCode,
  SpectrumJob,
  SpectrumWorkOrder,
  TestResult,
} from "../../amplify/functions/spectrum/contract";
export {
  isAuthorizationId,
  isCompanyCode,
  isOperatorCode,
  isRecordNumber,
  isSpectrumAddress,
  isStatusCode,
} from "../../amplify/functions/spectrum/contract";

/**
 * Spectrum (Phase 4, Serv1's side of the connector, API.md section 5). Screens use these;
 * the connector itself is reached only through backend().spectrum (server-side on Amplify,
 * a synthetic fake in the local demo).
 */

/** A refusal turned into an Error that screens can show (fixed, safe text only). */
export class SpectrumError extends Error {
  constructor(readonly code: SpectrumErrorCode) {
    super(spectrumErrorText(code));
    this.name = "SpectrumError";
  }
}

/** What to tell the person. "Spectrum unavailable, try again later" for the outage codes. */
export function spectrumErrorText(code: SpectrumErrorCode): string {
  if (code === "not_configured")
    return "Spectrum is not set up yet. An admin can save the credentials in Settings › Integrations › Spectrum.";
  return SPECTRUM_ERROR_TEXT[code] ?? SPECTRUM_ERROR_TEXT.internal;
}

async function call<O extends SpectrumOperation>(
  op: O,
  params: SpectrumOps[O]["params"],
): Promise<SpectrumOps[O]["data"]> {
  const reply = (await backend().spectrum.call(op, params)) as SpectrumReply<O>;
  if (!reply.ok) throw new SpectrumError(reply.error.code);
  return reply.data as SpectrumOps[O]["data"];
}

// ---- Settings › Integrations › Spectrum (Admin) --------------------------------------------

const statusKey = ["serv1", "spectrum", "status"] as const;

export const useSpectrumStatus = (enabled = true) =>
  useQuery({
    queryKey: statusKey,
    queryFn: () => call("credentials.status", {}),
    enabled,
    retry: false,
  });

/** Newest first. */
export const useSpectrumChecks = (enabled = true) =>
  useQuery<SpectrumCheck[]>({
    queryKey: keys.table("spectrumChecks"),
    queryFn: async () =>
      (await backend().spectrumChecks.list()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    enabled,
  });

/**
 * Saves the credentials through the connector. savedBy is the signed-in admin from the
 * session (the server sets it again from the token). Values are passed straight through:
 * never stored, cached or logged here.
 */
export async function saveSpectrumCredentials(input: CredentialsInput) {
  const me = await backend().auth.currentUser();
  const params: SpectrumOps["credentials.save"]["params"] = {
    address: input.address.trim().replace(/\/+$/, ""),
    companyCode: input.companyCode.trim(),
    authorizationId: input.authorizationId.trim(),
    authMode: input.authMode,
    savedBy: (me?.name || me?.email || "").slice(0, 100),
  };
  const operator = input.operatorCode?.trim();
  if (operator) params.operatorCode = operator;
  return call("credentials.save", params);
}

/** Refreshes the credentials status after a save (the save itself is not a cached mutation). */
export const spectrumStatusKey = statusKey;

/** Runs credentials.test and records the outcome (the connector keeps none). */
export async function testSpectrumConnection(): Promise<SpectrumCheck> {
  const me = await backend().auth.currentUser();
  const reply = await backend().spectrum.call("credentials.test", {});
  const checkedBy = me?.name || me?.email || "Admin";
  const record = reply.ok
    ? reply.data.result === "connected"
      ? {
          result: "connected" as const,
          reason: null,
          message: null,
          durationMs: reply.data.durationMs,
        }
      : {
          result: "failed" as const,
          reason: reply.data.reason,
          message: spectrumErrorText(reply.data.reason),
          durationMs: reply.data.durationMs,
        }
    : {
        // A refusal (e.g. not_configured) is not a test result, but it is still worth showing.
        result: "failed" as const,
        reason: reply.error.code,
        message: spectrumErrorText(reply.error.code),
        durationMs: null,
      };
  return backend().spectrumChecks.create({ ...record, checkedBy });
}

export function useTestSpectrumConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: testSpectrumConnection,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.table("spectrumChecks") }),
  });
}

// ---- Import from Spectrum (Admin and Office) -----------------------------------------------

export type SpectrumKind = "jobs" | "workOrders";

export interface SpectrumList<R> {
  records: R[];
  truncated: boolean;
}

export async function listSpectrumJobs(status?: string): Promise<SpectrumList<SpectrumJob>> {
  return call("jobs.list", status ? { status } : {});
}

export async function listSpectrumWorkOrders(filter: {
  status?: string;
  jobNumber?: string;
}): Promise<SpectrumList<SpectrumWorkOrder>> {
  const params: SpectrumOps["workOrders.list"]["params"] = {};
  if (filter.status) params.status = filter.status;
  if (filter.jobNumber) params.jobNumber = filter.jobNumber;
  return call("workOrders.list", params);
}

/** The Serv1 job imported from this Spectrum job (company code + job number), if any. */
export const jobMatch = (jobs: Job[], companyCode: string, jobNumber: string) =>
  jobs.find(
    (j) =>
      j.spectrumCompanyCode === companyCode &&
      j.spectrumJobNumber === jobNumber &&
      !j.spectrumWorkOrderNumber,
  ) ?? null;

/** The Serv1 job imported from this Spectrum work order (company code + work order number). */
export const workOrderMatch = (jobs: Job[], companyCode: string, workOrderNumber: string) =>
  jobs.find(
    (j) => j.spectrumCompanyCode === companyCode && j.spectrumWorkOrderNumber === workOrderNumber,
  ) ?? null;

export const recordMatch = (jobs: Job[], r: SpectrumJob | SpectrumWorkOrder) =>
  "workOrderNumber" in r
    ? workOrderMatch(jobs, r.companyCode, r.workOrderNumber)
    : jobMatch(jobs, r.companyCode, r.jobNumber);

/** One-line address for a Serv1 site, or null when Spectrum sent none. */
export function formatAddress(a: SpectrumAddress): string | null {
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const s = [a.line1, a.line2, cityLine].filter(Boolean).join(", ");
  return s || null;
}

/**
 * Fixed ids for imported rows, built from the match key. Creating a row with an id that already
 * exists fails in the database (both backends), so two people importing the same Spectrum
 * record at the same moment get one row, not two (Codex review of PR #17).
 */
const key = (...parts: string[]) => parts.map(encodeURIComponent).join(":");
export const spectrumIds = {
  job: (cc: string, jobNumber: string) => `spectrum:${key(cc, "job", jobNumber)}`,
  workOrder: (cc: string, won: string) => `spectrum:${key(cc, "wo", won)}`,
  customer: (cc: string, code: string | null, name: string) =>
    `spectrum:${key(cc, "customer", code ?? `name ${name}`)}`,
  site: (cc: string, customerId: string, address: string) =>
    `spectrum:${key(cc, "site", customerId, address)}`,
};

/**
 * Creates the row with a fixed id, or returns the row already there when someone else created
 * it first. `created` says which.
 */
async function createOnce<T, N>(
  repo: { create(n: N, o?: { id?: string }): Promise<T>; get(id: string): Promise<T | null> },
  id: string,
  input: N,
): Promise<{ row: T; created: boolean }> {
  try {
    return { row: await repo.create(input, { id }), created: true };
  } catch (e) {
    const existing = await repo.get(id).catch(() => null);
    if (existing) return { row: existing, created: false };
    throw e;
  }
}

export interface SpectrumImportResult {
  jobsCreated: number;
  customersCreated: number;
  sitesCreated: number;
  alreadyImported: number;
  /** Records that could not be imported, with the reason (e.g. a work order with no job). */
  skipped: { number: string; reason: string }[];
}

/**
 * Imports the chosen Spectrum records as Serv1 customers, sites and jobs (through the normal
 * backend, so every access rule applies). Records keep their company code and Spectrum
 * numbers; a record already imported is skipped, so running it twice is safe.
 */
export async function importFromSpectrum(
  records: (SpectrumJob | SpectrumWorkOrder)[],
  onProgress?: (done: number, total: number) => void,
): Promise<SpectrumImportResult> {
  const b = backend();
  const result: SpectrumImportResult = {
    jobsCreated: 0,
    customersCreated: 0,
    sitesCreated: 0,
    alreadyImported: 0,
    skipped: [],
  };
  const [jobs, customers, sites] = await Promise.all([
    b.jobs.list(),
    b.customers.list(),
    b.sites.list(),
  ]);
  const parents = new Map<string, SpectrumJob | null>(); // Spectrum job lookups for work orders

  const ensureCustomer = async (cc: string, c: SpectrumJob["customer"]) => {
    const name = c.name ?? (c.code ? `Spectrum customer ${c.code}` : "Spectrum customer");
    const found = customers.find(
      (x) =>
        x.spectrumCompanyCode === cc &&
        (c.code ? x.spectrumCustomerCode === c.code : !x.spectrumCustomerCode && x.name === name),
    );
    if (found) return found;
    const { row: created, created: isNew } = await createOnce(
      b.customers,
      spectrumIds.customer(cc, c.code, name),
      {
        name,
        billingAddress: null,
        phone: null,
        email: null,
        notes: `Imported from Spectrum (company ${cc}${c.code ? `, customer ${c.code}` : ""}).`,
        spectrumCompanyCode: cc,
        spectrumCustomerCode: c.code,
      },
    );
    customers.push(created);
    if (isNew) result.customersCreated++;
    return created;
  };

  const ensureSite = async (
    cc: string,
    customerId: string,
    name: string | null,
    a: SpectrumAddress,
  ) => {
    const address = formatAddress(a);
    if (!address) return null;
    const found = sites.find(
      (s) => s.spectrumCompanyCode === cc && s.customerId === customerId && s.address === address,
    );
    if (found) return found;
    const { row: created, created: isNew } = await createOnce(
      b.sites,
      spectrumIds.site(cc, customerId, address),
      {
        customerId,
        name,
        address,
        accessNotes: null,
        spectrumCompanyCode: cc,
      },
    );
    sites.push(created);
    if (isNew) result.sitesCreated++;
    return created;
  };

  const parentJob = async (cc: string, jobNumber: string): Promise<SpectrumJob | null> => {
    const k = `${cc}|${jobNumber}`;
    if (!parents.has(k)) {
      try {
        parents.set(k, (await call("jobs.get", { jobNumber })).record);
      } catch (e) {
        if (e instanceof SpectrumError && e.code === "not_found") parents.set(k, null);
        else throw e;
      }
    }
    return parents.get(k) ?? null;
  };

  const base = (): Omit<NewJob, "customerId" | "siteId" | "description" | "notes"> => ({
    ...JOB_TRACKING_DEFAULTS,
    jobNumber: newJobNumber(),
    jobType: null,
    priority: "Normal",
    status: "New",
    assignedTechId: null,
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: null,
    completedAt: null,
    laborHours: null,
  });
  const lines = (...l: (string | false | null)[]) => l.filter(Boolean).join("\n");

  for (const [done, r] of records.entries()) {
    onProgress?.(done, records.length);
    if (recordMatch(jobs, r)) {
      result.alreadyImported++;
      continue;
    }
    const cc = r.companyCode;
    let job: NewJob;
    if ("workOrderNumber" in r) {
      // A work order has no customer of its own: it belongs to its Spectrum job's customer.
      const parentInServ1 = r.jobNumber ? jobMatch(jobs, cc, r.jobNumber) : null;
      let customerId = parentInServ1?.customerId ?? null;
      if (!customerId && r.jobNumber) {
        const parent = await parentJob(cc, r.jobNumber);
        if (parent && parent.companyCode !== cc) {
          // Spectrum was switched to another company since this list was looked up: never mix
          // two companies' records (Codex review of PR #17).
          result.skipped.push({
            number: r.workOrderNumber,
            reason: `Spectrum is now set to company ${parent.companyCode}; look the work orders up again`,
          });
          continue;
        }
        if (parent) customerId = (await ensureCustomer(cc, parent.customer)).id;
      }
      if (!customerId) {
        result.skipped.push({
          number: r.workOrderNumber,
          reason: r.jobNumber
            ? `Spectrum job ${r.jobNumber} was not found`
            : "the work order has no Spectrum job",
        });
        continue;
      }
      const site = await ensureSite(cc, customerId, r.site.name, r.site);
      job = {
        ...base(),
        customerId,
        siteId: site?.id ?? null,
        description: r.description ?? `Spectrum work order ${r.workOrderNumber}`,
        startDate: r.dates.scheduled,
        notes: lines(
          `Imported from Spectrum: company ${cc}, work order ${r.workOrderNumber}${r.jobNumber ? `, job ${r.jobNumber}` : ""}.`,
          r.status && `Spectrum status: ${r.status}.`,
          r.assignedTechnician && `Spectrum technician: ${r.assignedTechnician}.`,
          r.dates.entered && `Entered in Spectrum: ${r.dates.entered}.`,
          r.dates.completed && `Completed in Spectrum: ${r.dates.completed}.`,
        ),
        spectrumCompanyCode: cc,
        spectrumJobNumber: r.jobNumber,
        spectrumWorkOrderNumber: r.workOrderNumber,
      };
    } else {
      const customer = await ensureCustomer(cc, r.customer);
      const site = await ensureSite(cc, customer.id, r.jobName, r.address);
      job = {
        ...base(),
        customerId: customer.id,
        siteId: site?.id ?? null,
        description: r.jobName ?? `Spectrum job ${r.jobNumber}`,
        notes: lines(
          `Imported from Spectrum: company ${cc}, job ${r.jobNumber}.`,
          r.status && `Spectrum status: ${r.status}.`,
          r.projectManager && `Spectrum project manager: ${r.projectManager}.`,
        ),
        spectrumCompanyCode: cc,
        spectrumJobNumber: r.jobNumber,
        spectrumWorkOrderNumber: null,
      };
    }
    const id =
      "workOrderNumber" in r
        ? spectrumIds.workOrder(cc, r.workOrderNumber)
        : spectrumIds.job(cc, r.jobNumber);
    const { row, created } = await createOnce(b.jobs, id, job);
    jobs.push(row);
    if (created) result.jobsCreated++;
    else result.alreadyImported++;
  }
  onProgress?.(records.length, records.length);
  return result;
}

// ---- Remove test imports (Admin) -----------------------------------------------------------

export interface RemovalPlan {
  companyCode: string;
  jobs: Job[];
  sites: Site[];
  customers: Customer[];
  /** Imported records left in place because work was added to them in Serv1. */
  kept: { label: string; reason: string }[];
}

export interface RemovalInput {
  jobs: Job[];
  sites: Site[];
  customers: Customer[];
  invoices: Invoice[];
  attachments: Attachment[];
  signatures: Signature[];
  opportunities: Opportunity[];
}

/**
 * What "Remove test imports" would delete for one company code: every job, site and customer
 * imported from it, except records that work done in Serv1 still points at (an invoice,
 * photo, signature or opportunity, or a record that is not from this import). Those are kept
 * and listed, so nothing made in Serv1 is lost or left pointing at a deleted record.
 */
export function planRemoval(companyCode: string, t: RemovalInput): RemovalPlan {
  const cc = companyCode.trim();
  const kept: RemovalPlan["kept"] = [];
  const jobLabel = (j: Job) =>
    `${j.jobNumber ? `Job ${j.jobNumber}` : "Job"} (Spectrum ${
      j.spectrumWorkOrderNumber
        ? `work order ${j.spectrumWorkOrderNumber}`
        : `job ${j.spectrumJobNumber ?? ""}`
    })`;

  const jobs: Job[] = [];
  for (const j of t.jobs) {
    if (!cc || j.spectrumCompanyCode !== cc) continue;
    const why = t.invoices.some((i) => i.jobId === j.id)
      ? "it has an invoice"
      : t.attachments.some((a) => a.jobId === j.id)
        ? "it has photos or files"
        : t.signatures.some((s) => s.jobId === j.id)
          ? "it has a signature"
          : j.opportunityId || t.opportunities.some((o) => o.jobId === j.id)
            ? "it is linked to an opportunity"
            : null;
    if (why) kept.push({ label: jobLabel(j), reason: why });
    else jobs.push(j);
  }
  const removing = new Set(jobs.map((j) => j.id));
  const remainingJobs = t.jobs.filter((j) => !removing.has(j.id));

  const sites: Site[] = [];
  for (const s of t.sites) {
    if (!cc || s.spectrumCompanyCode !== cc) continue;
    if (remainingJobs.some((j) => j.siteId === s.id))
      kept.push({ label: `Site ${s.name ?? s.address}`, reason: "a job that stays uses it" });
    else sites.push(s);
  }
  const removingSites = new Set(sites.map((s) => s.id));

  const customers: Customer[] = [];
  for (const c of t.customers) {
    if (!cc || c.spectrumCompanyCode !== cc) continue;
    const why = remainingJobs.some((j) => j.customerId === c.id)
      ? "a job that stays belongs to it"
      : t.sites.some((s) => s.customerId === c.id && !removingSites.has(s.id))
        ? "a site that stays belongs to it"
        : t.invoices.some((i) => i.customerId === c.id)
          ? "it has an invoice"
          : t.opportunities.some((o) => o.customerId === c.id)
            ? "an opportunity uses it"
            : null;
    if (why) kept.push({ label: `Customer ${c.name}`, reason: why });
    else customers.push(c);
  }
  return { companyCode: cc, jobs, sites, customers, kept };
}

/** Loads every table the removal plan needs (Admin reads all of them). */
export async function loadRemovalPlan(companyCode: string): Promise<RemovalPlan> {
  const b = backend();
  const [jobs, sites, customers, invoices, attachments, signatures, opportunities] =
    await Promise.all([
      b.jobs.list(),
      b.sites.list(),
      b.customers.list(),
      b.invoices.list(),
      b.attachments.list(),
      b.signatures.list(),
      b.opportunities.list(),
    ]);
  return planRemoval(companyCode, {
    jobs,
    sites,
    customers,
    invoices,
    attachments,
    signatures,
    opportunities,
  });
}

/**
 * Deletes what the plan lists, jobs first, then sites, then customers, re-checking the plan
 * first so records added since the count was shown are never removed by surprise.
 */
export async function removeTestImports(
  shown: RemovalPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<{ removed: number; changed: boolean }> {
  const fresh = await loadRemovalPlan(shown.companyCode);
  const ids = (p: RemovalPlan) =>
    // Ids and last-changed times: an edit to a counted record (notes, schedule, assignment)
    // also means the admin must count again (Codex review of PR #17).
    [...p.jobs, ...p.sites, ...p.customers]
      .map((r) => `${r.id}@${r.updatedAt}`)
      .sort()
      .join(",");
  if (ids(fresh) !== ids(shown)) return { removed: 0, changed: true };
  const b = backend();
  const total = fresh.jobs.length + fresh.sites.length + fresh.customers.length;
  let removed = 0;
  const tick = () => {
    removed++;
    onProgress?.(removed, total);
  };
  for (const j of fresh.jobs) await b.jobs.remove(j.id).then(tick);
  for (const s of fresh.sites) await b.sites.remove(s.id).then(tick);
  for (const c of fresh.customers) await b.customers.remove(c.id).then(tick);
  return { removed, changed: false };
}

/** Tables a Spectrum import or removal changes, for refreshing screens afterwards. */
export const SPECTRUM_TABLES: TableName[] = ["jobs", "sites", "customers"];
