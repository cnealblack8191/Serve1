import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend, nowIso } from "./backend";
import { keys } from "./hooks";
import type { Job, JobStatus, NewJob, NewVisit, TableName, Visit, VisitStatus } from "./types";

/**
 * Multi-visit jobs (docs/VISITS.md). One job can need several trips, each with its own date, time,
 * tech and status. The change is additive:
 *  - Visit rows hold the plan (office) and each trip's progress (that trip's tech).
 *  - A job with no live Visit rows is one visit built from its own schedule fields, so every
 *    older record works unchanged (visitsOf).
 *  - The job's status follows its current visit (the first one still open), so the existing
 *    status flow, office review and billing keep working on the job.
 *  - Job.visitTechIds lists every tech with a visit; each of them may read the job, its visits,
 *    and its photos, signature and notes (read-only for work that is not theirs).
 */

/**
 * Hold reason used when a tech ends a visit and another trip is needed but none is planned. The
 * same words as the ECI1 phone's "return_visit" hold (amplify/functions/eci1-tech-bridge/core.ts),
 * so both mean the same to the office. The tech's words go in holdNote.
 */
export const RETURN_NEEDED = "Needs a return visit";
export const isReturnHold = (job: Pick<Job, "status" | "holdReason">) =>
  job.status === "OnHold" && job.holdReason === RETURN_NEEDED;

export const OPEN_VISIT_STATUSES: VisitStatus[] = ["Scheduled", "EnRoute", "InProgress", "OnHold"];
export const isOpenVisit = (v: Pick<Visit, "status">) => OPEN_VISIT_STATUSES.includes(v.status);

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  Scheduled: "Scheduled",
  EnRoute: "On the way",
  InProgress: "In progress",
  OnHold: "On hold",
  Done: "Done",
  Cancelled: "Cancelled",
};

/** The visit status a job status stands for (used for jobs with no Visit rows). */
export function visitStatusOf(job: Pick<Job, "status" | "holdReason">): VisitStatus {
  switch (job.status) {
    case "New":
    case "Scheduled":
      return "Scheduled";
    case "EnRoute":
    case "InProgress":
      return job.status;
    case "OnHold":
      return isReturnHold(job) ? "Done" : "OnHold";
    case "Cancelled":
      return "Cancelled";
    default:
      return "Done";
  }
}

/** A job with no Visit rows, seen as its one visit. Its id is never stored. */
export function impliedVisit(job: Job): Visit {
  return {
    id: `${job.id}#1`,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    jobId: job.id,
    number: 1,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    assignedTechId: job.assignedTechId,
    jobTechIds: job.visitTechIds ?? (job.assignedTechId ? [job.assignedTechId] : null),
    status: visitStatusOf(job),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    holdReason: job.status === "OnHold" ? job.holdReason : null,
    note: null,
  };
}

const byNumber = (a: Visit, b: Visit) => a.number - b.number;

/** Stored visits of one job that are not cancelled, in order. */
export const liveVisitRows = (jobId: string, visits: Visit[]) =>
  visits.filter((v) => v.jobId === jobId && v.status !== "Cancelled").sort(byNumber);

/** A job's visits in order. A job without live Visit rows is one implied visit. */
export function visitsOf(job: Job, visits: Visit[]): { visits: Visit[]; implied: boolean } {
  const rows = liveVisitRows(job.id, visits);
  return rows.length
    ? { visits: rows, implied: false }
    : { visits: [impliedVisit(job)], implied: true };
}

/** The visit work is on now: the first one still open, or null when all are done. */
export const currentVisit = (visits: Visit[]): Visit | null => visits.find(isOpenVisit) ?? null;

/**
 * How the office schedules a job from its page: move its open visit, add a visit (it has visits
 * but none open, e.g. reopened after a cancel), or patch the job as before (no visits).
 */
export function scheduleMode(job: Job, visits: Visit[]): "reschedule" | "add" | "job" {
  const rows = liveVisitRows(job.id, visits);
  if (!rows.length) return "job";
  return currentVisit(rows) ? "reschedule" : "add";
}

/** True when no other visit of the job is still open: finishing this one can complete the job. */
export const isLastOpenVisit = (visits: Visit[], visit: Visit) =>
  visits.filter(isOpenVisit).every((v) => v.id === visit.id);

/** The job status a visit shows on the board and the tech's list. */
function entryStatus(visit: Visit, job: Job): JobStatus {
  switch (visit.status) {
    case "Scheduled":
    case "EnRoute":
    case "InProgress":
    case "OnHold":
      return visit.status;
    case "Cancelled":
      return "Cancelled";
    default:
      // A finished visit of a finished job shows the job's own billing step.
      return ["Complete", "Reviewed", "Invoiced", "Paid"].includes(job.status)
        ? job.status
        : "Complete";
  }
}

/**
 * One visit, shaped like a job for the board and the tech's lists: the job's details with this
 * visit's schedule, tech and status. `id` stays the job's id; `entryId` is unique per visit.
 */
export type VisitEntry = Job & {
  visit: Visit;
  visitCount: number;
  implied: boolean;
  entryId: string;
};

export const visitLabel = (e: Pick<VisitEntry, "visit" | "visitCount" | "implied">) =>
  e.implied || e.visitCount < 2 ? null : `Visit ${e.visit.number} of ${e.visitCount}`;

export function visitEntries(jobs: Job[], visits: Visit[]): VisitEntry[] {
  const out: VisitEntry[] = [];
  for (const job of jobs) {
    const { visits: vs, implied } = visitsOf(job, visits);
    if (implied) {
      out.push({ ...job, visit: vs[0]!, visitCount: 1, implied, entryId: job.id });
      continue;
    }
    for (const v of vs) {
      out.push({
        ...job,
        assignedTechId: v.assignedTechId,
        scheduledStart: v.scheduledStart,
        scheduledEnd: v.scheduledEnd,
        status: entryStatus(v, job),
        visit: v,
        visitCount: vs.length,
        implied,
        entryId: `${job.id}~${v.id}`,
      });
    }
  }
  return out;
}

/**
 * The job as it stands now: schedule and tech of its current visit. The job's own schedule fields
 * follow the visits only when the office saves them, so office views use this.
 */
export function withCurrentVisit(job: Job, visits: Visit[]): Job {
  const { visits: vs, implied } = visitsOf(job, visits);
  if (implied) return job;
  const cur = currentVisit(vs) ?? vs[vs.length - 1]!;
  return {
    ...job,
    assignedTechId: cur.assignedTechId,
    scheduledStart: cur.scheduledStart,
    scheduledEnd: cur.scheduledEnd,
  };
}

// ---------------------------------------------------------------- writes

const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
const sameIds = (a: string[] | null | undefined, b: string[] | null | undefined) =>
  JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

async function rowsOf(jobId: string): Promise<Visit[]> {
  return (await backend().visits.list()).filter((v) => v.jobId === jobId).sort(byNumber);
}

/**
 * Office: keep the job in step with its visits. The job's tech and schedule become those of the
 * current visit, visitTechIds lists every tech with a live visit, and every visit and every photo,
 * signature and note on the job carries that list (so those techs may read them).
 */
export async function syncJobWithVisits(jobId: string): Promise<void> {
  const b = backend();
  const job = await b.jobs.get(jobId);
  if (!job) return;
  const all = await rowsOf(jobId);
  const live = all.filter((v) => v.status !== "Cancelled");
  if (!live.length) return;
  const techs = unique(live.map((v) => v.assignedTechId));
  const cur = currentVisit(live) ?? live[live.length - 1]!;
  const patch: Partial<NewJob> = {};
  if (!sameIds(job.visitTechIds, techs)) patch.visitTechIds = techs;
  if (job.assignedTechId !== cur.assignedTechId) patch.assignedTechId = cur.assignedTechId;
  if (job.scheduledStart !== cur.scheduledStart) patch.scheduledStart = cur.scheduledStart;
  if (job.scheduledEnd !== cur.scheduledEnd) patch.scheduledEnd = cur.scheduledEnd;
  // A newly planned visit puts a waiting job (new, or held for a return trip) back on the schedule.
  if (
    cur.status === "Scheduled" &&
    (job.status === "New" || isReturnHold(job)) &&
    isOpenVisit(cur)
  ) {
    patch.status = "Scheduled";
    patch.holdReason = null;
    patch.holdNote = null;
  }
  if (Object.keys(patch).length) await b.jobs.update(jobId, patch);
  for (const v of all)
    if (!sameIds(v.jobTechIds, techs)) await b.visits.update(v.id, { jobTechIds: techs });
  const tag = async <R extends { id: string; jobId: string; jobTechIds?: string[] | null }>(repo: {
    list(): Promise<R[]>;
    update(id: string, p: object): Promise<unknown>;
  }) => {
    for (const r of await repo.list())
      if (r.jobId === jobId && !sameIds(r.jobTechIds, techs))
        await repo.update(r.id, { jobTechIds: techs });
  };
  await tag(b.attachments);
  await tag(b.signatures);
  await tag(b.techNotes);
}

/**
 * Office: the job's visit rows, writing visit 1 from the job's own schedule first when the job
 * has none yet (its first extra visit turns it into a multi-visit job).
 */
async function ensureVisitRows(job: Job): Promise<Visit[]> {
  const all = await rowsOf(job.id);
  if (all.some((v) => v.status !== "Cancelled") || !job.scheduledStart || !job.assignedTechId)
    return all;
  const { id: _id, createdAt: _c, updatedAt: _u, ...first } = impliedVisit(job);
  const v = await backend().visits.create(first);
  return [...all, v].sort(byNumber);
}

export interface VisitPlan {
  assignedTechId: string;
  start: Date;
  minutes: number;
}

const planFields = (p: VisitPlan) => ({
  assignedTechId: p.assignedTechId,
  scheduledStart: p.start.toISOString(),
  scheduledEnd: new Date(p.start.getTime() + p.minutes * 60_000).toISOString(),
});

/** Office: add a visit to a job (the job's first one too, from its own schedule). */
export async function addVisit(job: Job, plan: VisitPlan): Promise<Visit> {
  const rows = await ensureVisitRows(job);
  const number = Math.max(0, ...rows.map((v) => v.number)) + 1;
  const techs = unique([
    ...rows.filter(isOpenVisit).map((v) => v.assignedTechId),
    plan.assignedTechId,
  ]);
  const input: NewVisit = {
    jobId: job.id,
    number,
    ...planFields(plan),
    jobTechIds: techs,
    status: "Scheduled",
    startedAt: null,
    completedAt: null,
    holdReason: null,
    note: null,
  };
  const v = await backend().visits.create(input);
  await syncJobWithVisits(job.id);
  return v;
}

/** Office: move or reassign a visit that has not started. */
export async function rescheduleVisit(visit: Visit, plan: VisitPlan): Promise<Visit> {
  if (visit.status !== "Scheduled")
    throw new Error("Only a visit that has not started can be moved.");
  const v = await backend().visits.update(visit.id, planFields(plan));
  await syncJobWithVisits(visit.jobId);
  return v;
}

/** Office: drop a visit that has not started. The job keeps at least one visit. */
export async function removeVisit(visit: Visit): Promise<void> {
  if (visit.status !== "Scheduled")
    throw new Error("Only a visit that has not started can be removed.");
  const live = liveVisitRows(visit.jobId, await rowsOf(visit.jobId));
  if (live.length < 2)
    throw new Error("A job keeps at least one visit. Unschedule the job instead.");
  await backend().visits.update(visit.id, { status: "Cancelled" });
  await syncJobWithVisits(visit.jobId);
  // Only finished visits left on unfinished work: hold it for a return visit, so the office sees
  // it needs planning (Codex review of PR #21).
  if (!live.some((v) => v.id !== visit.id && isOpenVisit(v))) {
    const job = await backend().jobs.get(visit.jobId);
    if (job && ["New", "Scheduled", "EnRoute"].includes(job.status))
      await backend().jobs.update(job.id, {
        status: "OnHold",
        holdReason: RETURN_NEEDED,
        holdNote: null,
      });
  }
}

/**
 * A job status change, mirrored onto its current visit (jobs with Visit rows only). Used for
 * every status move (src/data/jobflow.ts) and for Complete after the signature. The visit is
 * written first, so a refused visit change leaves the job as it was.
 */
export async function updateJobWithVisit(job: Job, patch: Partial<NewJob>): Promise<Job> {
  const b = backend();
  const to = patch.status;
  if (to !== undefined && to !== job.status) {
    const live = liveVisitRows(job.id, await rowsOf(job.id));
    if (live.length) {
      const cur = currentVisit(live);
      if (to === "Cancelled") {
        for (const v of live.filter(isOpenVisit))
          await b.visits.update(v.id, { status: "Cancelled" });
      } else if (to === "Complete") {
        if (cur)
          await b.visits.update(cur.id, {
            status: "Done",
            completedAt: patch.completedAt ?? nowIso(),
          });
      } else if (to === "Scheduled" || to === "EnRoute" || to === "InProgress" || to === "OnHold") {
        // Sent back after Complete: the last visit is the one reopened.
        const v = cur ?? live[live.length - 1]!;
        await b.visits.update(v.id, {
          status: to,
          ...(to === "InProgress" && !v.startedAt ? { startedAt: nowIso() } : {}),
          holdReason: to === "OnHold" ? (patch.holdReason ?? null) : null,
          ...(v.status === "Done" ? { completedAt: null } : {}),
        });
      }
    }
  }
  return b.jobs.update(job.id, patch);
}

/**
 * Tech (or office): end the current visit with another trip needed. With a later visit planned the
 * job goes back to Scheduled for it; with none, the job goes On hold ("Return visit needed") for
 * the office to plan one. Never completes the job (that is Job complete, with the signature).
 */
export async function finishVisit(job: Job, note: string | null): Promise<Job> {
  const b = backend();
  const words = note?.trim() || null;
  const live = liveVisitRows(job.id, await rowsOf(job.id));
  const cur = currentVisit(live);
  const hold: Partial<NewJob> = { status: "OnHold", holdReason: RETURN_NEEDED, holdNote: words };
  if (!live.length || !cur) return b.jobs.update(job.id, hold);
  await b.visits.update(cur.id, { status: "Done", completedAt: nowIso(), note: words });
  const more = live.some((v) => v.id !== cur.id && isOpenVisit(v));
  return b.jobs.update(
    job.id,
    more ? { status: "Scheduled", holdReason: null, holdNote: null } : hold,
  );
}

// ---------------------------------------------------------------- hooks

const VISIT_TABLES: TableName[] = ["visits", "jobs", "attachments", "signatures", "techNotes"];
function useRefreshVisits() {
  const qc = useQueryClient();
  return () =>
    Promise.all(VISIT_TABLES.map((t) => qc.invalidateQueries({ queryKey: keys.table(t) })));
}

export const useVisits = () =>
  useQuery<Visit[]>({ queryKey: keys.table("visits"), queryFn: () => backend().visits.list() });

export function useVisitActions() {
  const refresh = useRefreshVisits();
  const add = useMutation({
    mutationFn: (v: { job: Job; plan: VisitPlan }) => addVisit(v.job, v.plan),
    onSettled: refresh,
  });
  const reschedule = useMutation({
    mutationFn: (v: { visit: Visit; plan: VisitPlan }) => rescheduleVisit(v.visit, v.plan),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (visit: Visit) => removeVisit(visit),
    onSettled: refresh,
  });
  const finish = useMutation({
    mutationFn: (v: { job: Job; note: string | null }) => finishVisit(v.job, v.note),
    onSettled: refresh,
  });
  /** A job update that also moves its current visit (status changes, Complete after signing). */
  const updateJob = useMutation({
    mutationFn: (v: { job: Job; patch: Partial<NewJob> }) => updateJobWithVisit(v.job, v.patch),
    onSettled: refresh,
  });
  return { add, reschedule, remove, finish, updateJob };
}
