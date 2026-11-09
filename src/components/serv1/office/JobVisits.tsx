import { useState } from "react";
import { toast } from "sonner";

import { Field, SectionHeading } from "@/components/eci/primitives";
import { VisitList } from "@/components/serv1/visits/VisitList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DISPATCH_DEFAULT_HOURS,
  atMinutes,
  currentVisit,
  dispatchSlots,
  formatSlot,
  fromDateInput,
  toDateInput,
  useTechNames,
  useVisitActions,
  useVisits,
  visitsOf,
  type Job,
  type User,
} from "@/data";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm";
const LENGTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/**
 * Office job page: the job's visits (docs/VISITS.md) and "Add visit". A job with no visits is one
 * visit; adding another turns it into a multi-visit job (its first visit is kept as visit 1).
 */
export function JobVisits({
  job,
  canEdit,
  roster,
}: {
  job: Job;
  canEdit: boolean;
  roster: User[];
}) {
  const visits = useVisits();
  const techs = useTechNames();
  const actions = useVisitActions();
  const linked = (techs.data ?? []).filter((t) => !!t.identityId);
  const { visits: vs, implied } = visitsOf(job, visits.data ?? []);
  const cur = currentVisit(vs);
  const scheduled = !!job.scheduledStart && !!job.assignedTechId;
  const finished = ["Complete", "Reviewed", "Invoiced", "Paid", "Cancelled"].includes(job.status);

  const [open, setOpen] = useState(false);
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date(Date.now() + 86_400_000)));
  const [slot, setSlot] = useState(8 * 60);
  const [hours, setHours] = useState(DISPATCH_DEFAULT_HOURS);
  const day = fromDateInput(date);
  const tech = techId || linked[0]?.identityId || "";

  const add = () => {
    if (!day || !tech) return;
    actions.add.mutate(
      { job, plan: { assignedTechId: tech, start: atMinutes(day, slot), minutes: hours * 60 } },
      {
        onSuccess: (v) => {
          toast.success(`Visit ${v.number} added`);
          setOpen(false);
        },
        onError: (e) => toast.error("Couldn't add the visit", { description: e.message }),
      },
    );
  };

  if (implied && !scheduled) return null;
  return (
    <section className="space-y-3" aria-label="Job visits">
      <SectionHeading
        title="Visits"
        description={
          implied
            ? "One visit. Add another when the work needs more than one trip."
            : `${vs.length} visits. The job follows the current one.`
        }
      />
      {!implied ? (
        <VisitList
          visits={vs}
          techs={roster}
          currentId={cur?.id ?? null}
          className="[&>h2]:sr-only"
          actions={
            canEdit
              ? (v) =>
                  v.status === "Scheduled" && vs.length > 1 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actions.remove.isPending}
                      onClick={() =>
                        actions.remove.mutate(v, {
                          onSuccess: () => toast.success(`Visit ${v.number} removed`),
                          onError: (e) =>
                            toast.error("Couldn't remove the visit", { description: e.message }),
                        })
                      }
                    >
                      Remove visit {v.number}
                    </Button>
                  ) : null
              : undefined
          }
        />
      ) : null}
      {canEdit && !finished ? (
        open ? (
          <div className="eci-card space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Visit tech">
                <select
                  className={SELECT_CLASS}
                  value={tech}
                  onChange={(e) => setTechId(e.target.value)}
                >
                  {linked.map((t) => (
                    <option key={t.id} value={t.identityId ?? ""}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Visit date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Visit start">
                <select
                  className={SELECT_CLASS}
                  value={slot}
                  onChange={(e) => setSlot(Number(e.target.value))}
                >
                  {dispatchSlots().map((m) => (
                    <option key={m} value={m}>
                      {formatSlot(m)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Visit length">
                <select
                  className={SELECT_CLASS}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                >
                  {LENGTHS.map((h) => (
                    <option key={h} value={h}>
                      {h} {h === 1 ? "hour" : "hours"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={add} disabled={!day || !tech || actions.add.isPending}>
                {actions.add.isPending ? "Saving…" : "Save visit"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={!linked.length}>
            Add visit
          </Button>
        )
      ) : null}
    </section>
  );
}
