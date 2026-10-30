import { JOB_STATUSES } from "@/data";
import { JOB_STATUS_HEX, JOB_STATUS_LABEL } from "@/lib/status";

/** One legend for the board's colors (SPEC.md section 11). */
export function StatusLegend() {
  return (
    <ul aria-label="Status colors" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {JOB_STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm"
            style={{ backgroundColor: JOB_STATUS_HEX[s] }}
          />
          {JOB_STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}
