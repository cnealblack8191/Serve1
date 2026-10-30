import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { InvoiceDocument } from "@/components/serv1/billing/InvoiceDocument";
import { Button } from "@/components/ui/button";
import { useCustomers, useInvoiceMutations, useInvoices, useJobs, useSites } from "@/data";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const invoices = useInvoices();
  const jobs = useJobs();
  const customers = useCustomers();
  const sites = useSites();
  const { update } = useInvoiceMutations();

  const invoice = invoices.data?.find((i) => i.id === id);
  if (!invoice) {
    return invoices.isLoading ? null : (
      <>
        <PageHeader title="Invoice" />
        <EmptyState title="Invoice not found" hint="It may have been removed." />
      </>
    );
  }
  const job = jobs.data?.find((j) => j.id === invoice.jobId);
  const customer = customers.data?.find((c) => c.id === invoice.customerId);
  const site = job?.siteId ? sites.data?.find((s) => s.id === job.siteId) : null;

  const setStatus = (status: "Sent" | "Paid") =>
    update.mutate(
      { id: invoice.id, patch: { status } },
      {
        onSuccess: () => toast.success(`Marked ${status.toLowerCase()}`),
        onError: () => toast.error("Could not update the invoice."),
      },
    );

  return (
    <>
      <div className="no-print space-y-4">
        <Link to="/invoices" className="text-sm text-eci-copper hover:underline">
          ← All invoices
        </Link>
        <PageHeader title={invoice.invoiceNumber ?? "Invoice"}>
          {invoice.status === "Draft" ? (
            <Button variant="outline" onClick={() => setStatus("Sent")} disabled={update.isPending}>
              Mark sent
            </Button>
          ) : null}
          {invoice.status !== "Paid" ? (
            <Button variant="outline" onClick={() => setStatus("Paid")} disabled={update.isPending}>
              Mark paid
            </Button>
          ) : null}
          <Button onClick={() => window.print()}>Download PDF</Button>
        </PageHeader>
        <p className="text-sm text-muted-foreground">
          In the print window choose “Save as PDF” as the destination.
        </p>
      </div>
      <InvoiceDocument invoice={invoice} customer={customer} job={job} site={site} />
    </>
  );
}
