import { VISIT_STATUS_LABEL, type User, type Visit } from "@/data";
import { cn } from "@/lib/utils";

import { visitWhen } from "./format";

/**
 * A job's visits in order (docs/VISITS.md): when, who, and how each went. Shared by the tech's
 * job screen and the office job page; `actions` adds per-visit buttons for the office.
 */
export function VisitList({
  visits,
  techs,
  currentId,
  meId,
  actions,
  className,
}: {
  visits: Visit[];
  techs: User[];
  currentId: string | null;
  /** The signed-in tech, to mark "you". */
  meId?: string | null;
  actions?: (v: Visit) => React.ReactNode;
  className?: string;
}) {
  const techName = (id: string | null) =>
    id ? (techs.find((t) => t.identityId === id)?.name ?? "A tech") : "No tech";
  return (
    <section className={cn("space-y-2", className)} aria-label="Visits">
      <h2 className="text-lg font-semibold">Visits</h2>
      <ol className="space-y-2">
        {visits.map((v) => (
          <li
            key={v.id}
            className={cn(
              "eci-card space-y-1 px-4 py-3",
              v.id === currentId && "ring-2 ring-primary",
            )}
            data-testid="visit-row"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">
                Visit {v.number}
                {v.id === currentId ? (
                  <span className="ml-2 text-sm font-medium text-primary">Now</span>
                ) : null}
              </p>
              <span className="text-sm font-medium text-muted-foreground">
                {VISIT_STATUS_LABEL[v.status]}
              </span>
            </div>
            <p className="text-sm">{visitWhen(v)}</p>
            <p className="text-sm text-muted-foreground">
              {techName(v.assignedTechId)}
              {meId && v.assignedTechId === meId ? " (you)" : ""}
            </p>
            {v.note ? <p className="whitespace-pre-wrap text-sm">{v.note}</p> : null}
            {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions(v)}</div> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
