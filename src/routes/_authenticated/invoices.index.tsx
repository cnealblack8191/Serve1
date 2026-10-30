import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { EmptyState, PageHeader, SectionHeading, StatusBadge } from "@/components/eci/primitives";
import { money, shortDate } from "@/components/serv1/billing/format";
import { ReadyToInvoice } from "@/components/serv1/billing/ReadyToInvoice";
import { Input } from "@/components/ui/input";
import { useCurrentUser, useCustomers, useInvoices, useJobs } from "@/data";

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: Page,
});

function Page() {
  const jobs = useJobs();
  const invoices = useInvoices();
  const customers = useCustomers();
  const me = useCurrentUser();
  const canCreate = !!me.data?.roles.some((r) => r === "Admin" || r === "Office");
  const [search, setSearch] = useState("");

  // A Complete job is still waiting even if an earlier click saved the invoice but not the
  // job status; clicking again finishes the job (createInvoiceFromJob is safe to repeat).
  const ready = (jobs.data ?? []).filter((j) => j.status === "Complete");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices.data ?? [])
      .map((inv) => ({
        inv,
        customer: customers.data?.find((c) => c.id === inv.customerId)?.name ?? "Unknown customer",
        jobNumber: jobs.data?.find((j) => j.id === inv.jobId)?.jobNumber ?? "",
      }))
      .filter(
        (r) =>
          !q ||
          [r.inv.invoiceNumber, r.customer, r.jobNumber, r.inv.status]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => b.inv.createdAt.localeCompare(a.inv.createdAt));
  }, [invoices.data, customers.data, jobs.data, search]);

  return (
    <>
      <PageHeader title="Invoices" description="Turn finished jobs into invoices with one click." />

      <section className="space-y-3">
        <SectionHeading title="Ready to invoice" />
        <ReadyToInvoice jobs={ready} customers={customers.data ?? []} canCreate={canCreate} />
      </section>

      <section className="space-y-3">
        <SectionHeading title="All invoices" />
        <Input
          placeholder="Search invoices"
          aria-label="Search invoices"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {rows.length === 0 ? (
          <EmptyState
            title={search ? "No invoices match your search" : "No invoices yet"}
            hint={search ? undefined : "Create one from a completed job above."}
          />
        ) : (
          <div className="eci-card overflow-x-auto">
            <table className="w-full text-sm" data-testid="invoice-list">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Job</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, customer, jobNumber }) => (
                  <tr key={inv.id} className="border-b border-border/70 last:border-0">
                    <td className="p-3 font-medium">
                      <Link
                        to="/invoices/$id"
                        params={{ id: inv.id }}
                        className="text-eci-copper hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="p-3">{customer}</td>
                    <td className="p-3">{jobNumber}</td>
                    <td className="p-3 text-right tabular-nums">{money(inv.total)}</td>
                    <td className="p-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="p-3">{shortDate(inv.createdAt)}</td>
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
