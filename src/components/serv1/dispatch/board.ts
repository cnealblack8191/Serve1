import { visitLabel, type Job, type VisitEntry } from "@/data";

/** Drag payload type, so the board ignores unrelated drags (files, text). */
export const JOB_DRAG_TYPE = "application/x-serv1-job";

/** "J-1042", or "J-1042 · Visit 2 of 3" for one visit of a multi-visit job (docs/VISITS.md). */
export function jobLabel(job: Job) {
  const base = job.jobNumber ?? "Job";
  const e = job as Partial<VisitEntry>;
  const visit = e.visit && e.visitCount !== undefined ? visitLabel(e as VisitEntry) : null;
  return visit ? `${base} · ${visit}` : base;
}

/** The drag and React key of a card: one per visit on the timeline. */
export const cardId = (job: Job) => (job as Partial<VisitEntry>).entryId ?? job.id;
