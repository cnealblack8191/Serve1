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

/**
 * Invoice numbers are INV-YYMM-NNNN with a random 4-digit suffix, so deleting an
 * invoice can never cause a number to be reused (a row count would). Pilot-level:
 * we also re-draw if the number happens to exist already.
 */
function newInvoiceNumber(taken: Set<string | null>): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (;;) {
    const n = `INV-${yymm}-${1000 + Math.floor(Math.random() * 9000)}`;
    if (!taken.has(n)) return n;
  }
}

/**
 * SPEC W4: one click makes a Draft invoice from a Complete job and marks the job Invoiced.
 * Safe to call again: if the job already has an invoice it is returned (and the job status
 * is finished if an earlier attempt failed halfway), so a double click or retry never
 * creates a second invoice.
 */
export async function createInvoiceFromJob(job: Job): Promise<Invoice> {
  const existing = await backend().invoices.list();
  let invoice = existing.find((i) => i.jobId === job.id);
  if (!invoice) {
    const lineItems = buildLineItems(job);
    invoice = await backend().invoices.create({
      invoiceNumber: newInvoiceNumber(new Set(existing.map((i) => i.invoiceNumber))),
      jobId: job.id,
      customerId: job.customerId,
      lineItems,
      total: lineItems.reduce((sum, l) => sum + l.total, 0),
      status: "Draft",
      pdfPath: null,
    });
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
