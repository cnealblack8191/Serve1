import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/eci/AppShell";
import { EmailImportDialog } from "@/components/eci/EmailImportDialog";
import { SmartsheetImportDialog } from "@/components/eci/SmartsheetImportDialog";
import { PageHeader, StatusBadge } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { money, useEci } from "@/lib/eci/store";
import type { OpportunityStage } from "@/lib/eci/types";

export const Route = createFileRoute("/_authenticated/crm/")({
  head: () => ({
    meta: [
      { title: "CRM & Opportunities — ECI Operations" },
      {
        name: "description",
        content:
          "Track electrical construction opportunities through kanban pipeline, sortable table and follow-up calendar views.",
      },
      { property: "og:title", content: "CRM & Opportunities — ECI Operations" },
      {
        property: "og:description",
        content: "Kanban pipeline, sortable table and follow-up views for every ECI opportunity.",
      },
    ],
  }),
  component: CrmPage,
});

const STAGES: OpportunityStage[] = [
  "New Opportunity",
  "Bid or No-Bid Decision",
  "Approved to Estimate",
];

function CrmPage() {
  const { opportunities } = useEci();
  const [sortKey, setSortKey] = useState<"name" | "value" | "expectedBidDate">("value");
  const [pipeline, setPipeline] = useState<"All" | "Sales" | "Service">("All");
  const visibleOpportunities = opportunities.filter(
    (opportunity) => pipeline === "All" || opportunity.source === pipeline,
  );

  const sorted = [...visibleOpportunities].sort((a, b) =>
    sortKey === "value" ? b.value - a.value : String(a[sortKey]).localeCompare(String(b[sortKey])),
  );

  return (
    <AppShell>
      <PageHeader
        title="CRM & Opportunities"
        description="Every opportunity from first contact through approval to estimate."
      >
        <Button variant="outline" asChild>
          <Link to="/intake">Bid intake queue</Link>
        </Button>
        <SmartsheetImportDialog />
        <EmailImportDialog />
        <Button asChild>
          <Link to="/crm/new">New opportunity</Link>
        </Button>
      </PageHeader>

      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="inline-flex rounded-md bg-muted p-1" aria-label="Opportunity pipeline">
          {(["All", "Sales", "Service"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={pipeline === option ? "default" : "ghost"}
              onClick={() => setPipeline(option)}
              aria-pressed={pipeline === option}
            >
              {option}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {visibleOpportunities.length} opportunit{visibleOpportunities.length === 1 ? "y" : "ies"}
        </p>
      </div>

      <Tabs defaultValue="kanban" className="space-y-6">
        <TabsList>
          <TabsTrigger value="kanban">Kanban pipeline</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="calendar">Follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STAGES.map((stage) => {
            const items = visibleOpportunities.filter((o) => o.stage === stage);
            return (
              <div key={stage} className="rounded-xl bg-black/[0.025] p-3">
                <div className="flex items-center justify-between px-1.5 pb-3">
                  <span className="text-sm font-medium">{stage}</span>
                  <span className="text-sm text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map((o) => (
                    <Link
                      key={o.id}
                      to="/crm/$id"
                      params={{ id: o.id }}
                      className="block rounded-lg bg-card p-4 ring-1 ring-black/5 transition-shadow hover:shadow-sm"
                    >
                      <p className="text-sm font-medium leading-snug">{o.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{o.customer}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-semibold">{money(o.value)}</span>
                        <span className="text-xs text-muted-foreground">{o.division}</span>
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1.5 py-6 text-xs text-muted-foreground">Nothing here yet.</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="table">
          <div className="eci-card overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  {(
                    [
                      ["name", "Opportunity"],
                      ["value", "Value"],
                      ["expectedBidDate", "Expected bid"],
                    ] as const
                  ).map(([key, label]) => (
                    <th key={key} className="px-6 py-3">
                      <button
                        onClick={() => setSortKey(key)}
                        className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        {label}
                      </button>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Assigned
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Stage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {sorted.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-muted/60">
                    <td className="px-6 py-4">
                      <Link to="/crm/$id" params={{ id: o.id }} className="text-sm font-medium hover:underline">
                        {o.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{o.customer}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">{money(o.value)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{o.expectedBidDate}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{o.assignedTo}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={o.stage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          {[...visibleOpportunities]
            .sort((a, b) => a.expectedBidDate.localeCompare(b.expectedBidDate))
            .map((o) => (
              <div key={o.id} className="eci-card flex flex-wrap items-center gap-6 p-5">
                <div className="w-28 shrink-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Bid due</p>
                  <p className="text-lg font-semibold">{o.expectedBidDate}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to="/crm/$id" params={{ id: o.id }} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Follow up with {o.contactName} · {o.assignedTo}
                  </p>
                </div>
                <StatusBadge status={o.stage} />
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
