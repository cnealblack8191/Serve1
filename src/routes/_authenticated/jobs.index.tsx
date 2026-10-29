import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, SectionHeading, StatusBadge, SummaryCard } from "@/components/eci/primitives";
import { money, useEci } from "@/lib/eci/store";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({
    meta: [
      { title: "Jobs & Work Orders — ECI Operations" },
      {
        name: "description",
        content:
          "All active ECI jobs with customer, project address, division, assigned manager, Spectrum job number and open work orders.",
      },
      { property: "og:title", content: "Jobs & Work Orders — ECI Operations" },
      {
        property: "og:description",
        content: "Track every electrical job and its open work orders in one list.",
      },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { jobs, workOrders } = useEci();
  const navigate = useNavigate();
  const open = workOrders.filter((w) => w.status !== "Complete");
  const openJob = (id: string) => navigate({ to: "/jobs/$id", params: { id } });
  const rowKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openJob(id);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Jobs & Work Orders"
        description="Active electrical construction and service work across every division."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Active jobs" value={String(jobs.filter((j) => j.status === "Active").length)} />
        <SummaryCard label="Open work orders" value={String(open.length)} />
        <SummaryCard
          label="Contract value"
          value={money(jobs.reduce((s, j) => s + j.contractValue, 0))}
        />
        <SummaryCard
          label="Spectrum sync issues"
          value={String(jobs.filter((j) => j.spectrumSync === "Failed").length)}
          hint="Retry available"
          hintTone="copper"
          accent
        />
      </div>

      <div className="eci-card overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["Job", "Customer", "Manager", "Open WOs", "Spectrum #", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {jobs.map((j) => (
              <tr
                key={j.id}
                onClick={() => openJob(j.id)}
                onKeyDown={rowKey(j.id)}
                tabIndex={0}
                role="link"
                aria-label={`Open job ${j.name}`}
                className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-medium">{j.name}</span>
                  <div className="text-xs text-muted-foreground">{j.phase}</div>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{j.customer}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{j.manager}</td>
                <td className="px-6 py-4 text-sm">
                  {open.filter((w) => w.jobId === j.id).length}
                </td>
                <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                  {j.spectrumNumber}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={j.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-6">
        <SectionHeading title="Open Work Orders" />
        <div className="eci-card overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["Work Order", "Job", "Technician", "Scheduled", "Priority", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {open.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => openJob(w.jobId)}
                  onKeyDown={rowKey(w.jobId)}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open work order ${w.number}`}
                  className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium">
                      {w.number} — {w.title}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {jobs.find((j) => j.id === w.jobId)?.name ?? w.jobId}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{w.technician}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{w.scheduled}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={w.priority} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={w.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
