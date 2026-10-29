import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, StatusBadge, SummaryCard } from "@/components/eci/primitives";
import { bidTotals, money, useEci } from "@/lib/eci/store";
import type { BidStage } from "@/lib/eci/types";

export const Route = createFileRoute("/_authenticated/bids/")({
  head: () => ({
    meta: [
      { title: "Estimating & Bids — ECI Operations" },
      {
        name: "description",
        content:
          "Every ECI bid from estimating through approval, ready to send, sent to customer and won.",
      },
      { property: "og:title", content: "Estimating & Bids — ECI Operations" },
      {
        property: "og:description",
        content: "Spreadsheet-style estimating with Spectrum cost code imports and quote approvals.",
      },
    ],
  }),
  component: BidsPage,
});

const STAGES: BidStage[] = [
  "Estimating",
  "Awaiting Approval",
  "Ready to Send",
  "Sent to Customer",
  "Won",
];

function BidsPage() {
  const { bids } = useEci();

  return (
    <AppShell>
      <PageHeader
        title="Estimating & Bids"
        description="Approved opportunities become bids. Build the estimate, route it for approval, then send the branded ECI quote."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {STAGES.map((s) => (
          <SummaryCard
            key={s}
            label={s}
            value={String(bids.filter((b) => b.stage === s).length)}
            hint={money(
              bids.filter((b) => b.stage === s).reduce((t, b) => t + bidTotals(b.lineItems).sell, 0),
            )}
          />
        ))}
      </div>

      <div className="eci-card overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["Bid", "Customer", "Owner", "Selling price", "Stage"].map((h) => (
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
            {bids.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-muted/60">
                <td className="px-6 py-4">
                  <Link to="/bids/$id" params={{ id: b.id }} className="text-sm font-medium hover:underline">
                    {b.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{b.id}</div>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{b.customer}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{b.owner}</td>
                <td className="px-6 py-4 text-sm">{money(bidTotals(b.lineItems).sell)}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={b.stage} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
