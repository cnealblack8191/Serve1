import { ACTIVE_STATUSES, isFinished, type Invoice, type Job, type JobStatus } from "@/data";

/** Jobs still being worked: not yet finished. Complete jobs are "waiting to invoice", not open. */
export const OPEN_STATUSES: JobStatus[] = ACTIVE_STATUSES;

export interface DashboardStats {
  completedToday: number;
  completedThisWeek: number;
  open: number;
  waitingToInvoice: number;
  byStatus: { status: JobStatus; count: number }[];
  /** Money by invoice status. Draft is not yet billed; Sent is billed and unpaid; Paid is collected. */
  money: { draft: number; sentUnpaid: number; paid: number };
  counts: { draft: number; sentUnpaid: number; paid: number };
}

/** Pure so it can be unit tested. Weeks run Monday to Sunday in local time. */
export function dashboardStats(jobs: Job[], invoices: Invoice[], now = new Date()): DashboardStats {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));

  const finished = jobs.filter((j) => isFinished(j.status));
  const doneSince = (since: Date) =>
    finished.filter((j) => j.completedAt && new Date(j.completedAt) >= since).length;
  const invoicedJobs = new Set(invoices.map((i) => i.jobId));

  const sum = (status: Invoice["status"]) =>
    invoices.filter((i) => i.status === status).reduce((s, i) => s + i.total, 0);
  const count = (status: Invoice["status"]) => invoices.filter((i) => i.status === status).length;

  return {
    completedToday: doneSince(startOfDay),
    completedThisWeek: doneSince(startOfWeek),
    open: jobs.filter((j) => OPEN_STATUSES.includes(j.status)).length,
    waitingToInvoice: jobs.filter(
      (j) => (j.status === "Complete" || j.status === "Reviewed") && !invoicedJobs.has(j.id),
    ).length,
    byStatus: OPEN_STATUSES.map((status) => ({
      status,
      count: jobs.filter((j) => j.status === status).length,
    })),
    money: { draft: sum("Draft"), sentUnpaid: sum("Sent"), paid: sum("Paid") },
    counts: { draft: count("Draft"), sentUnpaid: count("Sent"), paid: count("Paid") },
  };
}
