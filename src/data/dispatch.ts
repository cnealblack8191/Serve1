import type { Job, NewJob } from "./types";

/**
 * Dispatch board helpers (lane "dispatch"). Pure functions only: the board reads
 * jobs with useJobs() and writes with useJobMutations(); these shape the data.
 */

/** Board hours (SPEC.md section 11): 7:00 to 18:00 in 30-minute steps. */
export const DISPATCH_DAY_START_HOUR = 7;
export const DISPATCH_DAY_END_HOUR = 18;
export const DISPATCH_SLOT_MINUTES = 30;
/** New appointments last two hours until someone edits them. */
export const DISPATCH_DEFAULT_HOURS = 2;

/** Minutes after midnight for every slot start: 420 (7:00) … 1050 (17:30). */
export function dispatchSlots(): number[] {
  const out: number[] = [];
  for (
    let m = DISPATCH_DAY_START_HOUR * 60;
    m < DISPATCH_DAY_END_HOUR * 60;
    m += DISPATCH_SLOT_MINUTES
  )
    out.push(m);
  return out;
}

/** A local-time Date for `day` at `minutes` after midnight. */
export function atMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** The Unscheduled queue: status New and nobody assigned (SPEC.md W1). */
export function isUnscheduled(job: Job): boolean {
  return job.status === "New" && !job.assignedTechId;
}

/** Only jobs nobody has started yet can be dragged or reassigned. */
export function canDispatch(job: Job): boolean {
  return job.status === "New" || job.status === "Scheduled";
}

/** Jobs on one tech's timeline for one day. */
export function jobsForTechOnDay(jobs: Job[], techIdentityId: string, day: Date): Job[] {
  return jobs
    .filter(
      (j) =>
        j.assignedTechId === techIdentityId &&
        !!j.scheduledStart &&
        sameLocalDay(new Date(j.scheduledStart), day),
    )
    .sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!));
}

/** Length of a job in minutes, or the default when it has no end yet. */
export function jobDurationMinutes(job: Job): number {
  if (job.scheduledStart && job.scheduledEnd) {
    const ms = new Date(job.scheduledEnd).getTime() - new Date(job.scheduledStart).getTime();
    if (ms > 0) return Math.round(ms / 60_000);
  }
  return DISPATCH_DEFAULT_HOURS * 60;
}

/**
 * The update that puts a job on a tech's schedule (SPEC.md W2). A job moved
 * from one slot to another keeps its length; a new one gets the default.
 */
export function schedulePatch(
  job: Job,
  techIdentityId: string,
  start: Date,
  durationMinutes = job.scheduledStart ? jobDurationMinutes(job) : DISPATCH_DEFAULT_HOURS * 60,
): Partial<NewJob> {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    assignedTechId: techIdentityId,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    status: "Scheduled",
  };
}

/** Sends a scheduled job back to the Unscheduled queue. */
export function unschedulePatch(): Partial<NewJob> {
  return { assignedTechId: null, scheduledStart: null, scheduledEnd: null, status: "New" };
}

/** "9:30 AM" for a slot. */
export function formatSlot(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Minutes after midnight in local time. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "2026-10-30" for <input type="date">, in local time. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
