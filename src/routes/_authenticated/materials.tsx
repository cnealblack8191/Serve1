import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, StatusBadge, SummaryCard } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { useEci } from "@/lib/eci/store";
import type { MaterialStatus } from "@/lib/eci/types";

export const Route = createFileRoute("/_authenticated/materials")({
  head: () => ({
    meta: [
      { title: "Materials — ECI Operations" },
      {
        name: "description",
        content:
          "Track material requests from requested to ordered to delivered, with purchase order numbers and technician notifications.",
      },
      { property: "og:title", content: "Materials — ECI Operations" },
      {
        property: "og:description",
        content: "Field material requests, purchase orders and delivery status in one place.",
      },
    ],
  }),
  component: MaterialsPage,
});

const NEXT: Record<MaterialStatus, MaterialStatus | null> = {
  Requested: null,
  Approved: "Ordered",
  Ordered: "Delivered",
  Delivered: null,
};

function MaterialsPage() {
  const { materials, setMaterialStatus, approveMaterialRequest, currentUser } = useEci();

  return (
    <AppShell>
      <PageHeader
        title="Materials"
        description="Field material requests are emailed to the job manager for approval, then to the materials manager for ordering."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["Requested", "Approved", "Ordered", "Delivered"] as MaterialStatus[]).map((s) => (
          <SummaryCard
            key={s}
            label={s}
            value={String(materials.filter((m) => m.status === s).length)}
          />
        ))}
      </div>

      <div className="eci-card overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {[
                "Job",
                "Work order",
                "Requested item",
                "Qty",
                "Requested by",
                "Date requested",
                "PO number",
                "Status",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {materials.map((m) => (
              <tr key={m.id} className="align-top transition-colors hover:bg-muted/60">
                <td className="px-4 py-4 text-sm">{m.jobName}</td>
                <td className="px-4 py-4 font-mono text-sm text-muted-foreground">{m.workOrder}</td>
                <td className="px-4 py-4">
                  <p className="text-sm font-medium">{m.item}</p>
                  {m.notes ? <p className="text-xs text-muted-foreground">{m.notes}</p> : null}
                </td>
                <td className="px-4 py-4 text-sm">{m.qty}</td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{m.requestedBy}</td>
                <td className="px-4 py-4 text-sm text-muted-foreground">{m.requestedAt}</td>
                <td className="px-4 py-4 font-mono text-sm text-muted-foreground">
                  {m.poNumber ?? "—"}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-4 py-4">
                  {m.status === "Requested" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        approveMaterialRequest(m.id);
                        toast.success(`Approved — sent to the materials manager for ordering`);
                      }}
                    >
                      Approve
                    </Button>
                  ) : NEXT[m.status] ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = NEXT[m.status]!;
                        setMaterialStatus(
                          m.id,
                          next,
                          next === "Ordered" && !m.poNumber
                            ? `PO-${44000 + Math.floor(Math.random() * 900)}`
                            : undefined,
                        );
                        toast.success(`Marked ${next} — ${m.requestedBy} notified`);
                      }}
                    >
                      Mark {NEXT[m.status]}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
