/**
 * Serv1 domain types (SPEC.md section 5, pilot tables ★).
 * Screens import these from "@/data"; they never see Amplify or AWS shapes.
 */

export type Role = "Admin" | "Office" | "Tech" | "Owner";
export const ROLES: Role[] = ["Admin", "Office", "Tech", "Owner"];

/**
 * Job life cycle (Phase 3): New -> Scheduled -> En route -> In progress (-> On hold, with a
 * reason, and back) -> Complete -> Reviewed (office approves, or sends back to In progress)
 * -> Invoiced -> Paid. Cancelled can happen any time before Invoiced.
 */
export type JobStatus =
  | "New"
  | "Scheduled"
  | "EnRoute"
  | "InProgress"
  | "OnHold"
  | "Complete"
  | "Reviewed"
  | "Invoiced"
  | "Paid"
  | "Cancelled";
export const JOB_STATUSES: JobStatus[] = [
  "New",
  "Scheduled",
  "EnRoute",
  "InProgress",
  "OnHold",
  "Complete",
  "Reviewed",
  "Invoiced",
  "Paid",
  "Cancelled",
];
/** Work not finished yet. */
export const ACTIVE_STATUSES: JobStatus[] = ["New", "Scheduled", "EnRoute", "InProgress", "OnHold"];
/** Work done on site (whatever the billing step). */
export const FINISHED_STATUSES: JobStatus[] = ["Complete", "Reviewed", "Invoiced", "Paid"];
export const isFinished = (s: JobStatus) => FINISHED_STATUSES.includes(s);

export type JobPriority = "Low" | "Normal" | "High" | "Emergency";
export const JOB_PRIORITIES: JobPriority[] = ["Low", "Normal", "High", "Emergency"];

export type InvoiceStatus = "Draft" | "Sent" | "Paid";

/** Business Services work types (owner's Smartsheets). */
export type WorkType = "HighVoltage" | "LowVoltage" | "Service";
export const WORK_TYPES: WorkType[] = ["HighVoltage", "LowVoltage", "Service"];

/** Job tracking health (Task Trackers "Health" column). */
export type JobHealth = "OnTrack" | "Watch" | "Behind";
export const JOB_HEALTHS: JobHealth[] = ["OnTrack", "Watch", "Behind"];

/** Sales stages 1 to 6, then the three closed outcomes. */
export type OpportunityStage =
  | "Prospect"
  | "Assessment"
  | "ProposalBidding"
  | "ProposalSent"
  | "CustomerReview"
  | "CustomerFollowUp"
  | "ClosedWon"
  | "ClosedLost"
  | "NoBid";
export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  "Prospect",
  "Assessment",
  "ProposalBidding",
  "ProposalSent",
  "CustomerReview",
  "CustomerFollowUp",
  "ClosedWon",
  "ClosedLost",
  "NoBid",
];
export const OPEN_STAGES: OpportunityStage[] = OPPORTUNITY_STAGES.slice(0, 6);

/** Customer contracts ECI works under (owner's pick list). */
export type CustomerContract =
  | "DeKalbGov"
  | "GwinnettSchools"
  | "RockdaleGov"
  | "BarrowSchools"
  | "DecaturCitySchools"
  | "DeKalbSchools"
  | "NonContract";
export const CUSTOMER_CONTRACTS: CustomerContract[] = [
  "DeKalbGov",
  "GwinnettSchools",
  "RockdaleGov",
  "BarrowSchools",
  "DecaturCitySchools",
  "DeKalbSchools",
  "NonContract",
];
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
  /** Spectrum import (Phase 4): set only on customers imported from Spectrum. */
  spectrumCompanyCode?: string | null;
  spectrumCustomerCode?: string | null;
}

export interface Site extends BaseRecord {
  customerId: string;
  name: string | null;
  address: string;
  accessNotes: string | null;
  /** Spectrum import (Phase 4): set only on sites imported from Spectrum. */
  spectrumCompanyCode?: string | null;
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
  /** Why the job is on hold (required for On hold) or was cancelled. */
  holdReason: string | null;
  /** Office review: the note when a job is sent back, and when it was approved. */
  reviewNote: string | null;
  reviewedAt: string | null;
  // ---- Business Services tracking (Phase 2). Never money: techs can read jobs. ----
  /** The opportunity this job was won from (its quote, PO and work order numbers live there). */
  opportunityId: string | null;
  workType: WorkType | null;
  health: JobHealth | null;
  /** Planned work dates (YYYY-MM-DD). Scheduled visits use scheduledStart/End. */
  startDate: string | null;
  endDate: string | null;
  poReceived: boolean;
  materialOrdered: boolean;
  materialDelivered: boolean;
  liftConnex: boolean;
  serviceReportApproved: boolean;
  /** Completion photos are on file somewhere other than this app (set by the importer). */
  completionPhotosOnFile: boolean;
  /**
   * Spectrum import (Phase 4). The match key is company code + job number (a Spectrum job)
   * or company code + work order number (a Spectrum work order, which also keeps its job number).
   */
  spectrumCompanyCode?: string | null;
  spectrumJobNumber?: string | null;
  spectrumWorkOrderNumber?: string | null;
  // ---- ECI1 tech module (docs/ECI1-BRIDGE.md). Optional: older records have none. ----
  /** Extra words with an On hold reason. */
  holdNote?: string | null;
  /** Last time the office changed the job (never moved by the tech's own changes). */
  officeChangedAt?: string | null;
  /** Short note from dispatch shown to the tech. */
  officeNote?: string | null;
  /** Why the job was completed without a signature. */
  noSignatureReason?: NoSignatureReason | null;
  noSignatureNote?: string | null;
  /** Materials used, as the tech last sent them (replaced whole). */
  materials?: JobMaterial[] | null;
  materialsAt?: string | null;
  techStatusAt?: string | null;
}

export type NoSignatureReason = "not_on_site" | "unable_to_sign" | "other";
export interface JobMaterial {
  name: string;
  qty: number;
  unit: string;
}

/** A note a tech added from the ECI1 phone app. */
export interface TechNote extends BaseRecord {
  jobId: string;
  assignedTechId: string | null;
  text: string;
  by: string | null;
  at: string;
  actionId: string | null;
}

export type ReceiptReview = "Pending" | "Approved" | "Rejected";
/** A receipt a tech sent from the ECI1 phone app, for office review. */
export interface TechReceipt extends BaseRecord {
  jobId: string;
  assignedTechId: string | null;
  kind: "materials" | "other";
  vendor: string | null;
  date: string | null;
  amount: number;
  /** "personal" means the tech is owed the money back. */
  paidWith: "company_card" | "personal";
  note: string | null;
  storagePath: string | null;
  at: string;
  actionId: string | null;
  reviewStatus: ReceiptReview;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** Tracking defaults for a new job. */
export const JOB_TRACKING_DEFAULTS = {
  holdReason: null,
  reviewNote: null,
  reviewedAt: null,
  opportunityId: null,
  workType: null,
  health: null,
  startDate: null,
  endDate: null,
  poReceived: false,
  materialOrdered: false,
  materialDelivered: false,
  liftConnex: false,
  serviceReportApproved: false,
  completionPhotosOnFile: false,
} satisfies Partial<Job>;

/**
 * A sales opportunity (replaces the Sales and Service Pipeline Smartsheets).
 * Office and owner roles only; techs never read this table, so amounts stay here, not on the job.
 * Dates are YYYY-MM-DD.
 */
export interface Opportunity extends BaseRecord {
  name: string;
  customerId: string | null;
  customerContract: CustomerContract;
  type: WorkType;
  stage: OpportunityStage;
  customerContact: string | null;
  invoiceContact: string | null;
  eciQuoteNumber: string | null;
  workOrderNumber: string | null;
  customerPoNumber: string | null;
  quoteDue: string | null;
  expectedClose: string | null;
  siteVisitDate: string | null;
  salesRep: string | null;
  priority: string | null;
  /** 0 to 100. */
  probability: number | null;
  hoursQuoted: number | null;
  quotedAmount: number | null;
  forecastAmount: number | null;
  jobCost: number | null;
  invoicedAmount: number | null;
  /** Percent, e.g. 22.5. */
  quotedMargin: number | null;
  completedMargin: number | null;
  notes: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  /** Show the next step in "Needs attention" once it is due. */
  nextStepRemind: boolean;
  closedAt: string | null;
  /** The job this opportunity became when won. */
  jobId: string | null;
  /** Where an imported row came from (sheet and row), so a re-run can skip it. */
  importKey: string | null;
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
/** One Spectrum connection test, recorded by Serv1 (the connector keeps none). Admin only. */
export interface SpectrumCheck extends BaseRecord {
  result: "connected" | "failed";
  reason: string | null;
  message: string | null;
  durationMs: number | null;
  checkedBy: string;
}

export type NewUser = Input<User>;
export type NewCustomer = Input<Customer>;
export type NewSite = Input<Site>;
export type NewJob = Input<Job>;
export type NewAttachment = Input<Attachment>;
export type NewSignature = Input<Signature>;
export type NewInvoice = Input<Invoice>;
export type NewOpportunity = Input<Opportunity>;
export type NewSpectrumCheck = Input<SpectrumCheck>;
export type NewTechNote = Input<TechNote>;
export type NewTechReceipt = Input<TechReceipt>;

export type TableName =
  | "users"
  | "customers"
  | "sites"
  | "jobs"
  | "attachments"
  | "signatures"
  | "invoices"
  | "opportunities"
  | "spectrumChecks"
  | "techNotes"
  | "techReceipts";

export const TABLES: TableName[] = [
  "users",
  "customers",
  "sites",
  "jobs",
  "attachments",
  "signatures",
  "invoices",
  "opportunities",
  "spectrumChecks",
  "techNotes",
  "techReceipts",
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
