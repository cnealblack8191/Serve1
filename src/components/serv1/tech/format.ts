import type { Job } from "@/data";

/** Small helpers shared by the tech screens. */

export const OPEN_STATUSES: Job["status"][] = ["New", "Scheduled", "InProgress"];

export function isToday(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export const byStart = (a: Job, b: Job) =>
  (a.scheduledStart ?? "9999").localeCompare(b.scheduledStart ?? "9999");

export function timeRange(job: Job): string {
  if (!job.scheduledStart) return "Not scheduled";
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return job.scheduledEnd
    ? `${t(job.scheduledStart)} – ${t(job.scheduledEnd)}`
    : t(job.scheduledStart);
}

export function dayLabel(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Opens the phone's map app (Google Maps link works on iPhone and Android browsers). */
export const directionsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
