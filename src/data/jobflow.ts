import { useMutation, useQueryClient } from "@tanstack/react-query";

import { backend, nowIso } from "./backend";
import { keys } from "./hooks";
import type { Job, JobStatus, NewJob, Role } from "./types";

/**
 * Job status moves (Phase 3). One table so the tech screen, the office job page and the
 * backends agree on who may move a job where.
 */
export type JobAction =
  "enRoute" | "start" | "hold" | "resume" | "approve" | "sendBack" | "cancel" | "reopen";

interface Move {
  from: JobStatus[];
  to: JobStatus;
  /** Who may do it. Admin and Office may always do what a tech may. */
  by: "tech" | "office";
  /** A reason is required (hold, send back, cancel). */
  needsReason?: boolean;
}

export const JOB_MOVES: Record<JobAction, Move> = {
  enRoute: { from: ["New", "Scheduled", "OnHold"], to: "EnRoute", by: "tech" },
  start: { from: ["New", "Scheduled", "EnRoute"], to: "InProgress", by: "tech" },
  hold: { from: ["EnRoute", "InProgress"], to: "OnHold", by: "tech", needsReason: true },
  resume: { from: ["OnHold"], to: "InProgress", by: "tech" },
  approve: { from: ["Complete"], to: "Reviewed", by: "office" },
  sendBack: { from: ["Complete", "Reviewed"], to: "InProgress", by: "office", needsReason: true },
  cancel: {
    from: ["New", "Scheduled", "EnRoute", "InProgress", "OnHold", "Complete", "Reviewed"],
    to: "Cancelled",
    by: "office",
    needsReason: true,
  },
  reopen: { from: ["Cancelled"], to: "New", by: "office" },
};

/** Statuses a tech may set on their own job (Complete is set by the signature step). */
export const TECH_SETTABLE: JobStatus[] = ["EnRoute", "InProgress", "OnHold", "Complete"];

/**
 * Whether a tech may move their job from the stored status `from` to `to`: one of the tech
 * moves above, or In progress -> Complete (signature). Checked against the saved job, so a
 * stale screen cannot, for example, restart a job the office cancelled.
 */
export function techMayMove(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  if (from === "InProgress" && to === "Complete") return true;
  return Object.values(JOB_MOVES).some(
    (m) => m.by === "tech" && m.to === to && m.from.includes(from),
  );
}

const isOfficeRole = (r: Role | undefined) => r === "Admin" || r === "Office";

export function canMove(job: Job, action: JobAction, role: Role | undefined): boolean {
  const m = JOB_MOVES[action];
  if (!m.from.includes(job.status)) return false;
  return m.by === "tech" ? role === "Tech" || isOfficeRole(role) : isOfficeRole(role);
}

/** The update for a move. */
export function movePatch(job: Job, action: JobAction, reason?: string): Partial<NewJob> {
  const m = JOB_MOVES[action];
  const why = reason?.trim() || null;
  if (m.needsReason && !why) throw new Error("Please give a reason.");
  switch (action) {
    case "start":
      return { status: m.to, startedAt: job.startedAt ?? nowIso(), holdReason: null };
    case "resume":
      return { status: m.to, holdReason: null };
    case "hold":
    case "cancel":
      return { status: m.to, holdReason: why };
    case "approve":
      return { status: m.to, reviewedAt: nowIso(), reviewNote: null };
    case "sendBack":
      // With nobody assigned (e.g. imported work) the job goes back to New so it can be
      // scheduled; otherwise straight back to the tech's In progress list.
      return {
        status: job.assignedTechId ? m.to : "New",
        reviewNote: why,
        reviewedAt: null,
        completedAt: null,
      };
    case "reopen":
      return {
        status: m.to,
        holdReason: null,
        assignedTechId: null,
        scheduledStart: null,
        scheduledEnd: null,
      };
    default:
      return { status: m.to };
  }
}

export function useJobMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { job: Job; action: JobAction; reason?: string }) =>
      backend().jobs.update(v.job.id, movePatch(v.job, v.action, v.reason)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table("jobs") }),
  });
}
