/** ECI is an electrical contractor: the job types the office picks from on New job. */
export const JOB_TYPES = [
  "Service call",
  "Troubleshoot",
  "Panel/breaker",
  "Lighting",
  "Install/new circuit",
  "Inspection",
  "Generator",
  "Emergency",
] as const;

export type JobType = (typeof JOB_TYPES)[number];
