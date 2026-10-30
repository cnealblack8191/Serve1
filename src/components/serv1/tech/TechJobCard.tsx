import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Navigation } from "lucide-react";

import type { Customer, Job, Site } from "@/data";
import { JOB_STATUS_HEX } from "@/lib/status";

import { directionsUrl, dayLabel, timeRange } from "./format";
import { JobStatusBadge, PriorityTag } from "./JobStatusBadge";

/** One big tappable job card for the Today screen. */
export function TechJobCard({
  job,
  customer,
  site,
  showDay,
}: {
  job: Job;
  customer?: Customer;
  site?: Site;
  showDay?: boolean;
}) {
  const name = customer?.name ?? "Customer";
  return (
    <article
      className="eci-card overflow-hidden border-l-8"
      style={{ borderLeftColor: JOB_STATUS_HEX[job.status] }}
      data-testid="tech-job-card"
    >
      <Link
        to="/tech/$id"
        params={{ id: job.id }}
        className="block space-y-2 p-4 active:bg-muted"
        aria-label={`Open job for ${name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug">{name}</h3>
          <JobStatusBadge status={job.status} />
        </div>
        <p className="flex items-center gap-2 text-base font-medium">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {showDay ? `${dayLabel(job.scheduledStart)}, ` : ""}
          {timeRange(job)}
        </p>
        {site ? (
          <p className="flex items-start gap-2 text-base text-muted-foreground">
            <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
            {site.address}
          </p>
        ) : null}
        <p className="text-base">{job.description}</p>
        <PriorityTag priority={job.priority} />
      </Link>
      {site ? (
        <a
          href={directionsUrl(site.address)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center gap-2 border-t border-border text-base font-medium text-primary active:bg-muted"
        >
          <Navigation className="size-4" aria-hidden />
          Directions
        </a>
      ) : null}
    </article>
  );
}
