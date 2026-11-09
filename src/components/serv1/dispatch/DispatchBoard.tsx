import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  atMinutes,
  canDispatch,
  findOverlaps,
  formatSlot,
  fromDateInput,
  isUnscheduled,
  schedulePatch,
  toDateInput,
  unschedulePatch,
  useCustomers,
  useJobMutations,
  useJobs,
  useSites,
  useTechNames,
  useVisitActions,
  useVisits,
  liveVisitRows,
  visitEntries,
  withCurrentVisit,
  type Job,
  type NewJob,
  type User,
  type VisitEntry,
} from "@/data";

import { AssignDialog } from "./AssignDialog";
import { AttentionQueue } from "./AttentionQueue";
import { ConfirmDropDialog } from "./ConfirmDropDialog";
import { cardId, JOB_DRAG_TYPE, jobLabel } from "./board";
import { JobCard } from "./JobCard";
import { StatusLegend } from "./StatusLegend";
import { TechTimeline } from "./TechTimeline";

const CONFIRM_KEY = "serv1.dispatch.confirmOnDrop";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function readConfirmSetting() {
  try {
    return localStorage.getItem(CONFIRM_KEY) !== "off";
  } catch {
    return true;
  }
}
const dayText = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

type Pending = {
  job: Job;
  patch: Partial<NewJob>;
  /** For a visit of a multi-visit job: the visit write to run instead of the job patch. */
  run?: () => Promise<unknown>;
  message: string;
  done: string;
  /** Set when the move double-books the tech; the board then always asks first. */
  warning?: string;
};

/** Office screen: Unscheduled queue on the left, techs on a day timeline (SPEC.md W2). */
export function DispatchBoard() {
  const jobs = useJobs();
  const techsQuery = useTechNames();
  const customers = useCustomers();
  const sites = useSites();
  const { update } = useJobMutations();
  const visitsQuery = useVisits();
  const visitActions = useVisitActions();

  const [day, setDay] = useState(startOfToday);
  const [confirmOnDrop, setConfirmOnDrop] = useState(readConfirmSetting);
  const [assigning, setAssigning] = useState<Job | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragging, setDragging] = useState<Job | null>(null);

  const allJobs = useMemo(() => jobs.data ?? [], [jobs.data]);
  const allVisits = useMemo(() => visitsQuery.data ?? [], [visitsQuery.data]);
  // One card per visit (docs/VISITS.md); a job with no visits is its own one visit.
  const entries = useMemo(() => visitEntries(allJobs, allVisits), [allJobs, allVisits]);
  // "Needs attention" judges each job by the visit it is on now.
  const attentionJobs = useMemo(
    () => allJobs.map((j) => withCurrentVisit(j, allVisits)),
    [allJobs, allVisits],
  );
  /** A board card by its drag id: a visit entry, or a queued job. */
  const cardById = (id: string): Job | VisitEntry | undefined =>
    entries.find((e) => cardId(e) === id) ?? allJobs.find((j) => j.id === id);
  const realVisit = (j: Job) => {
    const e = j as Partial<VisitEntry>;
    return e.visit && e.implied === false ? e.visit : null;
  };
  const hasVisitRows = (j: Job) => liveVisitRows(j.id, allVisits).length > 0;
  const techs = useMemo(
    () => (techsQuery.data ?? []).filter((t) => !!t.identityId),
    [techsQuery.data],
  );
  const unlinkedTechs = (techsQuery.data?.length ?? 0) - techs.length;
  const customerMap = useMemo(
    () => new Map((customers.data ?? []).map((c) => [c.id, c])),
    [customers.data],
  );
  const siteMap = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data]);
  const queue = allJobs.filter(isUnscheduled);
  const techName = (identityId: string) =>
    techs.find((t) => t.identityId === identityId)?.name ?? "the tech";

  const save = async (p: Pending) => {
    try {
      if (p.run) await p.run();
      else await update.mutateAsync({ id: p.job.id, patch: p.patch });
      toast.success(p.done);
    } catch (err) {
      toast.error(`Couldn't update ${jobLabel(p.job)}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };
  /** Ask first when the toggle is on; drops otherwise save straight away. */
  const propose = (p: Pending, ask: boolean) => (ask || p.warning ? setPending(p) : void save(p));

  const scheduleChange = (job: Job, tech: User, start: Date, minutes?: number): Pending => {
    const patch = schedulePatch(job, tech.identityId!, start, minutes);
    const end = new Date(patch.scheduledEnd!);
    const when = `${dayText(start)}, ${formatSlot(start.getHours() * 60 + start.getMinutes())} – ${formatSlot(end.getHours() * 60 + end.getMinutes())}`;
    const verb = job.assignedTechId ? "Move" : "Schedule";
    const clashes = findOverlaps(entries, cardId(job), tech.identityId!, start, end);
    const plan = {
      assignedTechId: tech.identityId!,
      start,
      minutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    };
    const visit = realVisit(job);
    // A visit moves alone; a job that already has visits gets a new one; others move as today.
    const run = visit
      ? () => visitActions.reschedule.mutateAsync({ visit, plan })
      : hasVisitRows(job)
        ? () => visitActions.add.mutateAsync({ job, plan })
        : undefined;
    return {
      job,
      patch,
      run,
      warning: clashes.length
        ? `${tech.name} already has ${clashes.map(jobLabel).join(", ")} at that time.`
        : undefined,
      message: `${verb} ${jobLabel(job)} (${customerMap.get(job.customerId)?.name ?? "customer"}) to ${tech.name} on ${when}?`,
      done: `${jobLabel(job)} scheduled with ${tech.name}, ${when}`,
    };
  };

  const onDropJob = (id: string, tech: User, slot: number) => {
    const job = cardById(id);
    if (!job || !canDispatch(job)) return;
    const start = atMinutes(day, slot);
    if (job.assignedTechId === tech.identityId && job.scheduledStart === start.toISOString())
      return;
    propose(scheduleChange(job, tech, start), confirmOnDrop);
  };

  const onDropOnQueue = (id: string) => {
    const job = cardById(id);
    if (!job || !canDispatch(job) || isUnscheduled(job)) return;
    propose(
      {
        job,
        patch: unschedulePatch(),
        run: unscheduleRun(job),
        message: `Take ${jobLabel(job)} off ${techName(job.assignedTechId ?? "")}'s schedule and move it back to Unscheduled?`,
        done: `${jobLabel(job)} moved back to Unscheduled`,
      },
      confirmOnDrop,
    );
  };

  /** Taking one visit of a multi-visit job off the board removes that visit only. */
  function unscheduleRun(job: Job) {
    const visit = realVisit(job);
    return visit ? () => visitActions.remove.mutateAsync(visit) : undefined;
  }

  const setConfirm = (on: boolean) => {
    setConfirmOnDrop(on);
    try {
      localStorage.setItem(CONFIRM_KEY, on ? "on" : "off");
    } catch {
      // Private windows can refuse storage; the toggle still works for this visit.
    }
  };

  const shiftDay = (n: number) =>
    setDay((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + n);
      return next;
    });

  const loading = jobs.isLoading || techsQuery.isLoading || visitsQuery.isLoading;
  const loadError = jobs.error ?? techsQuery.error ?? visitsQuery.error;

  return (
    <>
      <PageHeader
        title="Dispatch Board"
        description="Drag a job from Unscheduled onto a tech and a time, or use Assign…"
      >
        <div className="flex items-center gap-2">
          <Switch id="confirm-on-drop" checked={confirmOnDrop} onCheckedChange={setConfirm} />
          <Label htmlFor="confirm-on-drop" className="text-sm">
            Confirm on drop
          </Label>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => shiftDay(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Board date"
            className="w-40"
            value={toDateInput(day)}
            onChange={(e) => {
              const d = fromDateInput(e.target.value);
              if (d) setDay(d);
            }}
          />
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => shiftDay(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" onClick={() => setDay(startOfToday())}>
            Today
          </Button>
          <span className="text-sm font-medium text-muted-foreground">{dayText(day)}</span>
        </div>
        <StatusLegend />
      </div>

      {loadError ? (
        <EmptyState title="Couldn't load the board" hint={String(loadError.message ?? loadError)} />
      ) : loading ? (
        <EmptyState title="Loading the board…" />
      ) : (
        <>
          <AttentionQueue jobs={attentionJobs} customers={customerMap} />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <section
              aria-label="Unscheduled jobs"
              className="eci-card flex w-full shrink-0 flex-col gap-2 p-3 lg:sticky lg:top-4 lg:w-72"
              onDragOver={(e) => {
                if (
                  dragging &&
                  !isUnscheduled(dragging) &&
                  e.dataTransfer.types.includes(JOB_DRAG_TYPE)
                )
                  e.preventDefault();
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(JOB_DRAG_TYPE);
                if (!id) return;
                e.preventDefault();
                onDropOnQueue(id);
              }}
            >
              <h2 className="flex items-center justify-between text-sm font-semibold">
                Unscheduled
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {queue.length}
                </span>
              </h2>
              {queue.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No unscheduled jobs
                </p>
              ) : (
                queue.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    customer={customerMap.get(job.customerId)}
                    site={job.siteId ? siteMap.get(job.siteId) : undefined}
                    onAssign={setAssigning}
                    onDragStart={setDragging}
                    onDragEnd={() => setDragging(null)}
                  />
                ))
              )}
            </section>

            <div className="min-w-0 flex-1 space-y-2">
              {techs.length === 0 ? (
                <EmptyState
                  title="No active techs"
                  hint="Add a user with the Tech role to schedule jobs."
                />
              ) : (
                <TechTimeline
                  techs={techs}
                  jobs={entries}
                  day={day}
                  customers={customerMap}
                  sites={siteMap}
                  onDropJob={onDropJob}
                  onAssign={setAssigning}
                  onDragStart={setDragging}
                  onDragEnd={() => setDragging(null)}
                />
              )}
              {unlinkedTechs > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {unlinkedTechs} tech{unlinkedTechs === 1 ? " has" : "s have"} no login linked yet
                  and can't be scheduled.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}

      <AssignDialog
        jobs={entries}
        job={assigning}
        techs={techs}
        day={day}
        busy={update.isPending || visitActions.add.isPending || visitActions.reschedule.isPending}
        onClose={() => setAssigning(null)}
        onAddVisit={(job, techId, start, minutes) => {
          setAssigning(null);
          setDay(atMinutes(start, 0));
          const name = techs.find((t) => t.identityId === techId)?.name ?? "the tech";
          void save({
            job,
            patch: {},
            run: () =>
              visitActions.add.mutateAsync({
                job,
                plan: { assignedTechId: techId, start, minutes },
              }),
            message: "",
            done: `Visit added to ${job.jobNumber ?? "the job"} with ${name}, ${dayText(start)}`,
          });
        }}
        onSubmit={(job, techId, start, minutes) => {
          const tech = techs.find((t) => t.identityId === techId);
          if (!tech) return;
          setAssigning(null);
          setDay(atMinutes(start, 0));
          void save(scheduleChange(job, tech, start, minutes));
        }}
        onUnschedule={(job) => {
          setAssigning(null);
          void save({
            job,
            patch: unschedulePatch(),
            run: unscheduleRun(job),
            message: "",
            done: realVisit(job)
              ? `${jobLabel(job)} removed`
              : `${jobLabel(job)} moved back to Unscheduled`,
          });
        }}
      />
      <ConfirmDropDialog
        message={pending?.message ?? null}
        warning={pending?.warning ?? null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void save(pending);
          setPending(null);
        }}
      />
    </>
  );
}
