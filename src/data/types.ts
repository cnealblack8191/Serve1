/**
 * Serv1 domain types (SPEC.md section 5, pilot tables ★).
 * Screens import these from "@/data"; they never see Amplify or AWS shapes.
 */

export type Role = "Admin" | "Office" | "Tech" | "Owner";
export const ROLES: Role[] = ["Admin", "Office", "Tech", "Owner"];

export type JobStatus = "New" | "Scheduled" | "InProgress" | "Complete" | "Invoiced";
export const JOB_STATUSES: JobStatus[] = ["New", "Scheduled", "InProgress", "Complete", "Invoiced"];

export type JobPriority = "Low" | "Normal" | "High" | "Emergency";
export const JOB_PRIORITIES: JobPriority[] = ["Low", "Normal", "High", "Emergency"];

export type InvoiceStatus = "Draft" | "Sent" | "Paid";
export type AttachmentType = "Photo" | "Document" | "Signature" | "InvoicePdf";

export interface BaseRecord {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface User extends BaseRecord {
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  active: boolean;
  /** Cognito identity for techs so their jobs can be matched to their login. */
  identityId: string | null;
}

export interface Customer extends BaseRecord {
  name: string;
  billingAddress: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Site extends BaseRecord {
  customerId: string;
  name: string | null;
  address: string;
  accessNotes: string | null;
}

export interface Job extends BaseRecord {
  jobNumber: string | null;
  customerId: string;
  siteId: string | null;
  description: string;
  jobType: string | null;
  priority: JobPriority;
  status: JobStatus;
  /** Identity of the assigned tech (User.identityId), or null while unscheduled. */
  assignedTechId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  laborHours: number | null;
}

export interface Attachment extends BaseRecord {
  jobId: string;
  /** Identity of the tech assigned to the job when the file was added; null for office uploads
   *  on unassigned jobs. The backend lets a tech read only rows carrying their own identity. */
  assignedTechId: string | null;
  storagePath: string;
  type: AttachmentType;
  caption: string | null;
  uploadedBy: string | null;
}

export interface Signature extends BaseRecord {
  jobId: string;
  /** Same rule as Attachment.assignedTechId. */
  assignedTechId: string | null;
  signerName: string;
  storagePath: string;
  signedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice extends BaseRecord {
  invoiceNumber: string | null;
  jobId: string;
  customerId: string;
  lineItems: InvoiceLineItem[];
  total: number;
  status: InvoiceStatus;
  pdfPath: string | null;
}

/** Input shapes: everything except the server-managed fields. */
type Input<T extends BaseRecord> = Omit<T, keyof BaseRecord>;
export type NewUser = Input<User>;
export type NewCustomer = Input<Customer>;
export type NewSite = Input<Site>;
export type NewJob = Input<Job>;
export type NewAttachment = Input<Attachment>;
export type NewSignature = Input<Signature>;
export type NewInvoice = Input<Invoice>;

export type TableName =
  "users" | "customers" | "sites" | "jobs" | "attachments" | "signatures" | "invoices";

export const TABLES: TableName[] = [
  "users",
  "customers",
  "sites",
  "jobs",
  "attachments",
  "signatures",
  "invoices",
];

/** The signed-in person, as every screen sees them. */
export interface AuthUser {
  /** Cognito identity (sub::username) or the local demo id. Matches Job.assignedTechId for techs. */
  identityId: string;
  /** Per-user storage prefix id (Cognito identity-pool id on Amplify). Tech files live under tech-files/{storageId}/. */
  storageId: string;
  email: string;
  name: string;
  /** All groups the account belongs to. */
  roles: Role[];
  /** The one role that decides the navigation: Admin > Owner > Office > Tech. */
  role: Role;
}

export type SignInResult =
  { kind: "done" } | { kind: "newPasswordRequired" } | { kind: "error"; message: string };
