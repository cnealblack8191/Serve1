/**
 * Bid opportunity intake — shared types (browser safe).
 *
 * Everything here is *proposed* data extracted from an incoming email. It only
 * becomes business data after a person reviews it and selects BID.
 */

export type IntakeStatus = "pending" | "bid" | "no_bid" | "dismissed";

export type CustomerMatchState = "matched" | "ambiguous" | "new";

/** Structured data the extraction layer must return. */
export interface IntakeExtraction {
  customerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectName: string;
  projectAddress: string;
  bidDueDate: string;
  bidDueTime: string;
  description: string;
  scope: string;
  invitationText: string;
  jobType: string;
  division: string;
  estimatedValue: number | null;
  addenda: string;
}

export const EMPTY_EXTRACTION: IntakeExtraction = {
  customerName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  projectName: "",
  projectAddress: "",
  bidDueDate: "",
  bidDueTime: "",
  description: "",
  scope: "",
  invitationText: "",
  jobType: "",
  division: "",
  estimatedValue: null,
  addenda: "",
};

export interface IntakeLink {
  label: string;
  url: string;
}

export interface IntakeAttachment {
  name: string;
  extension: string;
  sizeBytes: number | null;
  /** SharePoint/web URL when known; empty while the file still lives in mail. */
  webUrl: string;
}

export interface IntakeRecord {
  id: string;
  messageId: string | null;
  threadId: string | null;
  status: IntakeStatus;
  isBidInvitation: boolean;
  /** 0-1 classification confidence from the extraction layer. */
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  extracted: IntakeExtraction;
  fieldConfidence: Record<string, number>;
  customerMatch: CustomerMatchState;
  matchedCustomer: string | null;
  candidateCustomers: string[];
  attachments: IntakeAttachment[];
  links: IntakeLink[];
  fromName: string;
  fromAddress: string;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  opportunityId: string | null;
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** Fields that must be present before an intake can become an opportunity. */
export const REQUIRED_FIELDS: (keyof IntakeExtraction)[] = [
  "projectName",
  "customerName",
  "bidDueDate",
];

export function missingRequired(x: IntakeExtraction): (keyof IntakeExtraction)[] {
  return REQUIRED_FIELDS.filter((f) => !String(x[f] ?? "").trim());
}

export function confidenceLabel(v: number): { label: string; tone: "high" | "medium" | "low" } {
  if (v >= 0.8) return { label: "High confidence", tone: "high" };
  if (v >= 0.5) return { label: "Needs review", tone: "medium" };
  return { label: "Low confidence", tone: "low" };
}
