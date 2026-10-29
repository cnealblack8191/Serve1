/**
 * Communications layer — shared, client-safe types.
 *
 * The application keeps a synchronised mirror of ONE designated Microsoft 365
 * shared mailbox. Microsoft 365 stays the system of record: every row here
 * carries the Graph identifiers needed to reconcile with the mailbox once the
 * tenant connection is made. Nothing in this file touches credentials.
 */

import type { DocumentRecordType } from "@/lib/sharepoint/types";

export type { DocumentRecordType };

/** Mail folders mirrored from the shared mailbox. */
export type MailFolder = "inbox" | "sent" | "drafts" | "archive";

export const MAIL_FOLDERS: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "archive", label: "Archived" },
];

export type MessageDirection = "inbound" | "outbound";

/** Where a mirrored message came from. */
export type MessageSource = "app" | "graph" | "legacy";

export type DeliveryStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "received";

export interface MailAddress {
  name: string;
  address: string;
}

export interface MessageAttachment {
  id: string;
  documentId: string | null;
  name: string;
  extension: string;
  sizeBytes: number | null;
  webUrl: string;
  inline: boolean;
}

/** A business record a message is filed against. */
export interface MessageLink {
  id: string;
  recordType: DocumentRecordType;
  recordId: string;
  autoMatched: boolean;
  linkedBy: string;
}

/**
 * Why a message exists. Purposes let every module reuse the one send path
 * while history still reads as "bid sent", "invoice reminder" and so on —
 * and let scheduled reminders be added later with no change to sending.
 */
export type CommPurpose =
  | "general"
  | "bid_sent"
  | "proposal_sent"
  | "invoice_sent"
  | "invoice_reminder"
  | "work_order_scheduling"
  | "work_order_confirmation"
  | "work_order_technician"
  | "work_order_completion"
  | "work_order_followup"
  | "intake"
  | "material_request"
  | "material_approval";

export const COMM_PURPOSES: CommPurpose[] = [
  "general",
  "bid_sent",
  "proposal_sent",
  "invoice_sent",
  "invoice_reminder",
  "work_order_scheduling",
  "work_order_confirmation",
  "work_order_technician",
  "work_order_completion",
  "work_order_followup",
  "intake",
  "material_request",
  "material_approval",
];

export const PURPOSE_LABELS: Record<CommPurpose, string> = {
  general: "Email",
  bid_sent: "Bid sent",
  proposal_sent: "Proposal sent",
  invoice_sent: "Invoice sent",
  invoice_reminder: "Reminder sent",
  work_order_scheduling: "Scheduling",
  work_order_confirmation: "Work order confirmed",
  work_order_technician: "Technician note",
  work_order_completion: "Completion",
  work_order_followup: "Customer follow-up",
  intake: "Bid invitation",
  material_request: "Material approval request",
  material_approval: "Material approved",
};

export interface TemplateContext {
  /** Record name — project, job, work order number or invoice number. */
  name?: string;
  customer?: string;
  amount?: string;
  dueDate?: string;
  scheduled?: string;
  technician?: string;
  sender?: string;
  item?: string;
  qty?: string;
}

const signoff = (ctx: TemplateContext) =>
  `\n\nThank you,\n${ctx.sender ?? "Electrical Contractor Inc."}\nElectrical Contractor Inc. · Covington, GA`;

/** Default wording for each workflow — kept in one place, always editable. */
export function templateFor(
  purpose: CommPurpose,
  ctx: TemplateContext = {},
): { subject: string; body: string } {
  const name = ctx.name ?? "";
  const who = ctx.customer ? `${ctx.customer} team` : "team";
  switch (purpose) {
    case "bid_sent":
    case "proposal_sent":
      return {
        subject: `Proposal — ${name}`,
        body:
          `Hello ${who},\n\nPlease find our proposal for ${name} attached. ` +
          `We appreciate the opportunity to bid this work and are happy to walk through ` +
          `any part of the scope or pricing.${signoff(ctx)}`,
      };
    case "invoice_sent":
      return {
        subject: `Invoice ${name}`,
        body:
          `Hello ${who},\n\nInvoice ${name}${ctx.amount ? ` in the amount of ${ctx.amount}` : ""} is attached` +
          `${ctx.dueDate ? `, due ${ctx.dueDate}` : ""}. Please let us know if you need anything ` +
          `else for processing.${signoff(ctx)}`,
      };
    case "invoice_reminder":
      return {
        subject: `Reminder — invoice ${name}`,
        body:
          `Hello ${who},\n\nA friendly reminder that invoice ${name}` +
          `${ctx.amount ? ` for ${ctx.amount}` : ""}${ctx.dueDate ? ` was due ${ctx.dueDate}` : ""} ` +
          `remains open. If payment has already been sent, please disregard this note.${signoff(ctx)}`,
      };
    case "work_order_scheduling":
      return {
        subject: `Scheduling — work order ${name}`,
        body:
          `Hello ${who},\n\nWe would like to schedule work order ${name}` +
          `${ctx.scheduled ? ` for ${ctx.scheduled}` : ""}. Please confirm the date and site access ` +
          `arrangements work for you.${signoff(ctx)}`,
      };
    case "work_order_confirmation":
      return {
        subject: `Confirmed — work order ${name}`,
        body:
          `Hello ${who},\n\nThis confirms work order ${name}` +
          `${ctx.scheduled ? ` scheduled for ${ctx.scheduled}` : ""}` +
          `${ctx.technician ? `, with ${ctx.technician} assigned` : ""}.${signoff(ctx)}`,
      };
    case "work_order_technician":
      return {
        subject: `Technician update — work order ${name}`,
        body:
          `Hello,\n\nUpdate from the field on work order ${name}` +
          `${ctx.technician ? ` (${ctx.technician})` : ""}:\n\n`,
      };
    case "work_order_completion":
      return {
        subject: `Work complete — work order ${name}`,
        body:
          `Hello ${who},\n\nWork order ${name} is complete. A summary of the work performed ` +
          `is below and any supporting documentation is attached.\n\n${signoff(ctx)}`,
      };
    case "work_order_followup":
      return {
        subject: `Following up — work order ${name}`,
        body:
          `Hello ${who},\n\nFollowing up on work order ${name}. Please let us know if everything ` +
          `is operating as expected or if there is anything further we can take care of.${signoff(ctx)}`,
      };
    case "material_request":
      return {
        subject: `Approval needed — ${ctx.item ?? "material"} for ${name}`,
        body:
          `Hello,\n\n${ctx.technician ?? "A technician"} has requested material for ${name}` +
          `${ctx.scheduled ? ` (work order ${ctx.scheduled})` : ""}:\n\n` +
          `  ${ctx.item ?? ""}${ctx.qty ? ` — qty ${ctx.qty}` : ""}\n\n` +
          `Please review and approve this request in Serve One (Materials page). ` +
          `Once approved it goes straight to the materials manager for ordering.${signoff(ctx)}`,
      };
    case "material_approval":
      return {
        subject: `Approved — ${ctx.item ?? "material"} for ${name}`,
        body:
          `Hello,\n\nThe material request below for ${name} has been approved by the job manager ` +
          `and is ready to order:\n\n` +
          `  ${ctx.item ?? ""}${ctx.qty ? ` — qty ${ctx.qty}` : ""}\n\n` +
          `Please issue a purchase order and mark it ordered in Serve One (Materials page).${signoff(ctx)}`,
      };
    default:
      return { subject: name, body: "" };
  }
}

export interface Message {
  id: string;
  threadId: string;
  purpose: CommPurpose;
  graphMessageId: string | null;
  internetMessageId: string | null;
  direction: MessageDirection;
  folder: MailFolder;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  bodyPreview: string;
  bodyHtml: string;
  isDraft: boolean;
  isRead: boolean;
  hasAttachments: boolean;
  deliveryStatus: DeliveryStatus;
  deliveryDetail: string;
  source: MessageSource;
  sentAt: string | null;
  receivedAt: string | null;
  sentByName: string;
  attachments: MessageAttachment[];
  links: MessageLink[];
}

export interface MessageThread {
  id: string;
  graphConversationId: string | null;
  subject: string;
  preview: string;
  folder: MailFolder;
  participants: MailAddress[];
  hasAttachments: boolean;
  unreadCount: number;
  messageCount: number;
  lastMessageAt: string;
  links: MessageLink[];
}

export interface MailboxStatus {
  connected: boolean;
  mailboxAddress: string;
  lastSyncedAt: string | null;
}

/** A record a message can be composed from or filed against. */
export interface CommsRecordTarget {
  recordType: DocumentRecordType;
  recordId: string;
  /** Record name, used for subject defaults and folder paths. */
  name?: string;
  /** Owning client. */
  customer?: string;
}

/** Default subject lines when composing from a business record. */
export function defaultSubjectFor(target: CommsRecordTarget): string {
  const label = target.name ?? target.recordId;
  switch (target.recordType) {
    case "customer":
      return `Electrical Contractor Inc. — ${label}`;
    case "contact":
      return `Following up — ${label}`;
    case "opportunity":
      return `Opportunity — ${label}`;
    case "bid":
      return `Quote for ${label}`;
    case "estimate":
      return `Estimate — ${label}`;
    case "job":
      return `Job update — ${label}`;
    case "work_order":
      return `Work order ${label}`;
    case "invoice":
      return `Invoice ${label}`;
    default:
      return label;
  }
}

/** Button wording used on each record type. */
export const COMPOSE_LABELS: Record<DocumentRecordType, string> = {
  customer: "Email client",
  contact: "Email contact",
  opportunity: "Email about opportunity",
  bid: "Send bid",
  estimate: "Send estimate",
  job: "Email about job",
  work_order: "Email about work order",
  invoice: "Send invoice",
  email: "Reply",
};

export const formatAddress = (a: MailAddress): string =>
  a.name ? `${a.name} <${a.address}>` : a.address;

/** Parses "Name <a@b.com>, c@d.com" into addresses. */
export function parseAddresses(input: string): MailAddress[] {
  return input
    .split(/[,;]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = /^(.*)<([^>]+)>$/.exec(raw);
      if (m) return { name: (m[1] ?? "").trim(), address: (m[2] ?? "").trim() };
      return { name: "", address: raw };
    })
    .filter((a) => a.address.includes("@"));
}

/* ------------------------------------------------------------------ */
/* Unified timeline                                                     */
/* ------------------------------------------------------------------ */

export type TimelineKind = "email_in" | "email_out" | "document";

/** One dated entry on a record's combined business timeline. */
export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** Purpose badge for email entries. */
  purpose: CommPurpose | null;
  title: string;
  detail: string;
  /** Who sent it, or who filed the document. */
  actor: string;
  at: string;
  /** Link out (mail thread id for email, SharePoint web url for documents). */
  threadId: string | null;
  webUrl: string;
  attachmentNames: string[];
}
