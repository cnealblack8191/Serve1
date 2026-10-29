import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/eci/AppShell";
import { RevenueByDivision } from "@/components/eci/RevenueByDivision";
import {
  PageHeader,
  SectionHeading,
  StatusBadge,
  SummaryCard,
} from "@/components/eci/primitives";
import { seedActivityFeed } from "@/lib/eci/data";
import { bidTotals, money, useEci } from "@/lib/eci/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Company Dashboard — ECI Operations" },
      {
        name: "description",
        content:
          "Company-wide view of opportunities, bids, active jobs, work orders, revenue, invoices, material requests and overdue alerts.",
      },
      { property: "og:title", content: "Company Dashboard — ECI Operations" },
      {
        property: "og:description",
        content:
          "Operational health and project metrics across every ECI division in one dashboard.",
      },
    ],
  }),
  component: Dashboard,
});

const STAGES = [
  "New Opportunity",
  "Bid or No-Bid Decision",
  "Approved to Estimate",
] as const;

function Dashboard() {
  const navigate = useNavigate();
  const openJob = (id: string) => navigate({ to: "/jobs/$id", params: { id } });
  const { role, roleReady, can, opportunities, bids, jobs, workOrders, materials, invoices } =
    useEci();

  // Wait for the account role to load before deciding where this user lands.
  if (!roleReady) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-muted-foreground">Loading your dashboard…</p>
      </AppShell>
    );
  }
  // Roles without a dashboard (Coordinator, Field) land on their home board.
  if (!can("dashboard")) {
    return <Navigate to={can("crm") ? "/crm" : "/field"} replace />;
  }
  if (role === "Service Manager") return <ServiceManagerOverview />;
  if (role === "AP/AR") return <ReceivablesOverview />;

  const activeBids = bids.filter((b) => !["Won", "Lost"].includes(b.stage));
  const bidValue = activeBids.reduce((s, b) => s + bidTotals(b.lineItems).sell, 0);
  const openWos = workOrders.filter((w) => w.status !== "Complete");
  const outstanding = invoices
    .filter((i) => !["Paid", "Draft"].includes(i.status))
    .reduce((s, i) => s + i.balance, 0);
  const overdue = invoices.filter((i) => i.status === "Overdue");
  const revenue = jobs.reduce((s, j) => s + j.contractValue, 0);

  return (
    <AppShell>
      <PageHeader
        title="Company Overview"
        description="Operational health and project metrics across all ECI divisions."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="New Opportunities"
          to="/crm"
          value={String(opportunities.filter((o) => o.stage === "New Opportunity").length)}
          hint="+3 from last week"
          hintTone="green"
          chartValue={opportunities.filter((o) => o.stage === "New Opportunity").length}
          chartTotal={opportunities.length}
          chartLabel="New opportunities as a share of all opportunities"
        />
        <SummaryCard
          label="Active Bids"
          to="/bids"
          value={String(activeBids.length)}
          hint={`${money(bidValue)} potential`}
          chartValue={activeBids.length}
          chartTotal={bids.length}
          chartLabel="Active bids as a share of all bids"
        />
        <SummaryCard
          label="Active Jobs"
          to="/jobs"
          value={String(jobs.filter((j) => j.status === "Active").length)}
          hint="84% on schedule"
          chartValue={jobs.filter((j) => j.status === "Active").length}
          chartTotal={jobs.length}
          chartLabel="Active jobs as a share of all jobs"
        />
        <SummaryCard
          label="Open Work Orders"
          to="/jobs"
          value={String(openWos.length)}
          hint={`${openWos.filter((w) => w.priority === "Priority 1").length} priority items`}
          hintTone="amber"
          chartValue={openWos.length}
          chartTotal={workOrders.length}
          chartLabel="Open work orders as a share of all work orders"
        />
        <SummaryCard
          label="Contracted Revenue"
          to="/jobs"
          value={money(revenue)}
          hint="12% above goal"
          hintTone="green"
          chartValue={revenue}
          chartTotal={revenue + bidValue}
          chartLabel="Contracted revenue as a share of contracted and active bid value"
        />
        <SummaryCard
          label="Outstanding Invoices"
          to="/invoices"
          value={money(outstanding)}
          hint={`${money(overdue.reduce((s, i) => s + i.balance, 0))} overdue`}
          hintTone="amber"
          chartValue={outstanding}
          chartTotal={invoices.reduce((s, i) => s + i.amount, 0)}
          chartLabel="Outstanding balance as a share of all invoiced value"
        />
        <SummaryCard
          label="Open Material Requests"
          to="/materials"
          value={String(materials.filter((m) => m.status !== "Delivered").length)}
          hint={`${materials.filter((m) => !m.poNumber).length} awaiting PO`}
          chartValue={materials.filter((m) => m.status !== "Delivered").length}
          chartTotal={materials.length}
          chartLabel="Open material requests as a share of all material requests"
        />
        <SummaryCard
          label="Overdue Tasks & Alerts"
          to="/alerts"
          value={String(overdue.length + jobs.filter((j) => j.spectrumSync === "Failed").length)}
          hint="Action required"
          hintTone="copper"
          accent
          chartValue={overdue.length + jobs.filter((j) => j.spectrumSync === "Failed").length}
          chartTotal={invoices.length + jobs.length}
          chartLabel="Overdue tasks and alerts as a share of monitored records"
        />
      </div>

      <section className="space-y-6">
        <SectionHeading title="Opportunity Pipeline" action="Open CRM" to="/crm" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STAGES.map((stage) => {
            const items = opportunities
              .filter((o) => o.stage === stage)
              .sort((a, b) => b.value - a.value);
            const top = items.slice(0, 4);
            const remaining = items.length - top.length;
            return (
              <Link
                key={stage}
                to="/crm"
                className="block rounded-xl bg-black/[0.025] p-3 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eci-copper"
                aria-label={`Open CRM filtered to ${stage}`}
              >
                <div className="flex items-center justify-between px-1.5 pb-2 text-sm font-medium">
                  <span>{stage}</span>
                  <span className="text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {top.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-lg bg-card p-3 ring-1 ring-black/5"
                    >
                      <p className="text-sm font-medium leading-snug">{o.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {o.customer} · {money(o.value)}
                      </p>
                    </div>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1.5 py-4 text-xs text-muted-foreground">Nothing in this stage.</p>
                  ) : null}
                </div>
                {remaining > 0 ? (
                  <p className="px-1.5 pt-2 text-xs font-medium text-eci-copper">
                    +{remaining} more in CRM →
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SectionHeading title="Active Jobs & Work Orders" action="View all" to="/jobs" />
          <div className="eci-card overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Job Name / Phase
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Spectrum #
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => openJob(j.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openJob(j.id);
                      }
                    }}
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
                    <td className="px-6 py-4">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                      {j.spectrumNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionHeading
            title="Revenue by Division"
            description="Job contract value across all five divisions."
          />
          <RevenueByDivision jobs={jobs} />

          <SectionHeading title="Revenue & Invoice Status" action="Open accounting" to="/invoices" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(["Sent", "Partially Paid", "Overdue"] as const).map((s) => {
              const rows = invoices.filter((i) => i.status === s);
              return (
                <div key={s} className="eci-card space-y-2 p-5">
                  <StatusBadge status={s} />
                  <p className="text-2xl font-semibold">
                    {money(rows.reduce((t, i) => t + i.balance, 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">{rows.length} invoices</p>
                </div>
              );
            })}
          </div>

          <SectionHeading title="Recent Material Requests" action="View all" to="/materials" />
          <div className="eci-card divide-y divide-black/5">
            {materials.slice(0, 4).map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="text-sm font-medium">{m.item}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.qty} · {m.jobName} · {m.workOrder}
                  </p>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8 xl:col-span-4">
          <div className="space-y-6">
            <SectionHeading title="Alerts & Overdue Tasks" action="View all" to="/alerts" />
            <div className="space-y-3">
              {overdue.map((i) => (
                <div key={i.id} className="rounded-lg bg-red-50 p-3">
                  <p className="text-sm font-medium">Invoice #{i.number} overdue</p>
                  <p className="text-xs text-muted-foreground">
                    {money(i.balance)} · {i.customer}
                  </p>
                </div>
              ))}
              {bids
                .filter((b) => b.stage === "Awaiting Approval")
                .map((b) => (
                  <Link
                    key={b.id}
                    to="/bids/$id"
                    params={{ id: b.id }}
                    className="block rounded-lg bg-amber-50 p-3"
                  >
                    <p className="text-sm font-medium">Quote awaiting approval</p>
                    <p className="text-xs text-muted-foreground">{b.name}</p>
                  </Link>
                ))}
              {jobs
                .filter((j) => j.spectrumSync === "Failed")
                .map((j) => (
                  <div key={j.id} className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-medium">Spectrum sync failed</p>
                    <p className="text-xs text-muted-foreground">{j.name}</p>
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading title="Recent Activity" />
            <div className="space-y-4">
              {seedActivityFeed.map((f) => (
                <div key={f.id} className="flex gap-4">
                  <div
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      f.tone === "amber" && "bg-eci-amber",
                      f.tone === "copper" && "bg-eci-copper",
                      f.tone === "zinc" && "bg-zinc-300",
                    )}
                  />
                  <div>
                    <p className="text-pretty text-sm">{f.text}</p>
                    <span className="text-xs text-muted-foreground">{f.at}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ServiceManagerOverview() {
  const { jobs, workOrders, materials, currentUser } = useEci();

  const openWos = workOrders.filter((w) => w.status !== "Complete");
  const inProgress = openWos.filter((w) => w.status === "In Progress");
  const scheduled = openWos.filter((w) => w.status === "Scheduled");
  const onHold = openWos.filter((w) => w.status === "On Hold");
  const p1 = openWos.filter((w) => w.priority === "Priority 1");
  const pendingPo = jobs.filter((j) => j.status === "Pending PO");
  const openMaterials = materials.filter((m) => m.status !== "Delivered");
  const awaitingPo = openMaterials.filter((m) => !m.poNumber);

  const techLoad = openWos.reduce<Record<string, number>>((acc, w) => {
    acc[w.technician] = (acc[w.technician] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        title="Service Overview"
        description={`Today's service board for ${currentUser} — active work orders, scheduling, and material flow.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Active Service Orders"
          to="/jobs"
          value={String(inProgress.length)}
          hint={`${openWos.length} open in total`}
          chartValue={inProgress.length}
          chartTotal={openWos.length}
          chartLabel="In-progress service orders as a share of open service orders"
        />
        <SummaryCard
          label="Scheduled / Not Started"
          to="/jobs"
          value={String(scheduled.length)}
          hint={`${onHold.length} on hold`}
          hintTone={onHold.length ? "amber" : "zinc"}
          chartValue={scheduled.length}
          chartTotal={openWos.length}
          chartLabel="Scheduled service orders as a share of open service orders"
        />
        <SummaryCard
          label="Jobs Pending PO"
          to="/jobs"
          value={String(pendingPo.length)}
          hint="Waiting on customer paperwork"
          hintTone="amber"
          chartValue={pendingPo.length}
          chartTotal={jobs.length}
          chartLabel="Jobs pending purchase orders as a share of all jobs"
        />
        <SummaryCard
          label="Open Material Requests"
          to="/materials"
          value={String(openMaterials.length)}
          hint={`${awaitingPo.length} awaiting PO`}
          hintTone={awaitingPo.length ? "copper" : "zinc"}
          accent={awaitingPo.length > 0}
          chartValue={openMaterials.length}
          chartTotal={materials.length}
          chartLabel="Open material requests as a share of all material requests"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SectionHeading
            title="Active Service Orders"
            description="Work orders currently in the field."
            action="View jobs"
            to="/jobs"
          />
          <div className="eci-card divide-y divide-black/5">
            {openWos.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="text-sm font-medium">
                    {w.number} · {w.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.technician} · {w.scheduled} ·{" "}
                    {w.tasks.filter((t) => t.done).length}/{w.tasks.length} tasks complete
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={w.priority} />
                  <StatusBadge status={w.status} />
                </div>
              </div>
            ))}
            {openWos.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">No open service orders.</p>
            ) : null}
          </div>

          <SectionHeading
            title="Pending Orders"
            description="Jobs waiting on a purchase order or a start date."
            action="View all"
            to="/jobs"
          />
          <div className="eci-card divide-y divide-black/5">
            {jobs
              .filter((j) => j.status === "Pending PO" || j.status === "Scheduled")
              .map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <Link to="/jobs/$id" params={{ id: j.id }} className="text-sm font-medium hover:underline">
                      {j.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {j.customer} · {j.manager} · {money(j.contractValue)}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            {jobs.filter((j) => j.status === "Pending PO" || j.status === "Scheduled").length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">Nothing pending.</p>
            ) : null}
          </div>

          <SectionHeading
            title="Material Requests"
            description="Field requests moving from request to delivery."
            action="Open materials"
            to="/materials"
          />
          <div className="eci-card divide-y divide-black/5">
            {openMaterials.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="text-sm font-medium">{m.item}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.qty} · {m.jobName} · {m.workOrder} · requested by {m.requestedBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.poNumber ? (
                    <span className="font-mono text-xs text-muted-foreground">{m.poNumber}</span>
                  ) : (
                    <span className="text-xs text-eci-copper">No PO</span>
                  )}
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))}
            {openMaterials.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">All requests delivered.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-8 xl:col-span-4">
          <div className="space-y-6">
            <SectionHeading title="Needs Attention" />
            <div className="space-y-3">
              {p1.map((w) => (
                <div key={w.id} className="rounded-lg bg-orange-50 p-3">
                  <p className="text-sm font-medium">Priority 1 · {w.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.technician} · {w.scheduled}
                  </p>
                </div>
              ))}
              {onHold.map((w) => (
                <div key={w.id} className="rounded-lg bg-red-50 p-3">
                  <p className="text-sm font-medium">On hold · {w.title}</p>
                  <p className="text-xs text-muted-foreground">{w.technician}</p>
                </div>
              ))}
              {awaitingPo.map((m) => (
                <div key={m.id} className="rounded-lg bg-amber-50 p-3">
                  <p className="text-sm font-medium">Material awaiting PO</p>
                  <p className="text-xs text-muted-foreground">
                    {m.item} · {m.jobName}
                  </p>
                </div>
              ))}
              {p1.length + onHold.length + awaitingPo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading title="Technician Load" description="Open work orders per technician." />
            <div className="eci-card divide-y divide-black/5">
              {Object.entries(techLoad).map(([tech, count]) => (
                <div key={tech} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm">{tech}</span>
                  <span className="text-sm font-medium text-muted-foreground">{count} open</span>
                </div>
              ))}
              {Object.keys(techLoad).length === 0 ? (
                <p className="px-5 py-3 text-sm text-muted-foreground">No assignments.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ReceivablesOverview() {
  const { invoices, jobs, currentUser } = useEci();

  const open = invoices.filter((i) => !["Paid", "Draft"].includes(i.status));
  const outstanding = open.reduce((s, i) => s + i.balance, 0);
  const overdue = invoices.filter((i) => i.status === "Overdue");
  const partial = invoices.filter((i) => i.status === "Partially Paid");
  const drafts = invoices.filter((i) => i.status === "Draft");
  const submitted = invoices.filter((i) => i.status === "Submitted to Spectrum");
  const collected = invoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + i.amount, 0);
  const uninvoiced = jobs.filter(
    (j) => j.status === "Active" && !invoices.some((i) => i.jobId === j.id),
  );

  const byCustomer = Object.entries(
    open.reduce<Record<string, number>>((acc, i) => {
      acc[i.customer] = (acc[i.customer] ?? 0) + i.balance;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell>
      <PageHeader
        title="Receivables Overview"
        description={`Billing and collections board for ${currentUser} — outstanding balances, aging, and invoices to send.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Outstanding"
          to="/invoices"
          value={money(outstanding)}
          hint={`${open.length} open invoices`}
          chartValue={outstanding}
          chartTotal={invoices.reduce((s, i) => s + i.amount, 0)}
          chartLabel="Outstanding balance as a share of all invoiced value"
        />
        <SummaryCard
          label="Overdue"
          to="/invoices"
          value={money(overdue.reduce((s, i) => s + i.balance, 0))}
          hint={`${overdue.length} invoices past due`}
          hintTone="copper"
          accent={overdue.length > 0}
          chartValue={overdue.reduce((s, i) => s + i.balance, 0)}
          chartTotal={outstanding}
          chartLabel="Overdue balance as a share of total outstanding"
        />
        <SummaryCard
          label="Partially Paid"
          to="/invoices"
          value={money(partial.reduce((s, i) => s + i.balance, 0))}
          hint={`${partial.length} awaiting balance`}
          hintTone="amber"
          chartValue={partial.reduce((s, i) => s + i.balance, 0)}
          chartTotal={outstanding}
          chartLabel="Partially paid balances as a share of total outstanding"
        />
        <SummaryCard
          label="Collected to Date"
          to="/invoices"
          value={money(collected)}
          hint={`${drafts.length} drafts · ${submitted.length} in Spectrum`}
          hintTone="green"
          chartValue={collected}
          chartTotal={invoices.reduce((s, i) => s + i.amount, 0)}
          chartLabel="Collected value as a share of all invoiced value"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SectionHeading
            title="Open Invoices"
            description="Everything currently owed to ECI."
            action="Open accounting"
            to="/invoices"
          />
          <div className="eci-card overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-background">
                  {["Invoice", "Customer / Job", "Balance", "Due", "Status"].map((h) => (
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
                {open.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-muted/60">
                    <td className="px-6 py-4 font-mono text-sm">#{i.number}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">{i.customer}</p>
                      <p className="text-xs text-muted-foreground">{i.jobName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm">{money(i.balance)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{i.due}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={i.status} />
                    </td>
                  </tr>
                ))}
                {open.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-sm text-muted-foreground">
                      Nothing outstanding.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <SectionHeading
            title="Ready to Bill"
            description="Active jobs with no invoice raised yet."
            action="View jobs"
            to="/jobs"
          />
          <div className="eci-card divide-y divide-black/5">
            {uninvoiced.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <Link to="/jobs/$id" params={{ id: j.id }} className="text-sm font-medium hover:underline">
                    {j.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {j.customer} · contract {money(j.contractValue)}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{j.spectrumNumber}</span>
              </div>
            ))}
            {uninvoiced.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">Every active job has been billed.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-8 xl:col-span-4">
          <div className="space-y-6">
            <SectionHeading title="Collections Follow-up" />
            <div className="space-y-3">
              {overdue.map((i) => (
                <div key={i.id} className="rounded-lg bg-red-50 p-3">
                  <p className="text-sm font-medium">Invoice #{i.number} overdue</p>
                  <p className="text-xs text-muted-foreground">
                    {i.customer} · {money(i.balance)} · due {i.due}
                  </p>
                </div>
              ))}
              {partial.map((i) => (
                <div key={i.id} className="rounded-lg bg-amber-50 p-3">
                  <p className="text-sm font-medium">Balance remaining on #{i.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.customer} · {money(i.balance)}
                  </p>
                </div>
              ))}
              {drafts.map((i) => (
                <div key={i.id} className="rounded-lg bg-muted p-3">
                  <p className="text-sm font-medium">Draft invoice not sent</p>
                  <p className="text-xs text-muted-foreground">
                    {i.customer} · {money(i.amount)}
                  </p>
                </div>
              ))}
              {overdue.length + partial.length + drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-up needed.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading title="Balance by Customer" />
            <div className="eci-card divide-y divide-black/5">
              {byCustomer.map(([customer, balance]) => (
                <div key={customer} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm">{customer}</span>
                  <span className="text-sm font-medium text-muted-foreground">{money(balance)}</span>
                </div>
              ))}
              {byCustomer.length === 0 ? (
                <p className="px-5 py-3 text-sm text-muted-foreground">No balances.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
