import type { InvoiceStatus } from "@/data";
import { cn } from "@/lib/utils";

/** Invoice status badge that stays readable in light and dark mode. */
const TONE: Record<InvoiceStatus, string> = {
  Draft:
    "bg-gray-100 text-gray-800 ring-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600",
  Sent: "bg-blue-100 text-blue-800 ring-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-700",
  Paid: "bg-green-100 text-green-800 ring-green-300 dark:bg-green-900 dark:text-green-100 dark:ring-green-700",
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
