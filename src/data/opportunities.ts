import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend, nowIso } from "./backend";
import { keys } from "./hooks";
import { newJobNumber } from "./numbers";
import {
  JOB_TRACKING_DEFAULTS,
  type Job,
  type NewOpportunity,
  type Opportunity,
  type OpportunityStage,
} from "./types";

/** Business Services pipeline (Phase 2). Office edits, owner reads; techs have no access. */

export const useOpportunities = () =>
  useQuery<Opportunity[]>({
    queryKey: keys.table("opportunities"),
    queryFn: () => backend().opportunities.list(),
  });

export const useOpportunity = (id?: string) =>
  useQuery<Opportunity | null>({
    queryKey: keys.one("opportunities", id ?? ""),
    queryFn: () => backend().opportunities.get(id!),
    enabled: !!id,
  });

export function useOpportunityMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.table("opportunities") });
  const create = useMutation({
    mutationFn: (n: NewOpportunity) => backend().opportunities.create(n),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<NewOpportunity> }) =>
      backend().opportunities.update(v.id, closeStamp(v.patch)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => backend().opportunities.remove(id),
    onSuccess: refresh,
  });
  return { create, update, remove };
}

const CLOSED: OpportunityStage[] = ["ClosedWon", "ClosedLost", "NoBid"];
export const isClosedStage = (s: OpportunityStage) => CLOSED.includes(s);

/** Moving to a closed stage records when; reopening clears it. */
function closeStamp(patch: Partial<NewOpportunity>): Partial<NewOpportunity> {
  if (!patch.stage) return patch;
  return { ...patch, closedAt: isClosedStage(patch.stage) ? (patch.closedAt ?? nowIso()) : null };
}

/** A blank opportunity for the New form. */
export function emptyOpportunity(): NewOpportunity {
  return {
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
  };
}

/** The job a won opportunity becomes. Sales details stay on the opportunity; the job links to it. */
export function jobFromOpportunity(opp: Opportunity, customerId: string, siteId: string | null) {
  return {
    ...JOB_TRACKING_DEFAULTS,
    jobNumber: newJobNumber(),
    customerId,
    siteId,
    description: opp.name,
    jobType: opp.type === "Service" ? "Service call" : null,
    priority: "Normal" as const,
    status: "New" as const,
    assignedTechId: null,
    scheduledStart: null,
    scheduledEnd: null,
    startedAt: null,
    completedAt: null,
    notes: opp.notes,
    laborHours: null,
    opportunityId: opp.id,
    workType: opp.type,
    poReceived: !!opp.customerPoNumber,
  };
}

/** The one job for an opportunity when several exist: the earliest created (ties by id). */
const firstJob = (jobs: Job[]) =>
  [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];

/**
 * Closed Won: the opportunity becomes its job, with nothing typed twice. Safe to repeat, and safe
 * when two people click at once: after creating, every caller re-reads the jobs for this
 * opportunity, keeps the earliest and deletes its own extra, so all callers end on the same job.
 * The opportunity always takes the job's customer, so the two records never disagree.
 */
export async function winOpportunity(
  opportunityId: string,
  customerId: string,
  siteId: string | null = null,
): Promise<Job> {
  const b = backend();
  const opp = await b.opportunities.get(opportunityId);
  if (!opp) throw new Error("Opportunity not found");
  const linked = async () => (await b.jobs.list()).filter((j) => j.opportunityId === opp.id);

  let job = opp.jobId ? await b.jobs.get(opp.jobId) : null;
  if (!job) job = firstJob(await linked()) ?? null;
  if (!job) {
    const mine = await b.jobs.create(jobFromOpportunity(opp, customerId, siteId));
    job = firstJob(await linked()) ?? mine;
    if (job.id !== mine.id) await b.jobs.remove(mine.id); // someone else won the race
  }
  await b.opportunities.update(opp.id, {
    stage: "ClosedWon",
    closedAt: opp.closedAt ?? nowIso(),
    jobId: job.id,
    customerId: job.customerId,
  });
  return job;
}

export function useWinOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { opportunityId: string; customerId: string; siteId?: string | null }) =>
      winOpportunity(v.opportunityId, v.customerId, v.siteId ?? null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table("opportunities") });
      void qc.invalidateQueries({ queryKey: keys.table("jobs") });
    },
  });
}
