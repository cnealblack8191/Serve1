import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";

import { EmptyState, PageHeader, SectionHeading, SummaryCard } from "@/components/eci/primitives";
import { money } from "@/components/serv1/billing/format";
import { OpenJobsChart } from "@/components/serv1/billing/OpenJobsChart";
import { useInvoices, useJobs, useUsers, type JobStatus } from "@/data";

export const Route = createFileRoute("/_authenticated/")({
  // Techs have no dashboard; their home is Today (SPEC.md section 13).
  beforeLoad: ({ context }) => {
    if (context.user.role === "Tech") throw redirect({ to: "/tech", replace: true });
  },
  component: Page,
});

const OPEN_STATUSES: JobStatus[] = ["New", "Scheduled", "InProgress", "Complete"];

function Page() {
  const jobs = useJobs();
  const invoices = useInvoices();
  const users = useUsers();

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Week runs Monday to Sunday.
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));

    const allJobs = jobs.data ?? [];
    const allInvoices = invoices.data ?? [];
    const doneAt = (j: (typeof allJobs)[number]) =>
      j.completedAt ? new Date(j.completedAt) : null;
    const finished = allJobs.filter((j) => j.status === "Complete" || j.status === "Invoiced");

    return {
      today: finished.filter((j) => (doneAt(j) ?? 0) >= startOfDay).length,
      week: finished.filter((j) => (doneAt(j) ?? 0) >= startOfWeek).length,
      weekRevenue: allInvoices
        .filter((i) => new Date(i.createdAt) >= startOfWeek)
        .reduce((s, i) => s + i.total, 0),
      totalRevenue: allInvoices.reduce((s, i) => s + i.total, 0),
      open: allJobs.filter((j) => j.status !== "Invoiced").length,
      byStatus: OPEN_STATUSES.map((status) => ({
        status,
        count: allJobs.filter((j) => j.status === status).length,
      })),
    };
  }, [jobs.data, invoices.data]);

  const techRows = (users.data ?? [])
    .filter((u) => u.role === "Tech" && u.active)
    .map((u) => {
      const mine = (jobs.data ?? []).filter((j) => j.assignedTechId === u.identityId);
      return {
        id: u.id,
        name: u.name,
        open: mine.filter((j) => j.status !== "Complete" && j.status !== "Invoiced").length,
        completed: mine.filter((j) => j.status === "Complete" || j.status === "Invoiced").length,
      };
    });

  return (
    <>
      <PageHeader title="Dashboard" description="Jobs, revenue and workload at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Completed today" value={String(stats.today)} />
        <SummaryCard label="Completed this week" value={String(stats.week)} />
        <SummaryCard label="Invoiced this week" value={money(stats.weekRevenue)} />
        <SummaryCard label="Invoiced total" value={money(stats.totalRevenue)} />
        <SummaryCard label="Open jobs" value={String(stats.open)} />
      </div>

      <section className="space-y-3">
        <SectionHeading title="Open jobs by status" />
        <div className="eci-card p-4">
          {stats.open === 0 ? (
            <EmptyState title="No open jobs" hint="New jobs will appear here by status." />
          ) : (
            <OpenJobsChart counts={stats.byStatus} />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Jobs per tech" />
        {techRows.length === 0 ? (
          <EmptyState title="No technicians yet" />
        ) : (
          <div className="eci-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Technician</th>
                  <th className="p-3 text-right">Open</th>
                  <th className="p-3 text-right">Completed</th>
                </tr>
              </thead>
              <tbody>
                {techRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/70 last:border-0">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-right tabular-nums">{r.open}</td>
                    <td className="p-3 text-right tabular-nums">{r.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
