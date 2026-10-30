import { CalendarClock } from "lucide-react";
import type { DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { canDispatch, type Customer, type Job, type Site } from "@/data";
import { JOB_STATUS_CLASS, JOB_STATUS_HEX, JOB_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

import { JOB_DRAG_TYPE, jobLabel } from "./board";

/** One job on the board: in the Unscheduled queue or on a tech's timeline. */
export function JobCard({
  job,
  customer,
  site,
  timeLabel,
  compact,
  short,
  onAssign,
  onDragStart,
  onDragEnd,
  className,
  style,
}: {
  job: Job;
  customer?: Customer;
  site?: Site;
  timeLabel?: string;
  compact?: boolean;
  /** Too short for more than one line (30-minute jobs): title and Assign only. */
  short?: boolean;
  onAssign: (job: Job) => void;
  onDragStart?: (job: Job) => void;
  onDragEnd?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const movable = canDispatch(job);
  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(JOB_DRAG_TYPE, job.id);
    e.dataTransfer.setData("text/plain", job.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(job);
  };

  const assignLabel = `Assign ${jobLabel(job)}`;
  const urgent = job.priority === "Emergency" || job.priority === "High";
  const statusBadge = (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1",
        JOB_STATUS_CLASS[job.status],
      )}
    >
      {JOB_STATUS_LABEL[job.status]}
    </span>
  );

  return (
    <article
      aria-label={`${jobLabel(job)} ${customer?.name ?? ""}`.trim()}
      draggable={movable}
      onDragStart={movable ? handleDragStart : undefined}
      onDragEnd={onDragEnd}
      title={short && timeLabel ? timeLabel : undefined}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-l-4 bg-card text-left text-xs shadow-sm",
        compact ? "gap-0.5 px-1.5 py-1" : "gap-1 p-2",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-90",
        className,
      )}
      style={{ borderLeftColor: JOB_STATUS_HEX[job.status], ...style }}
    >
      {compact ? (
        <>
          {/* First line holds the Assign button so even a 30-minute card can reopen the dialog. */}
          <div className="flex min-h-6 items-center gap-1">
            <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
              {jobLabel(job)} · {customer?.name ?? "Unknown customer"}
            </p>
            {movable ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                aria-label={assignLabel}
                title={assignLabel}
                onClick={() => onAssign(job)}
              >
                <CalendarClock className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {short ? null : (
            <>
              <div className="flex items-center gap-2">
                {statusBadge}
                {timeLabel ? (
                  <span className="truncate text-muted-foreground">{timeLabel}</span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-foreground">{job.description}</p>
              {urgent ? (
                <p className="font-medium text-red-700 dark:text-red-400">
                  {PRIORITY_LABEL[job.priority]} priority
                </p>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">
                {jobLabel(job)} · {customer?.name ?? "Unknown customer"}
              </p>
              {timeLabel ? <p className="text-muted-foreground">{timeLabel}</p> : null}
            </div>
            {statusBadge}
          </div>
          {site ? <p className="truncate text-muted-foreground">{site.address}</p> : null}
          <p className="line-clamp-2 text-foreground">{job.description}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span
              className={cn(
                "font-medium",
                urgent ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
              )}
            >
              {PRIORITY_LABEL[job.priority]} priority
            </span>
            {movable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                aria-label={assignLabel}
                onClick={() => onAssign(job)}
              >
                Assign…
              </Button>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}
