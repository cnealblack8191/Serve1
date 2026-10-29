import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { decideIntake, intakeCounts, listIntake, scanInbox, updateIntake } from "./intake.functions";
import type { IntakeStatus } from "./types";

const fail = (e: unknown) =>
  toast.error("Bid intake error", { description: e instanceof Error ? e.message : String(e) });

export function useIntakeList(status: IntakeStatus | "all") {
  return useQuery({
    queryKey: ["intake", "list", status],
    staleTime: 15_000,
    queryFn: () => listIntake({ data: { status } }),
  });
}

export function useIntakeCounts() {
  return useQuery({
    queryKey: ["intake", "counts"],
    staleTime: 30_000,
    queryFn: () => intakeCounts({ data: undefined }),
  });
}

export function useIntakeActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["intake"] });
    void qc.invalidateQueries({ queryKey: ["eci"] });
  };

  const scan = useMutation({
    mutationFn: () => scanInbox({ data: { limit: 15 } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.queued > 0
          ? `${r.queued} bid invitation${r.queued === 1 ? "" : "s"} added to the review queue.`
          : "No new bid invitations found.",
        { description: `${r.scanned} new message${r.scanned === 1 ? "" : "s"} screened.` },
      );
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateIntake>[0]["data"]) => updateIntake({ data: input }),
    onSuccess: invalidate,
    onError: fail,
  });

  const decide = useMutation({
    mutationFn: (input: Parameters<typeof decideIntake>[0]["data"]) => decideIntake({ data: input }),
    onSuccess: (r) => {
      invalidate();
      if (r.status === "bid") {
        toast.success("Opportunity created", {
          description: `${r.opportunityId} is now in the CRM pipeline, ready for estimating.`,
        });
      } else {
        toast.success("Marked no bid", { description: "Kept as history, out of active estimating." });
      }
    },
    onError: fail,
  });

  return { scan, update, decide };
}
