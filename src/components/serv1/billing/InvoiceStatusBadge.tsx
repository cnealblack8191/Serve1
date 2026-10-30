import type { InvoiceStatus } from "@/data";
import { JOB_STATUS_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Invoice status badge, readable in light and dark mode. Colors come from the shared
 * palette in src/lib/status.ts (AGENTS.md): Draft gray, Sent blue, Paid green.
 */
const TONE: Record<InvoiceStatus, string> = {
  Draft: JOB_STATUS_CLASS.New,
  Sent: JOB_STATUS_CLASS.Scheduled,
  Paid: JOB_STATUS_CLASS.Complete,
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1",
        TONE[status],
      )}
    >
      {status}
    </span>
  );
}
