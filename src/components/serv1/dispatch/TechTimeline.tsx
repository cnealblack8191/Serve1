import { useState, type DragEvent } from "react";

import {
  DISPATCH_DAY_START_HOUR,
  DISPATCH_SLOT_MINUTES,
  dispatchSlots,
  formatSlot,
  jobDurationMinutes,
  jobsForTechOnDay,
  minutesOfDay,
  type Customer,
  type Job,
  type Site,
  type User,
} from "@/data";
import { cn } from "@/lib/utils";

import { JOB_DRAG_TYPE } from "./board";
import { JobCard } from "./JobCard";

const SLOT_PX = 40;
const DAY_START = DISPATCH_DAY_START_HOUR * 60;

/** Side-by-side lanes for jobs that overlap in one tech's column. */
function layoutLanes(jobs: Job[]) {
  const laneEnds: number[] = [];
  const placed = jobs.map((job) => {
    const start = minutesOfDay(new Date(job.scheduledStart!));
    const end = start + jobDurationMinutes(job);
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    return { job, start, end, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

/** The day view: a time gutter and one column per tech, each half hour a drop target. */
export function TechTimeline({
  techs,
  jobs,
  day,
  customers,
  sites,
  onDropJob,
  onAssign,
  onDragStart,
  onDragEnd,
}: {
  techs: User[];
  jobs: Job[];
  day: Date;
  customers: Map<string, Customer>;
  sites: Map<string, Site>;
  onDropJob: (jobId: string, tech: User, slotMinutes: number) => void;
  onAssign: (job: Job) => void;
  onDragStart: (job: Job) => void;
  onDragEnd: () => void;
}) {
  const slots = dispatchSlots();
  const [hover, setHover] = useState<{ techId: string; slot: number } | null>(null);

  /** Which slot the pointer is over, from its height inside the column. */
  const slotAt = (e: DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientY - rect.top) / SLOT_PX);
    return slots[Math.min(slots.length - 1, Math.max(0, i))]!;
  };
  const isJobDrag = (e: DragEvent) => e.dataTransfer.types.includes(JOB_DRAG_TYPE);

  return (
    <div className="eci-card overflow-x-auto">
      <div className="flex min-w-max">
        {/* time gutter */}
        <div className="sticky left-0 z-10 w-20 shrink-0 border-r border-border bg-card">
          <div className="h-10 border-b border-border" />
          {slots.map((m) => (
            <div
              key={m}
              className="flex items-start justify-end pr-2 text-[11px] text-muted-foreground"
              style={{ height: SLOT_PX }}
            >
              {m % 60 === 0 ? formatSlot(m) : ""}
            </div>
          ))}
        </div>

        {techs.map((tech) => {
          const techId = tech.identityId!;
          const { placed, lanes } = layoutLanes(jobsForTechOnDay(jobs, techId, day));
          return (
            <section
              key={tech.id}
              aria-label={`${tech.name} schedule`}
              className="w-60 shrink-0 border-r border-border last:border-r-0"
            >
              <h3 className="flex h-10 items-center border-b border-border px-3 text-sm font-semibold">
                {tech.name}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {placed.length} {placed.length === 1 ? "job" : "jobs"}
                </span>
              </h3>
              <div
                className="relative"
                style={{ height: slots.length * SLOT_PX }}
                onDragOver={(e) => {
                  if (!isJobDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const slot = slotAt(e);
                  if (hover?.techId !== techId || hover.slot !== slot) setHover({ techId, slot });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(JOB_DRAG_TYPE);
                  setHover(null);
                  if (!id) return;
                  e.preventDefault();
                  onDropJob(id, tech, slotAt(e));
                }}
              >
                {slots.map((m) => (
                  <div
                    key={m}
                    data-slot={m}
                    aria-label={`${tech.name} ${formatSlot(m)}`}
                    className={cn(
                      "border-b border-border/50",
                      m % 60 === 0 && "border-border",
                      hover?.techId === techId && hover.slot === m && "bg-primary/10",
                    )}
                    style={{ height: SLOT_PX }}
                  />
                ))}
                {placed.map(({ job, start, end, lane }) => {
                  // Jobs outside 7:00–18:00 are pinned to the edge so they stay visible.
                  const top = Math.max(0, ((start - DAY_START) / DISPATCH_SLOT_MINUTES) * SLOT_PX);
                  const bottom = Math.min(
                    slots.length * SLOT_PX,
                    ((end - DAY_START) / DISPATCH_SLOT_MINUTES) * SLOT_PX,
                  );
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      customer={customers.get(job.customerId)}
                      site={job.siteId ? sites.get(job.siteId) : undefined}
                      timeLabel={`${formatSlot(start)} – ${formatSlot(end)}`}
                      compact
                      onAssign={onAssign}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      className="absolute"
                      style={{
                        top: Math.min(top, slots.length * SLOT_PX - SLOT_PX),
                        height: Math.max(SLOT_PX, bottom - top) - 2,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
