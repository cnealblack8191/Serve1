import type { Visit } from "@/data";

/** "Tue, Nov 10, 8:00 AM – 12:00 PM" for a visit. */
export function visitWhen(v: Pick<Visit, "scheduledStart" | "scheduledEnd">): string {
  if (!v.scheduledStart) return "Not scheduled";
  const s = new Date(v.scheduledStart);
  const day = s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return v.scheduledEnd ? `${day}, ${t(s)} – ${t(new Date(v.scheduledEnd))}` : `${day}, ${t(s)}`;
}
