import type { Customer, Invoice, Job, Site } from "@/data";
import { StatusBadge } from "@/components/eci/primitives";

import { money, shortDate } from "./format";

/** Hides everything except the invoice when printing / saving as PDF. */
const PRINT_CSS = `
@media print {
  aside, header, nav, .no-print { display: none !important; }
  main { padding: 0 !important; }
  body { background: #fff !important; }
  .invoice-doc { border: 0 !important; box-shadow: none !important; color: #000 !important; background: #fff !important; }
}`;

export function InvoiceDocument({
  invoice,
  customer,
  job,
  site,
}: {
  invoice: Invoice;
  customer: Customer | null | undefined;
  job: Job | null | undefined;
  site: Site | null | undefined;
}) {
  return (
    <article className="invoice-doc eci-card mx-auto max-w-3xl space-y-6 p-8">
      <style>{PRINT_CSS}</style>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Serv1" className="h-12 w-auto" />
          <div>
            <p className="text-lg font-semibold">Serv1 Field Services</p>
            <p className="text-sm text-muted-foreground">Pilot demo company</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">Invoice</p>
          <p className="text-sm">{invoice.invoiceNumber}</p>
          <p className="text-sm text-muted-foreground">{shortDate(invoice.createdAt)}</p>
          <div className="mt-1">
            <StatusBadge status={invoice.status} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Bill to
          </p>
          <p className="font-medium">{customer?.name ?? "Unknown customer"}</p>
          <p className="text-sm">{customer?.billingAddress ?? "No billing address on file"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Job</p>
          <p className="font-medium">{job?.jobNumber}</p>
          <p className="text-sm">{job?.description}</p>
          {site ? <p className="text-sm text-muted-foreground">{site.address}</p> : null}
        </div>
      </section>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((l, i) => (
            <tr key={i} className="border-b border-border/70">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-3 text-right font-medium">
              Total
            </td>
            <td className="py-3 text-right text-lg font-semibold tabular-nums">
              {money(invoice.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}
