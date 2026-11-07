import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { EmptyState, PageHeader, SectionHeading, SummaryCard } from "@/components/eci/primitives";
import { money } from "@/components/serv1/billing/format";
import { OpenJobsChart } from "@/components/serv1/billing/OpenJobsChart";
import { dashboardStats } from "@/components/serv1/billing/dashboardStats";
import { useCurrentUser, useInvoices, useJobs, useUsers } from "@/data";
import { canSeeMoney, OFFICE_VIEW, requireRole } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/")({
  // Techs have no dashboard; their home is Today (SPEC.md section 13).
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_VIEW),
  component: Page,
});

function Page() {
  const jobs = useJobs();
  const invoices = useInvoices();
  const users = useUsers();
  const me = useCurrentUser();
  const showMoney = canSeeMoney(me.data?.role);

  const stats = useMemo(
    () => dashboardStats(jobs.data ?? [], invoices.data ?? []),
    [jobs.data, invoices.data],
  );
  const plural = (n: number) => `${n} invoice${n === 1 ? "" : "s"}`;

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Completed today" value={String(stats.completedToday)} />
        <SummaryCard label="Completed this week" value={String(stats.completedThisWeek)} />
        <SummaryCard
          label="Open jobs"
          value={String(stats.open)}
          hint="New, scheduled or in progress"
        />
        <SummaryCard
          label="Waiting to invoice"
          value={String(stats.waitingToInvoice)}
          hint="Complete, no invoice yet"
          to="/invoices"
        />
      </div>

      {showMoney ? (
        <section className="space-y-3">
          <SectionHeading title="Money by invoice status" />
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Draft (not yet sent)"
              value={money(stats.money.draft)}
              hint={plural(stats.counts.draft)}
            />
            <SummaryCard
              label="Sent, unpaid"
              value={money(stats.money.sentUnpaid)}
              hint={plural(stats.counts.sentUnpaid)}
            />
            <SummaryCard
              label="Paid"
              value={money(stats.money.paid)}
              hint={plural(stats.counts.paid)}
              hintTone="green"
            />
          </div>
        </section>
      ) : null}

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
