import { backend } from "./backend";
import { newJobNumber } from "./numbers";
import { JOB_TRACKING_DEFAULTS, type CustomerContract, type NewJob } from "./types";
import type { ImportPlan, PlannedJob } from "@/lib/import/smartsheet";

/** Customer names for imported work (one customer per contract; edit them later). */
export const CONTRACT_CUSTOMER: Record<CustomerContract, string> = {
  DeKalbGov: "DeKalb Gov.",
  GwinnettSchools: "Gwinnett Schools",
  RockdaleGov: "Rockdale Gov.",
  BarrowSchools: "Barrow Schools",
  DecaturCitySchools: "Decatur City Schools",
  DeKalbSchools: "DeKalb Schools",
  NonContract: "Non-contract customers (imported)",
};

/** Marks an imported job in its notes so a second run can find and skip it. */
const tag = (key: string) => `[import ${key}]`;

export interface ImportResult {
  opportunitiesCreated: number;
  jobsCreated: number;
  customersCreated: number;
  skipped: number;
}

/**
 * Writes an import plan through the normal backend (so every access rule still applies).
 * Safe to run twice: opportunities are matched by importKey and jobs by their import tag.
 */
export async function runImport(
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const b = backend();
  const result: ImportResult = {
    opportunitiesCreated: 0,
    jobsCreated: 0,
    customersCreated: 0,
    skipped: 0,
  };
  const total = plan.opportunities.length + plan.jobs.length;
  let done = 0;
  const step = () => onProgress?.(++done, total);

  const existingOpps = new Map(
    (await b.opportunities.list()).filter((o) => o.importKey).map((o) => [o.importKey!, o]),
  );
  const jobs = await b.jobs.list();
  const existingJobKeys = new Set(
    jobs.flatMap((j) => [...(j.notes ?? "").matchAll(/\[import ([^\]]+)\]/g)].map((m) => m[1]!)),
  );

  const customers = await b.customers.list();
  const customerFor = new Map<CustomerContract, string>();
  const ensureCustomer = async (c: CustomerContract) => {
    const known = customerFor.get(c);
    if (known) return known;
    const name = CONTRACT_CUSTOMER[c];
    let found = customers.find((x) => x.name === name);
    if (!found) {
      found = await b.customers.create({
        name,
        billingAddress: null,
        phone: null,
        email: null,
        notes: "Created by the Smartsheet import. Rename or merge as needed.",
      });
      customers.push(found);
      result.customersCreated++;
    }
    customerFor.set(c, found.id);
    return found.id;
  };

  const makeJob = async (j: PlannedJob, opportunityId: string | null): Promise<string | null> => {
    if (existingJobKeys.has(j.key)) return null;
    const input: NewJob = {
      ...JOB_TRACKING_DEFAULTS,
      jobNumber: newJobNumber(),
      customerId: await ensureCustomer(j.contract),
      siteId: null,
      description: j.description,
      jobType: j.workType === "Service" ? "Service call" : null,
      priority: "Normal",
      status: j.status,
      assignedTechId: null,
      scheduledStart: null,
      scheduledEnd: null,
      startedAt: null,
      completedAt: j.completedAt,
      notes: [tag(j.key), j.notes].filter(Boolean).join("\n"),
      laborHours: null,
      opportunityId,
      workType: j.workType,
      health: j.health,
      startDate: j.startDate,
      endDate: j.endDate,
      poReceived: j.poReceived,
      materialOrdered: j.materialOrdered,
      materialDelivered: j.materialDelivered,
      liftConnex: j.liftConnex,
      serviceReportApproved: j.serviceReportApproved,
      completionPhotosOnFile: j.completionPhotosOnFile,
    };
    const job = await b.jobs.create(input);
    existingJobKeys.add(j.key);
    result.jobsCreated++;
    return job.id;
  };

  for (const o of plan.opportunities) {
    let opp = existingOpps.get(o.key);
    if (opp) result.skipped++;
    else {
      opp = await b.opportunities.create(o.data);
      result.opportunitiesCreated++;
    }
    if (o.job && !opp.jobId) {
      const jobId = await makeJob(o.job, opp.id);
      if (jobId)
        await b.opportunities.update(opp.id, {
          jobId,
          customerId: opp.customerId ?? (await ensureCustomer(o.job.contract)),
        });
    }
    step();
  }
  for (const j of plan.jobs) {
    if ((await makeJob(j, null)) === null) result.skipped++;
    step();
  }
  return result;
}
