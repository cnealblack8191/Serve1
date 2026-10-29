import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import {
  Field,
  PageHeader,
  SectionHeading,
  StatusBadge,
  SummaryCard,
} from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, useEci } from "@/lib/eci/store";
import { SendInvoiceDialog } from "@/components/eci/SendInvoiceDialog";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices & Accounting — ECI Operations" },
      {
        name: "description",
        content:
          "Accounts receivable invoice workspace and accounts payable receipt matching for Electrical Contractor Incorporated",
      },
      { property: "og:title", content: "Invoices & Accounting — ECI Operations" },
      {
        property: "og:description",
        content: "Create invoices in Spectrum, track payment status, and match technician receipts to POs.",
      },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const {
    invoices,
    receipts,
    can,
    setInvoiceStatus,
    addInvoiceNote,
    updateReceipt,
  } = useEci();
  const [emailInvoice, setEmailInvoice] = useState<{
    mode: "send" | "reminder";
    id: string;
    number: string;
    customer: string;
    amount: string;
    due: string;
    jobId: string;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const outstanding = invoices
    .filter((i) => !["Paid", "Draft"].includes(i.status))
    .reduce((s, i) => s + i.balance, 0);

  return (
    <AppShell>
      <PageHeader
        title="Invoices & Accounting"
        description="Accounts receivable and accounts payable workspaces backed by Spectrum."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Outstanding" value={money(outstanding)} />
        <SummaryCard
          label="Overdue"
          value={String(invoices.filter((i) => i.status === "Overdue").length)}
          hint="Action required"
          hintTone="copper"
          accent
        />
        <SummaryCard
          label="Unmatched receipts"
          value={String(receipts.filter((r) => !r.matched).length)}
        />
        <SummaryCard
          label="Missing documentation"
          value={String(receipts.filter((r) => r.missingDocs).length)}
          hintTone="amber"
        />
      </div>

      <Tabs defaultValue="ar" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ar">Accounts Receivable</TabsTrigger>
          <TabsTrigger value="ap" disabled={!can("ap")}>
            Accounts Payable
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ar" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success("Invoice draft created in Spectrum")}>
              Create invoice in Spectrum
            </Button>
            <Button variant="outline" onClick={() => toast("Attach supporting document — placeholder")}>
              Attach supporting document
            </Button>
          </div>

          <div className="space-y-4">
            {invoices.map((i) => (
              <div key={i.id} className="eci-card space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      Invoice #{i.number} · {i.customer}
                    </p>
                    <p className="text-sm text-muted-foreground">{i.jobName}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {i.issued} · due {i.due}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-semibold">{money(i.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        Balance {money(i.balance)}
                      </p>
                    </div>
                    <StatusBadge status={i.status} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {i.status === "Draft" ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setInvoiceStatus(i.id, "Submitted to Spectrum");
                        toast.success("Submitted to Spectrum");
                      }}
                    >
                      Submit to Spectrum
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEmailInvoice({
                        mode: "send",
                        id: i.id,
                        number: i.number,
                        customer: i.customer,
                        amount: money(i.amount),
                        due: i.due,
                        jobId: i.jobId,
                      })
                    }
                  >
                    Send invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEmailInvoice({
                        mode: "reminder",
                        id: i.id,
                        number: i.number,
                        customer: i.customer,
                        amount: money(i.balance),
                        due: i.due,
                        jobId: i.jobId,
                      })
                    }
                  >
                    Send reminder
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInvoiceStatus(i.id, "Paid")}
                  >
                    Record payment
                  </Button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-64 flex-1">
                    <Field label="Note or follow-up">
                      <Input
                        value={noteDraft[i.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft((d) => ({ ...d, [i.id]: e.target.value }))
                        }
                        placeholder="Called AP, promised payment Friday"
                      />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const v = noteDraft[i.id]?.trim();
                      if (!v) return;
                      addInvoiceNote(i.id, v);
                      setNoteDraft((d) => ({ ...d, [i.id]: "" }));
                      toast.success("Note recorded");
                    }}
                  >
                    Add note
                  </Button>
                </div>

                {i.notes.length ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {i.notes.map((n) => (
                      <li key={n}>· {n}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ap" className="space-y-6">
          <SectionHeading title="Technician receipts" />
          <div className="space-y-4">
            {receipts.map((r) => (
              <div key={r.id} className="eci-card space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {r.vendor} · {money(r.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.jobName} · {r.workOrder}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted by {r.submittedBy} · {r.at}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.matched ? "Approved" : "Pending"} />
                    {r.missingDocs ? <StatusBadge status="On Hold" /> : null}
                    {r.complete ? <StatusBadge status="Complete" /> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Purchase order">
                    <Input
                      value={r.poNumber ?? ""}
                      placeholder="PO-44219"
                      onChange={(e) => updateReceipt(r.id, { poNumber: e.target.value })}
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateReceipt(r.id, { matched: true, missingDocs: false });
                      toast.success("Receipt matched to purchase order");
                    }}
                  >
                    Match to PO
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateReceipt(r.id, { missingDocs: true });
                      toast("Flagged as missing documentation");
                    }}
                  >
                    Request documentation
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      updateReceipt(r.id, { complete: true });
                      toast.success("Documentation marked complete");
                    }}
                  >
                    Mark documentation complete
                  </Button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-64 flex-1">
                    <Field label="Internal note">
                      <Input
                        value={noteDraft[r.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                        placeholder="Asked Ray for the itemized receipt"
                      />
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const v = noteDraft[r.id]?.trim();
                      if (!v) return;
                      updateReceipt(r.id, { notes: [v, ...r.notes] });
                      setNoteDraft((d) => ({ ...d, [r.id]: "" }));
                    }}
                  >
                    Add note
                  </Button>
                </div>

                {r.notes.length ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {r.notes.map((n) => (
                      <li key={n}>· {n}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {emailInvoice ? (
        <SendInvoiceDialog
          open
          onOpenChange={(open) => !open && setEmailInvoice(null)}
          mode={emailInvoice.mode}
          invoiceId={emailInvoice.id}
          invoiceNumber={emailInvoice.number}
          customer={emailInvoice.customer}
          amount={emailInvoice.amount}
          dueDate={emailInvoice.due}
          jobId={emailInvoice.jobId}
        />
      ) : null}
    </AppShell>
  );
}
