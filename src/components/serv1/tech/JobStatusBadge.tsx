import type { JobPriority, JobStatus } from "@/data";
import { JOB_STATUS_CLASS, JOB_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1",
        JOB_STATUS_CLASS[status],
      )}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}

/** Priority is plain text; only High and Emergency stand out (red is not a status color). */
export function PriorityTag({ priority }: { priority: JobPriority }) {
  const urgent = priority === "High" || priority === "Emergency";
  return (
    <span
      className={cn(
        "text-sm font-medium",
        urgent ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
      )}
    >
      {PRIORITY_LABEL[priority]} priority
    </span>
  );
}
