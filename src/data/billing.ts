import { useMutation, useQueryClient } from "@tanstack/react-query";

import { backend } from "./backend";
import { keys } from "./hooks";
import { newInvoiceNumber } from "./numbers";
import type { Invoice, InvoiceLineItem, Job } from "./types";

/** Flat demo rates for the pilot (not part of the data model). */
export const LABOR_RATE = 95;
export const DEFAULT_LABOR_HOURS = 2;
export const SERVICE_CALL_FEE = 85;

export function buildLineItems(job: Job): InvoiceLineItem[] {
  const hours = job.laborHours && job.laborHours > 0 ? job.laborHours : DEFAULT_LABOR_HOURS;
  return [
    {
      description: "Labor",
      quantity: hours,
      unitPrice: LABOR_RATE,
      total: hours * LABOR_RATE,
    },
    {
      description: "Service call",
      quantity: 1,
      unitPrice: SERVICE_CALL_FEE,
      total: SERVICE_CALL_FEE,
    },
  ];
}

/**
 * SPEC W4: one click makes a Draft invoice from a Complete job and marks the job Invoiced.
 * Safe to call again: if the job already has an invoice it is returned (and the job status
 * is finished if an earlier attempt failed halfway), so a double click or retry never
 * creates a second invoice.
 */
export async function createInvoiceFromJob(job: Job): Promise<Invoice> {
  const existing = (await backend().invoices.list()).find((i) => i.jobId === job.id);
  let invoice = existing;
  if (!invoice) {
    const lineItems = buildLineItems(job);
    try {
      invoice = await backend().invoices.create({
        invoiceNumber: newInvoiceNumber(),
        jobId: job.id,
        customerId: job.customerId,
        lineItems,
        total: lineItems.reduce((sum, l) => sum + l.total, 0),
        status: "Draft",
        pdfPath: null,
      });
    } catch (e) {
      // The database keys invoices by job, so a same-moment second create fails
      // here; the first one is the invoice. Anything else is a real error.
      const again = (await backend().invoices.list()).find((i) => i.jobId === job.id);
      if (!again) throw e;
      invoice = again;
    }
  }
  const current = await backend().jobs.get(job.id);
  if (current && current.status === "Complete") {
    await backend().jobs.update(job.id, { status: "Invoiced" });
  }
  return invoice;
}

export function useCreateInvoiceFromJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createInvoiceFromJob,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table("invoices") });
      void qc.invalidateQueries({ queryKey: keys.table("jobs") });
    },
  });
}
