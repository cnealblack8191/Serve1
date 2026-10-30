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

  return (
    <article
      aria-label={`${jobLabel(job)} ${customer?.name ?? ""}`.trim()}
      draggable={movable}
      onDragStart={movable ? handleDragStart : undefined}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col gap-1 overflow-hidden rounded-md border border-l-4 bg-card p-2 text-left text-xs shadow-sm",
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-90",
        className,
      )}
      style={{ borderLeftColor: JOB_STATUS_HEX[job.status], ...style }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {jobLabel(job)} · {customer?.name ?? "Unknown customer"}
          </p>
          {timeLabel ? <p className="text-muted-foreground">{timeLabel}</p> : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1",
            JOB_STATUS_CLASS[job.status],
          )}
        >
          {JOB_STATUS_LABEL[job.status]}
        </span>
      </div>
      {!compact && site ? <p className="truncate text-muted-foreground">{site.address}</p> : null}
      <p className={cn("text-foreground", compact ? "line-clamp-1" : "line-clamp-2")}>
        {job.description}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span
          className={cn(
            "font-medium",
            job.priority === "Emergency" || job.priority === "High"
              ? "text-red-700 dark:text-red-400"
              : "text-muted-foreground",
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
            aria-label={`Assign ${jobLabel(job)}`}
            onClick={() => onAssign(job)}
          >
            Assign…
          </Button>
        ) : null}
      </div>
    </article>
  );
}
