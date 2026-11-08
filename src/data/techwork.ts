import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend, nowIso } from "./backend";
import { keys } from "./hooks";
import type { ReceiptReview, TechNote, TechReceipt } from "./types";

/**
 * Work a tech sends from the ECI1 phone app (docs/ECI1-BRIDGE.md): notes, materials and
 * receipts. The bridge writes them; office screens read them and review receipts here.
 */

export const useTechNotes = (jobId?: string) =>
  useQuery<TechNote[]>({
    queryKey: [...keys.table("techNotes"), jobId ?? ""],
    queryFn: async () =>
      (await backend().techNotes.list())
        .filter((n) => n.jobId === jobId)
        .sort((a, b) => a.at.localeCompare(b.at)),
    enabled: !!jobId,
  });

export const useTechReceipts = (jobId?: string) =>
  useQuery<TechReceipt[]>({
    queryKey: [...keys.table("techReceipts"), jobId ?? ""],
    queryFn: async () =>
      (await backend().techReceipts.list())
        .filter((r) => r.jobId === jobId)
        .sort((a, b) => a.at.localeCompare(b.at)),
    enabled: !!jobId,
  });

/** Approve or reject a receipt (Admin and Office). A rejection needs a reason. */
export function useReviewReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { receipt: TechReceipt; status: ReceiptReview; note?: string }) => {
      const note = v.note?.trim() || null;
      if (v.status === "Rejected" && !note) throw new Error("Please give a reason.");
      const me = await backend().auth.currentUser();
      return backend().techReceipts.update(v.receipt.id, {
        reviewStatus: v.status,
        reviewNote: v.status === "Pending" ? null : note,
        reviewedBy: v.status === "Pending" ? null : me?.name || me?.email || null,
        reviewedAt: v.status === "Pending" ? null : nowIso(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.table("techReceipts") }),
  });
}
