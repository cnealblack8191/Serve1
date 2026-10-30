import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JOB_STATUS_HEX } from "@/lib/status";

import { BottomAction, PRIMARY_BUTTON } from "./BottomAction";

/** Shown right after the customer signs (SPEC.md section 13, "Done confirmation"). */
export function DoneScreen({ customerName }: { customerName?: string }) {
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <CheckCircle2
          className="size-20"
          style={{ color: JOB_STATUS_HEX.Complete }}
          aria-hidden
          strokeWidth={1.5}
        />
        <h1 className="text-2xl font-semibold">Job complete</h1>
        <p className="max-w-[32ch] text-base text-muted-foreground">
          {customerName ? `${customerName} signed off. ` : "Signature saved. "}
          The office can now invoice this job.
        </p>
      </div>
      <BottomAction>
        <Button asChild className={PRIMARY_BUTTON}>
          <Link to="/tech">Back to Today</Link>
        </Button>
      </BottomAction>
    </>
  );
}
