/**
 * SharePoint document layer — shared types.
 *
 * These types are client-safe: they describe how the application references
 * documents that physically live in Microsoft 365 / SharePoint. The app never
 * stores file bytes; it stores durable Graph identifiers (site / drive / item)
 * plus association rows so one file can belong to many business records.
 */

/** Every business record that can own or reference documents. */
export type DocumentRecordType =
  | "customer"
  | "contact"
  | "opportunity"
  | "bid"
  | "estimate"
  | "job"
  | "work_order"
  | "invoice"
  | "email";

export const RECORD_TYPE_LABELS: Record<DocumentRecordType, string> = {
  customer: "Client",
  contact: "Contact",
  opportunity: "Opportunity",
  bid: "Bid",
  estimate: "Estimate",
  job: "Job",
  work_order: "Work order",
  invoice: "Invoice",
  email: "Communication",
};

/** How a reference entered the system. */
export type DocumentOrigin = "linked" | "uploaded" | "generated" | "communication";

/** Documents the application itself produces and later writes to SharePoint. */
export type GeneratedDocumentKind =
  | "proposal"
  | "estimate"
  | "bid_submission"
  | "work_order"
  | "invoice"
  | "supporting";

/** A stored reference to one SharePoint drive item. */
export interface DocumentRef {
  id: string;
  provider: string;
  siteId: string | null;
  driveId: string | null;
  itemId: string | null;
  name: string;
  kind: "file" | "folder";
  extension: string;
  sizeBytes: number | null;
  webUrl: string;
  folderPath: string;
  origin: DocumentOrigin;
  generatedKind: GeneratedDocumentKind | null;
  createdByName: string;
  modifiedAt: string;
}

/** A document as seen from one record, including the association metadata. */
export interface LinkedDocument extends DocumentRef {
  linkId: string;
  label: string;
  linkedBy: string;
  /** Other records that reference the same physical file. */
  alsoLinkedTo: { recordType: DocumentRecordType; recordId: string }[];
}

/** The SharePoint folder that belongs to a record. */
export interface DocumentLocation {
  recordType: DocumentRecordType;
  recordId: string;
  siteId: string | null;
  driveId: string | null;
  folderItemId: string | null;
  folderPath: string;
  webUrl: string;
  provisioned: boolean;
}

/** One entry while browsing a SharePoint folder. */
export interface BrowseItem {
  /** Graph item id when connected; a stable preview id otherwise. */
  id: string;
  name: string;
  kind: "file" | "folder";
  extension: string;
  size: string;
  modifiedBy: string;
  modifiedAt: string;
  webUrl: string;
  path: string;
}

export interface BrowseResult {
  /** False while Microsoft 365 is not yet connected (sample structure shown). */
  connected: boolean;
  path: string;
  webUrl: string;
  breadcrumbs: { name: string; path: string }[];
  items: BrowseItem[];
}

/** Suggested labels when attaching a document to a bid. */
export const BID_DOCUMENT_LABELS = [
  "Plans",
  "Specifications",
  "Addendum",
  "Invitation to Bid",
  "Scope Document",
  "Quote",
  "Vendor Document",
  "Proposal",
  "Other Attachment",
] as const;

export const GENERIC_DOCUMENT_LABELS = [
  "Contract",
  "Drawing",
  "Submittal",
  "Photo",
  "Receipt",
  "Correspondence",
  "Other",
] as const;

/** Root of the designated SharePoint document library used by this app. */
export const DOCUMENT_ROOT = "/ECI Documents";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

/**
 * Deterministic folder path for a record. Paths are a convenience for humans;
 * the durable identifiers on `document_locations` remain authoritative.
 */
export function folderPathFor(
  recordType: DocumentRecordType,
  ctx: { recordId: string; name?: string; customer?: string },
): string {
  const label = safe(ctx.name || ctx.recordId);
  const client = ctx.customer ? safe(ctx.customer) : "Unassigned";
  switch (recordType) {
    case "customer":
      return `${DOCUMENT_ROOT}/Clients/${label}`;
    case "contact":
      return `${DOCUMENT_ROOT}/Clients/${client}/Contacts/${label}`;
    case "opportunity":
      return `${DOCUMENT_ROOT}/Clients/${client}/Opportunities/${label}`;
    case "bid":
    case "estimate":
      return `${DOCUMENT_ROOT}/Clients/${client}/Bids/${label}`;
    case "job":
      return `${DOCUMENT_ROOT}/Clients/${client}/Jobs/${label}`;
    case "work_order":
      return `${DOCUMENT_ROOT}/Clients/${client}/Jobs/${label}/Work Orders/${ctx.recordId}`;
    case "invoice":
      return `${DOCUMENT_ROOT}/Clients/${client}/Invoices/${label}`;
    case "email":
      return `${DOCUMENT_ROOT}/Clients/${client}/Correspondence`;
  }
}
