import { Link } from "@tanstack/react-router";

import { ATTENTION_REASON_LABEL, dispatchAttention, type Customer, type Job } from "@/data";

import { jobLabel } from "./board";

/** Dispatcher's "needs attention" queue: late, urgent and stuck jobs, each linking to the job. */
export function AttentionQueue({
  jobs,
  customers,
}: {
  jobs: Job[];
  customers: Map<string, Customer>;
}) {
  const items = dispatchAttention(jobs);
  return (
    <section aria-label="Needs attention" className="eci-card space-y-2 p-3">
      <h2 className="flex items-center justify-between text-sm font-semibold">
        Needs attention
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ job, reason }) => (
            <li key={job.id}>
              <Link
                to="/jobs/$id"
                params={{ id: job.id }}
                className="flex min-h-11 flex-col justify-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">
                  {jobLabel(job)} · {customers.get(job.customerId)?.name ?? "Customer"}
                </span>
                <span className="text-muted-foreground">
                  {ATTENTION_REASON_LABEL[reason]}
                  {reason === "onHold" && job.holdReason ? `: ${job.holdReason}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
