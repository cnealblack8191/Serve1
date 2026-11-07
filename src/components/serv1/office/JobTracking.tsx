import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { DataRow, SectionHeading } from "@/components/eci/primitives";
import { dateLabel, SELECT_CLASS } from "@/components/serv1/sales/format";
import { Input } from "@/components/ui/input";
import {
  JOB_HEALTHS,
  WORK_TYPES,
  useJobMutations,
  useOpportunity,
  type Job,
  type JobHealth,
  type WorkType,
} from "@/data";
import { CONTRACT_LABEL, HEALTH_CLASS, HEALTH_LABEL, WORK_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

const CHECKS: { key: keyof Job; label: string }[] = [
  { key: "poReceived", label: "PO received" },
  { key: "materialOrdered", label: "Material ordered" },
  { key: "materialDelivered", label: "Material delivered" },
  { key: "liftConnex", label: "Lift / Connex" },
  { key: "serviceReportApproved", label: "Service report approved" },
  { key: "completionPhotosOnFile", label: "Completion photos on file elsewhere" },
];

export function HealthBadge({ health }: { health: JobHealth | null }) {
  if (!health) return <span className="text-sm text-muted-foreground">Not set</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        HEALTH_CLASS[health],
      )}
    >
      {HEALTH_LABEL[health]}
    </span>
  );
}

/** Business Services tracking on the office job page. Office edits; owner reads. */
export function JobTracking({
  job: saved,
  canEdit,
  photoCount,
}: {
  job: Job;
  canEdit: boolean;
  photoCount: number;
}) {
  const { update } = useJobMutations();
  const opp = useOpportunity(saved.opportunityId ?? undefined);
  // Show a change at once; the saved job replaces it when it comes back (or on error).
  const [pending, setPending] = useState<Partial<Job>>({});
  useEffect(() => setPending({}), [saved.updatedAt]);
  const job = { ...saved, ...pending };
  const save = (patch: Partial<Job>) => {
    setPending((p) => ({ ...p, ...patch }));
    update.mutate({ id: saved.id, patch }, { onError: () => setPending({}) });
  };

  return (
    <section className="space-y-3">
      <SectionHeading title="Tracking" />
      <div className="eci-card space-y-4 p-5">
        {canEdit ? (
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Health
              <select
                className={SELECT_CLASS}
                value={job.health ?? ""}
                onChange={(e) => save({ health: (e.target.value || null) as JobHealth | null })}
              >
                <option value="">Not set</option>
                {JOB_HEALTHS.map((h) => (
                  <option key={h} value={h}>
                    {HEALTH_LABEL[h]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Work type
              <select
                className={SELECT_CLASS}
                value={job.workType ?? ""}
                onChange={(e) => save({ workType: (e.target.value || null) as WorkType | null })}
              >
                <option value="">Not set</option>
                {WORK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WORK_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Start date
              <Input
                type="date"
                value={job.startDate ?? ""}
                onChange={(e) => save({ startDate: e.target.value || null })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              End date
              <Input
                type="date"
                value={job.endDate ?? ""}
                onChange={(e) => save({ endDate: e.target.value || null })}
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-x-8 sm:grid-cols-4">
            <DataRow label="Health" value={<HealthBadge health={job.health} />} />
            <DataRow label="Work type" value={job.workType ? WORK_TYPE_LABEL[job.workType] : "—"} />
            <DataRow label="Start date" value={dateLabel(job.startDate)} />
            <DataRow label="End date" value={dateLabel(job.endDate)} />
          </div>
        )}
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">Checklist</legend>
          {CHECKS.map((c) => (
            <label key={c.key} className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--eci-copper)]"
                checked={!!job[c.key]}
                disabled={!canEdit}
                onChange={(e) => save({ [c.key]: e.target.checked } as Partial<Job>)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">Completion photos in Serv1: {photoCount}</p>
        {update.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not save. Try again.
          </p>
        ) : null}
      </div>

      {opp.data ? (
        <div className="eci-card grid gap-x-8 px-5 py-2 md:grid-cols-3">
          <DataRow
            label="From opportunity"
            value={
              <Link
                to="/opportunities/$id"
                params={{ id: opp.data.id }}
                className="hover:underline"
              >
                {opp.data.name}
              </Link>
            }
          />
          <DataRow label="Customer contract" value={CONTRACT_LABEL[opp.data.customerContract]} />
          <DataRow label="ECI quote #" value={opp.data.eciQuoteNumber ?? "—"} />
          <DataRow label="Work order #" value={opp.data.workOrderNumber ?? "—"} />
          <DataRow label="Customer PO #" value={opp.data.customerPoNumber ?? "—"} />
          <DataRow label="Customer contact" value={opp.data.customerContact ?? "—"} />
        </div>
      ) : null}
    </section>
  );
}
