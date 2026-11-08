import { useEffect, useState } from "react";

import { EmptyState, SectionHeading } from "@/components/eci/primitives";
import { StoredImage } from "@/components/serv1/office/StoredImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useJobMutations,
  useReviewReceipt,
  useTechNotes,
  useTechReceipts,
  type Job,
  type TechReceipt,
} from "@/data";
import {
  NO_SIGNATURE_LABEL,
  PAID_WITH_LABEL,
  RECEIPT_REVIEW_CLASS,
  RECEIPT_REVIEW_LABEL,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * What the tech sent from the ECI1 phone app (docs/ECI1-BRIDGE.md): notes, materials used and
 * receipts for review, plus the office's note to the tech. Office edits; owner reads.
 */
export function TechWork({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const notes = useTechNotes(job.id);
  const receipts = useTechReceipts(job.id);
  const materials = job.materials ?? [];

  return (
    <section className="space-y-4" aria-labelledby="tech-work">
      <div id="tech-work">
        <SectionHeading
          title="Tech's work"
          description="Notes, materials and receipts the tech sent from the ECI1 phone app."
        />
      </div>

      <OfficeNote job={job} canEdit={canEdit} />

      {job.status === "Complete" && job.noSignatureReason ? (
        <p className="eci-card p-4 text-sm" role="status">
          <span className="font-semibold">Completed without a signature:</span>{" "}
          {NO_SIGNATURE_LABEL[job.noSignatureReason] ?? job.noSignatureReason}
          {job.noSignatureNote ? ` — ${job.noSignatureNote}` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="eci-card space-y-2 p-4">
          <h3 className="text-sm font-semibold">Tech notes</h3>
          {(notes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes from the tech.</p>
          ) : (
            <ul className="space-y-2 text-sm" aria-label="Tech notes">
              {notes.data!.map((n) => (
                <li key={n.id}>
                  <p>{n.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.by ?? "Tech"} · {when(n.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="eci-card space-y-2 p-4">
          <h3 className="text-sm font-semibold">Materials used</h3>
          {materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">None reported.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Materials used</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Item</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={`${m.name}-${i}`} className="border-t border-border/70">
                    <td className="py-1">{m.name}</td>
                    <td className="py-1 text-right tabular-nums">
                      {m.qty} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Receipts</h3>
        {(receipts.data ?? []).length === 0 ? (
          <EmptyState title="No receipts" hint="Receipts the tech sends appear here for review." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Receipts">
            {receipts.data!.map((r) => (
              <ReceiptCard key={r.id} receipt={r} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function OfficeNote({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const { update } = useJobMutations();
  const [text, setText] = useState(job.officeNote ?? "");
  useEffect(() => setText(job.officeNote ?? ""), [job.officeNote]);
  if (!canEdit)
    return job.officeNote ? (
      <p className="eci-card p-4 text-sm">
        <span className="font-semibold">Note to the tech:</span> {job.officeNote}
      </p>
    ) : null;
  const changed = text.trim() !== (job.officeNote ?? "");
  return (
    <form
      className="eci-card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed)
          update.mutate({ id: job.id, patch: { officeNote: text.trim().slice(0, 500) || null } });
      }}
    >
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Note to the tech</span>
        <Input
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Shown on the tech's phone with this job"
        />
      </label>
      <Button type="submit" variant="outline" disabled={!changed || update.isPending}>
        {update.isPending ? "Saving…" : "Save note"}
      </Button>
      {update.isError ? (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          Couldn&apos;t save the note. Try again.
        </p>
      ) : null}
    </form>
  );
}

function ReceiptCard({ receipt: r, canEdit }: { receipt: TechReceipt; canEdit: boolean }) {
  const review = useReviewReceipt();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const label = `Receipt from ${r.vendor ?? "unknown vendor"}`;

  return (
    <li className="eci-card space-y-3 p-4" aria-label={label}>
      {r.storagePath ? <StoredImage path={r.storagePath} alt={label} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{r.vendor ?? "Unknown vendor"}</p>
          <p className="text-sm text-muted-foreground">
            {r.kind === "materials" ? "Materials" : "Other"} · {r.date ?? when(r.at)}
          </p>
        </div>
        <p className="text-lg font-semibold tabular-nums">{money(r.amount)}</p>
      </div>
      <p className="text-sm">
        Paid with: <span className="font-medium">{PAID_WITH_LABEL[r.paidWith]}</span>
      </p>
      {r.note ? <p className="text-sm text-muted-foreground">{r.note}</p> : null}
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1",
            RECEIPT_REVIEW_CLASS[r.reviewStatus],
          )}
        >
          {RECEIPT_REVIEW_LABEL[r.reviewStatus]}
        </span>
        {r.reviewedBy ? (
          <span className="text-muted-foreground">
            by {r.reviewedBy}
            {r.reviewNote ? `: ${r.reviewNote}` : ""}
          </span>
        ) : null}
      </p>
      {canEdit ? (
        rejecting ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate(
                { receipt: r, status: "Rejected", note: reason },
                { onSuccess: () => setRejecting(false) },
              );
            }}
          >
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-medium">Why is it rejected?</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <Button
              type="submit"
              variant="destructive"
              disabled={!reason.trim() || review.isPending}
            >
              Reject receipt
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
              Back
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.reviewStatus !== "Approved" ? (
              <Button
                size="sm"
                onClick={() => review.mutate({ receipt: r, status: "Approved" })}
                disabled={review.isPending}
              >
                Approve
              </Button>
            ) : null}
            {r.reviewStatus !== "Rejected" ? (
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            ) : null}
            {r.reviewStatus !== "Pending" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => review.mutate({ receipt: r, status: "Pending" })}
                disabled={review.isPending}
              >
                Undo review
              </Button>
            ) : null}
          </div>
        )
      ) : null}
      {review.isError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Couldn&apos;t save the review. Try again.
        </p>
      ) : null}
    </li>
  );
}
