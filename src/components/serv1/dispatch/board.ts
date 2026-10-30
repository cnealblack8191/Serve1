import type { Job } from "@/data";

/** Drag payload type, so the board ignores unrelated drags (files, text). */
export const JOB_DRAG_TYPE = "application/x-serv1-job";

export function jobLabel(job: Job) {
  return job.jobNumber ?? "Job";
}
