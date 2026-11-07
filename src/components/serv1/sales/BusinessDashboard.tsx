import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import {
  WORK_TYPES,
  useAttachments,
  useIsOffice,
  useJobs,
  useOpportunities,
  type OpportunityStage,
  type WorkType,
} from "@/data";
import { STAGE_LABEL, WORK_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

import { JOB_ATTENTION_LABEL, OPP_ATTENTION_LABEL } from "./attention";
import { businessStats } from "./businessStats";
import { BarList, HealthBar, KeyNumber, Panel } from "./DashboardParts";

/** Business Services dashboard (owner-approved mockup): counts only, no dollars. */
export function BusinessDashboard() {
  const opps = useOpportunities();
  const jobs = useJobs();
  const attachments = useAttachments();
  const isOffice = useIsOffice();
  const [type, setType] = useState<WorkType | null>(null);
  const s = useMemo(
    () => businessStats(opps.data ?? [], jobs.data ?? [], attachments.data ?? [], type),
    [opps.data, jobs.data, attachments.data, type],
  );
  const t = (extra: Record<string, string> = {}) => (type ? { ...extra, type } : extra);
  const pct = s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`;

  return (
    <section className="space-y-4" aria-label="Business Services">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeading title="Business Services" />
          <p className="text-sm text-muted-foreground">
            Sales pipeline and work in progress. Counts only.
          </p>
        </div>
        <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
          {[null, ...WORK_TYPES].map((w) => (
            <Button
              key={w ?? "all"}
              type="button"
              size="sm"
              variant={type === w ? "default" : "outline"}
              aria-pressed={type === w}
              className="min-h-11 px-4"
              onClick={() => setType(w)}
            >
              {w ? WORK_TYPE_LABEL[w] : "All"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KeyNumber
          label="Open opportunities"
          value={String(s.openOpportunities)}
          hint="Stages 1 to 6"
          to={{ to: "/opportunities", search: t({ stage: "open" }) }}
        />
        <KeyNumber
          label="Win rate"
          value={pct}
          hint={`${s.won} won of ${s.won + s.lost} decided`}
        />
        <KeyNumber
          label="Jobs in progress"
          value={String(s.jobsInProgress)}
          hint="New, scheduled or in progress"
        />
        <KeyNumber
          label="Quotes with customer"
          value={String(s.quotesWithCustomer)}
          hint="Bid sent or customer review"
        />
        <KeyNumber
          label="Site visits to schedule"
          value={String(s.siteVisitsToSchedule)}
          hint="Assessment, not yet booked"
          to={{ to: "/opportunities", search: t({ stage: "Assessment" }) }}
        />
        <KeyNumber
          label="Past expected close"
          value={String(s.pastExpectedClose)}
          hint="Open, date has passed"
          warn={s.pastExpectedClose > 0}
          to={{ to: "/opportunities", search: t({ attention: "pastClose" }) }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pipeline by stage">
          <BarList
            bars={s.byStage}
            tone="navy"
            label={(b) => STAGE_LABEL[b.label as OpportunityStage]}
          />
        </Panel>
        <Panel title="Open opportunities by customer contract">
          <BarList bars={s.byContract} tone="copper" />
        </Panel>
        <Panel title="Results this year">
          <div className="grid grid-cols-3 gap-3">
            <ResultNumber
              label="Won"
              value={s.won}
              className="text-emerald-700 dark:text-emerald-400"
            />
            <ResultNumber label="Lost" value={s.lost} className="text-red-700 dark:text-red-400" />
            <ResultNumber label="No bid" value={s.noBid} className="text-muted-foreground" />
          </div>
          <BarList bars={s.wonByContract} tone="navy" label={(b) => `${b.label} won`} />
        </Panel>
        <Panel title="Work health">
          {s.health.map((h) => (
            <HealthBar key={h.type} label={`${h.label} work`} total={h.total} counts={h.counts} />
          ))}
        </Panel>
        <Panel title="Needs attention">
          <ul className="divide-y divide-border/70">
            {s.oppAttention.map((a) => (
              <AttentionRow
                key={a.kind}
                label={OPP_ATTENTION_LABEL[a.kind]}
                count={a.count}
                to="/opportunities"
                search={t({ attention: a.kind, stage: "open" })}
              />
            ))}
            {s.jobAttention.map((a) => (
              <AttentionRow
                key={a.kind}
                label={JOB_ATTENTION_LABEL[a.kind]}
                count={a.count}
                to="/jobs"
                search={t({ attention: a.kind })}
              />
            ))}
          </ul>
        </Panel>
        <Panel title="Open opportunities by sales rep">
          <BarList bars={s.byRep} tone="navy" />
          <div className="flex flex-wrap gap-2 pt-2">
            {isOffice ? (
              <Button asChild className="min-h-11">
                <Link to="/opportunities/new">Add opportunity</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/opportunities">All opportunities</Link>
            </Button>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function ResultNumber({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-bold tabular-nums", className)}>{value}</span>
    </div>
  );
}

function AttentionRow({
  label,
  count,
  to,
  search,
}: {
  label: string;
  count: number;
  to: "/opportunities" | "/jobs";
  search: Record<string, string>;
}) {
  return (
    <li>
      <Link
        to={to}
        search={search}
        className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:underline"
      >
        <span>{label}</span>
        <span className="font-bold tabular-nums">{count}</span>
      </Link>
    </li>
  );
}
