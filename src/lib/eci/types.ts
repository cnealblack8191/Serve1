export type Role =
  | "Admin"
  | "Division Manager"
  | "Service Manager"
  | "Coordinator"
  | "AP/AR"
  | "Field";

export type Permission =
  | "dashboard"
  | "crm"
  | "bids"
  | "jobs"
  | "materials"
  | "invoices"
  | "ap"
  | "approve_quotes"
  | "send_email"
  | "manage_permissions"
  | "field";

export const ROLES: Role[] = [
  "Admin",
  "Division Manager",
  "Service Manager",
  "Coordinator",
  "AP/AR",
  "Field",
];

export const ROLE_PRESETS: Record<Role, Permission[]> = {
  Admin: [
    "dashboard",
    "crm",
    "bids",
    "jobs",
    "materials",
    "invoices",
    "ap",
    "approve_quotes",
    "send_email",
    "manage_permissions",
    "field",
  ],
  "Division Manager": [
    "dashboard",
    "crm",
    "bids",
    "jobs",
    "materials",
    "invoices",
    "ap",
    "approve_quotes",
    "send_email",
    "manage_permissions",
    "field",
  ],
  "Service Manager": [
    "dashboard",
    "crm",
    "bids",
    "jobs",
    "materials",
    "invoices",
    "send_email",
  ],
  Coordinator: ["crm", "bids", "jobs", "materials", "invoices", "send_email"],
  "AP/AR": ["dashboard", "jobs", "materials", "invoices", "ap", "send_email"],
  Field: ["field", "jobs", "materials"],
};

export type OpportunityStage =
  | "New Opportunity"
  | "Bid or No-Bid Decision"
  | "Approved to Estimate"
  | "No-Bid";

export type OpportunitySource = "Manual" | "Sales" | "Service";

export type BidStage =
  | "Estimating"
  | "Awaiting Approval"
  | "Ready to Send"
  | "Sent to Customer"
  | "Won"
  | "Lost";

export type ActivityKind =
  | "stage"
  | "note"
  | "email"
  | "document"
  | "reminder"
  | "system";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  message: string;
  actor: string;
  at: string;
}

export type RateType = "Contract" | "Non-Contract";

export type QuoteFormat = "Lump Sum" | "Itemized";

export interface MarkupRow {
  costCode: string;
  contractMarkup: number;
  nonContractMarkup: number;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  primary?: boolean;
}

export interface DocumentRef {
  id: string;
  name: string;
  kind: "PDF" | "XLSX" | "Photo" | "Receipt" | "DWG";
  size: string;
  uploadedBy: string;
  at: string;
}

/** External bid-package file link (OneDrive / SharePoint), not app storage. */
export interface BidPackageLink {
  id: string;
  label: string;
  url: string;
  addedBy: string;
  at: string;
}

/** Standard bid folder labels; anything else is added as a custom link. */
export const BID_LINK_LABELS = [
  "Exhibit A",
  "Exhibit B",
  "Exhibit C",
  "Submittals",
  "Bid Documents",
  "Supplier Quotes",
] as const;

export interface Opportunity {
  id: string;
  name: string;
  customer: string;
  contactName: string;
  address: string;
  jobType: string;
  division: string;
  expectedBidDate: string;
  description: string;
  notes: string;
  assignedTo: string;
  value: number;
  stage: OpportunityStage;
  /** Pipeline used to create or import this opportunity. */
  source: OpportunitySource;
  /** Effective rate type for this opportunity (customer default or override). */
  rateType: RateType;
  contacts: Contact[];
  documents: DocumentRef[];
  activity: ActivityEntry[];
  bidId?: string;
}

export type CostCategory =
  | "Labor"
  | "Material"
  | "Equipment"
  | "Subcontractor"
  | "Other";

export interface LineItem {
  id: string;
  costCode: string;
  category: CostCategory;
  description: string;
  customerDescription: string;
  qty: number;
  unit: string;
  unitCost: number;
  markup: number;
  internalNote: string;
}

export interface ApprovalRecord {
  id: string;
  approver: string;
  role: string;
  status: "Pending" | "Approved" | "Rejected" | "Changes Requested";
  comment?: string;
  at?: string;
}

export interface Bid {
  id: string;
  opportunityId: string;
  name: string;
  customer: string;
  address: string;
  division: string;
  jobType: string;
  owner: string;
  stage: BidStage;
  /** Rate column line-item markups should reference in the customer markupTable. */
  rateType: RateType;
  lineItems: LineItem[];
  /** Links to bid files stored externally in OneDrive / SharePoint. */
  packageLinks: BidPackageLink[];
  approvals: ApprovalRecord[];
  approvalGroup: string;
  pdfGenerated: boolean;
  sentAt?: string;
  activity: ActivityEntry[];
  jobId?: string;
}

export type WorkOrderStatus =
  | "Scheduled"
  | "In Progress"
  | "On Hold"
  | "Complete";

export interface WorkOrder {
  id: string;
  number: string;
  jobId: string;
  title: string;
  technician: string;
  priority: "Priority 1" | "Priority 2" | "Priority 3";
  status: WorkOrderStatus;
  scheduled: string;
  tasks: { id: string; label: string; done: boolean }[];
  notes: string[];
  description?: string;
  siteContact?: string;
  siteContactPhone?: string;
  arrival?: string;
  photos?: WorkOrderPhoto[];
  completion?: WorkOrderCompletion;
}

export interface WorkOrderPhoto {
  id: string;
  src: string;
  caption: string;
  at: string;
}

export interface WorkOrderCompletion {
  summary: string;
  hours: string;
  materialsUsed: string;
  signedBy: string;
  completedAt: string;
}

export type JobStatus =
  | "Active"
  | "Scheduled"
  | "Pending PO"
  | "On Hold"
  | "Closed";

export interface Job {
  id: string;
  name: string;
  phase: string;
  customer: string;
  address: string;
  status: JobStatus;
  division: string;
  manager: string;
  spectrumNumber: string;
  contractValue: number;
  contacts: Contact[];
  documents: DocumentRef[];
  activity: ActivityEntry[];
  bidId?: string;
  spectrumSync: SyncState;
}

export type SyncState = "Not Connected" | "Connecting" | "Synced" | "Failed";

export type MaterialStatus = "Requested" | "Approved" | "Ordered" | "Delivered";

export interface MaterialRequest {
  id: string;
  jobId: string;
  jobName: string;
  workOrder: string;
  item: string;
  qty: string;
  requestedBy: string;
  requestedAt: string;
  status: MaterialStatus;
  poNumber?: string | undefined;
  notes: string;
}

export type InvoiceStatus =
  | "Draft"
  | "Submitted to Spectrum"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Overdue";

export interface Invoice {
  id: string;
  number: string;
  jobId: string;
  jobName: string;
  customer: string;
  amount: number;
  balance: number;
  issued: string;
  due: string;
  status: InvoiceStatus;
  notes: string[];
}

export interface Receipt {
  id: string;
  vendor: string;
  amount: number;
  jobId: string;
  jobName: string;
  workOrder: string;
  submittedBy: string;
  at: string;
  poNumber?: string | undefined;
  matched: boolean;
  missingDocs: boolean;
  complete: boolean;
  notes: string[];
}

export interface EmailRecord {
  id: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  at: string;
  recordId: string;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  kind: "stage" | "approval" | "workorder" | "material" | "invoice" | "reminder";
}

export interface PendingSyncItem {
  id: string;
  label: string;
  kind: "Note" | "Photo" | "Receipt" | "Signature" | "Status";
  at: string;
  conflict?: boolean;
}

export interface Reminder {
  id: string;
  recordId: string;
  title: string;
  due: string;
  assignedTo: string;
  note: string;
  done: boolean;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  phone: string;
  email: string;
  active: boolean;
  addedAt: string;
}
