import type { JobPriority, JobStatus } from "@/data";

/** SPEC.md section 12: one meaning per color, used everywhere. */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  New: "New",
  Scheduled: "Scheduled",
  InProgress: "In Progress",
  Complete: "Complete",
  Invoiced: "Invoiced",
};

/** Tailwind classes for badges and board cards. Gray, blue, orange, green, purple. */
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
};

/** Solid color for board cards and chart segments. */
export const JOB_STATUS_HEX: Record<JobStatus, string> = {
  New: "#6b7280",
  Scheduled: "#2563eb",
  InProgress: "#ea580c",
  Complete: "#16a34a",
  Invoiced: "#7c3aed",
};

export const PRIORITY_LABEL: Record<JobPriority, string> = {
  Low: "Low",
  Normal: "Normal",
  High: "High",
  Emergency: "Emergency",
};
