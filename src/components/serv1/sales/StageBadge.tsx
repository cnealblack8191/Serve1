import type { OpportunityStage } from "@/data";
import { STAGE_CLASS, STAGE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Neutral stage pill (job status colors keep their one meaning, SPEC.md section 12). */
export function StageBadge({ stage }: { stage: OpportunityStage }) {
  const tone = STAGE_CLASS[stage];
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
