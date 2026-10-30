import type { JobStatus } from "@/data";
import { JOB_STATUS_CLASS, JOB_STATUS_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Status pill using the SPEC section 12 colors from src/lib/status.ts. */
export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1",
        JOB_STATUS_CLASS[status],
        className,
      )}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}
