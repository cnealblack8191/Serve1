import { MessageComposer, type ComposerLink } from "./MessageComposer";
import { templateFor, type CommPurpose } from "@/lib/comms/types";
import { useEci } from "@/lib/eci/store";

/**
 * Send an invoice or an invoice reminder. Both go through the one
 * communications service and are filed against the client, the job/work order
 * and the invoice at once. Automated reminders can reuse this same purpose
 * later without changing how mail is sent or logged.
 */
export function SendInvoiceDialog({
  open,
  onOpenChange,
  mode,
  invoiceId,
  invoiceNumber,
  customer,
  amount,
  dueDate,
  jobId,
  workOrderId,
  defaultTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "send" | "reminder";
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  amount?: string | undefined;
  dueDate?: string | undefined;
  jobId?: string | undefined;
  workOrderId?: string | undefined;
  defaultTo?: string | undefined;
}) {
  const { currentUser } = useEci();
  const purpose: CommPurpose = mode === "reminder" ? "invoice_reminder" : "invoice_sent";
  const name = `#${invoiceNumber}`;
  const tpl = templateFor(purpose, {
    name,
    customer,
    ...(amount ? { amount } : {}),
    ...(dueDate ? { dueDate } : {}),
    sender: currentUser,
  });

  const links: ComposerLink[] = [
    { recordType: "customer", recordId: customer },
    ...(jobId ? [{ recordType: "job" as const, recordId: jobId }] : []),
    ...(workOrderId ? [{ recordType: "work_order" as const, recordId: workOrderId }] : []),
  ];

  return (
    <MessageComposer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "reminder" ? `Payment reminder — ${name}` : `Send invoice ${name}`}
      target={{ recordType: "invoice", recordId: invoiceId, name, customer }}
      purpose={purpose}
      extraLinks={links}
      defaultTo={defaultTo}
      defaultSubject={tpl.subject}
      defaultBody={tpl.body}
    />
  );
}
