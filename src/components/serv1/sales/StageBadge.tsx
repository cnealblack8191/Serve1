import type { OpportunityStage } from "@/data";
import { STAGE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Neutral stage pill (job status colors keep their one meaning, SPEC.md section 12). */
export function StageBadge({ stage }: { stage: OpportunityStage }) {
  // Job status colors (gray, blue, orange, green, purple) are not reused here.
  const tone =
    stage === "ClosedWon"
      ? "bg-eci-navy text-zinc-50 ring-eci-navy dark:bg-zinc-100 dark:text-eci-navy dark:ring-zinc-100"
      : stage === "ClosedLost"
        ? "bg-background text-red-800 ring-red-300 dark:text-red-300 dark:ring-red-800"
        : stage === "NoBid"
          ? "bg-muted text-muted-foreground ring-border"
          : "bg-background text-foreground ring-zinc-400 dark:ring-zinc-500";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        tone,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
