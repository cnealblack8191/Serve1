import type {
  CustomerContract,
  JobHealth,
  JobPriority,
  JobStatus,
  OpportunityStage,
  WorkType,
} from "@/data";

/** SPEC.md section 12: one meaning per color, used everywhere. */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  New: "New",
  Scheduled: "Scheduled",
  EnRoute: "En route",
  InProgress: "In Progress",
  OnHold: "On hold",
  Complete: "Complete",
  Reviewed: "Reviewed",
  Invoiced: "Invoiced",
  Paid: "Paid",
  Cancelled: "Cancelled",
};

/**
 * Tailwind classes for badges and board cards. SPEC section 12 colors (gray, blue, orange,
 * green, purple) keep their meaning; Phase 3 adds cyan (en route), yellow (on hold),
 * teal (reviewed), fuchsia (paid) and red (cancelled). Every badge also shows its label.
 */
export const JOB_STATUS_CLASS: Record<JobStatus, string> = {
  New: "bg-gray-100 text-gray-800 ring-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600",
  Scheduled:
    "bg-blue-100 text-blue-800 ring-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-700",
  InProgress:
    "bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-900 dark:text-orange-100 dark:ring-orange-700",
  Complete:
    "bg-green-100 text-green-800 ring-green-300 dark:bg-green-900 dark:text-green-100 dark:ring-green-700",
  Invoiced:
    "bg-purple-100 text-purple-800 ring-purple-300 dark:bg-purple-900 dark:text-purple-100 dark:ring-purple-700",
  EnRoute:
    "bg-cyan-100 text-cyan-900 ring-cyan-300 dark:bg-cyan-900 dark:text-cyan-100 dark:ring-cyan-700",
  OnHold:
    "bg-yellow-100 text-yellow-900 ring-yellow-400 dark:bg-yellow-900 dark:text-yellow-100 dark:ring-yellow-700",
  Reviewed:
    "bg-teal-100 text-teal-900 ring-teal-300 dark:bg-teal-900 dark:text-teal-100 dark:ring-teal-700",
  Paid: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-300 dark:bg-fuchsia-900 dark:text-fuchsia-100 dark:ring-fuchsia-700",
  Cancelled:
    "bg-red-50 text-red-800 ring-red-300 line-through dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
};

/** Solid color for board cards and chart segments. */
export const JOB_STATUS_HEX: Record<JobStatus, string> = {
  New: "#6b7280",
  Scheduled: "#2563eb",
  InProgress: "#ea580c",
  Complete: "#16a34a",
  Invoiced: "#7c3aed",
  EnRoute: "#0891b2",
  OnHold: "#ca8a04",
  Reviewed: "#0d9488",
  Paid: "#c026d3",
  Cancelled: "#dc2626",
};

export const PRIORITY_LABEL: Record<JobPriority, string> = {
  Low: "Low",
  Normal: "Normal",
  High: "High",
  Emergency: "Emergency",
};

/** Sales stages as the owner numbers them in the Smartsheets. */
export const STAGE_LABEL: Record<OpportunityStage, string> = {
  Prospect: "1 Prospect",
  Assessment: "2 Assessment",
  ProposalBidding: "3 Proposal / bidding",
  ProposalSent: "4 Proposal / bid sent",
  CustomerReview: "5 Customer review",
  CustomerFollowUp: "6 Customer follow-up",
  ClosedWon: "Closed won",
  ClosedLost: "Closed lost",
  NoBid: "No bid",
};

export const CONTRACT_LABEL: Record<CustomerContract, string> = {
  DeKalbGov: "DeKalb Gov.",
  GwinnettSchools: "Gwinnett Schools",
  RockdaleGov: "Rockdale Gov.",
  BarrowSchools: "Barrow Schools",
  DecaturCitySchools: "Decatur City Schools",
  DeKalbSchools: "DeKalb Schools",
  NonContract: "Non-contract",
};

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  HighVoltage: "High Voltage",
  LowVoltage: "Low Voltage",
  Service: "Service",
};

/** Work health: green / amber / red, with a text label (never color alone). */
export const HEALTH_LABEL: Record<JobHealth, string> = {
  OnTrack: "On track",
  Watch: "Watch",
  Behind: "Behind",
};
export const HEALTH_CLASS: Record<JobHealth, string> = {
  OnTrack:
    "bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  Watch:
    "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  Behind: "bg-red-50 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
};
export const HEALTH_HEX: Record<JobHealth | "NotSet", string> = {
  OnTrack: "#15803d",
  Watch: "#f59e0b",
  Behind: "#b91c1c",
  NotSet: "#d4d4d8",
};
