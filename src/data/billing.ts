import { useMutation, useQueryClient } from "@tanstack/react-query";

import { backend } from "./backend";
import { keys } from "./hooks";
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

/** SPEC W4: one click makes a Draft invoice from a Complete job and marks the job Invoiced. */
export async function createInvoiceFromJob(job: Job): Promise<Invoice> {
  const existing = await backend().invoices.list();
  const lineItems = buildLineItems(job);
  const invoice = await backend().invoices.create({
    invoiceNumber: `INV-${1000 + existing.length + 1}`,
    jobId: job.id,
    customerId: job.customerId,
    lineItems,
    total: lineItems.reduce((sum, l) => sum + l.total, 0),
    status: "Draft",
    pdfPath: null,
  });
  await backend().jobs.update(job.id, { status: "Invoiced" });
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
