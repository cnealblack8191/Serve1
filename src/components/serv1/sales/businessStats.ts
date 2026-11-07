import {
  ACTIVE_STATUSES,
  CUSTOMER_CONTRACTS,
  OPEN_STAGES,
  WORK_TYPES,
  type Attachment,
  type CustomerContract,
  type Job,
  type JobHealth,
  type Opportunity,
  type OpportunityStage,
  type WorkType,
} from "@/data";
import { CONTRACT_LABEL, WORK_TYPE_LABEL } from "@/lib/status";

import {
  jobNeedsAttention,
  oppNeedsAttention,
  type JobAttention,
  type OppAttention,
} from "./attention";
import { NO_REP, todayIso } from "./format";

/** One bar in a dashboard list; `search` opens the matching Opportunities list. */
export interface Bar {
  label: string;
  count: number;
  search?: Record<string, string>;
}

export interface BusinessStats {
  openOpportunities: number;
  won: number;
  lost: number;
  noBid: number;
  /** Won / (won + lost), no-bid left out; null when nothing is decided yet. */
  winRate: number | null;
  jobsInProgress: number;
  quotesWithCustomer: number;
  siteVisitsToSchedule: number;
  pastExpectedClose: number;
  byStage: Bar[];
  byContract: Bar[];
  wonByContract: Bar[];
  health: {
    type: WorkType;
    label: string;
    total: number;
    counts: Record<JobHealth | "NotSet", number>;
  }[];
  oppAttention: { kind: OppAttention; count: number }[];
  jobAttention: { kind: JobAttention; count: number }[];
  byRep: Bar[];
}

const QUOTE_OUT: OpportunityStage[] = ["ProposalSent", "CustomerReview"];
const ACTIVE_JOB = new Set<string>(ACTIVE_STATUSES);

/** Open work in a non-contract bucket is split by type, as on the owner's mockup. */
function contractBucket(o: Opportunity): { label: string; search: Record<string, string> } {
  if (o.customerContract !== "NonContract")
    return {
      label: CONTRACT_LABEL[o.customerContract],
      search: { contract: o.customerContract },
    };
  return {
    label: o.type === "Service" ? "Non-contract service" : `${WORK_TYPE_LABEL[o.type]} (other)`,
    search: { contract: "NonContract", type: o.type },
  };
}

function bars(items: { label: string; search?: Record<string, string> }[]): Bar[] {
  const m = new Map<string, Bar>();
  for (const i of items) {
    const b = m.get(i.label) ?? { label: i.label, count: 0, search: i.search };
    b.count++;
    m.set(i.label, b);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Counts for the Business Services dashboard (owner-approved mockup). Pure, so it is unit tested.
 * `type` narrows everything to one work type. Results and win rate cover the current year
 * (closed date, or created date for closed records without one).
 */
export function businessStats(
  opportunities: Opportunity[],
  jobs: Job[],
  attachments: Attachment[],
  type: WorkType | null = null,
  now = new Date(),
): BusinessStats {
  const today = todayIso(now);
  const year = String(now.getFullYear());
  const opps = opportunities.filter((o) => !type || o.type === type);
  const js = jobs.filter((j) => !type || j.workType === type);
  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const thisYear = opps.filter((o) => (o.closedAt ?? o.createdAt).startsWith(year));
  const won = thisYear.filter((o) => o.stage === "ClosedWon");
  const lost = thisYear.filter((o) => o.stage === "ClosedLost").length;
  const noBid = thisYear.filter((o) => o.stage === "NoBid").length;
  const photoJobIds = new Set(attachments.filter((a) => a.type === "Photo").map((a) => a.jobId));
  const withSearch = (s: Record<string, string>) => (type ? { ...s, type } : s);

  return {
    openOpportunities: open.length,
    won: won.length,
    lost,
    noBid,
    winRate: won.length + lost === 0 ? null : won.length / (won.length + lost),
    jobsInProgress: js.filter((j) => ACTIVE_JOB.has(j.status)).length,
    quotesWithCustomer: open.filter((o) => QUOTE_OUT.includes(o.stage)).length,
    siteVisitsToSchedule: open.filter((o) => o.stage === "Assessment" && !o.siteVisitDate).length,
    pastExpectedClose: open.filter((o) => oppNeedsAttention(o, "pastClose", today)).length,
    byStage: OPEN_STAGES.map((stage) => ({
      label: stage,
      count: open.filter((o) => o.stage === stage).length,
      search: withSearch({ stage }),
    })),
    byContract: bars(open.map(contractBucket)).map((b) => ({
      ...b,
      search: withSearch(b.search ?? {}),
    })),
    wonByContract: CUSTOMER_CONTRACTS.map((c: CustomerContract) => ({
      label: CONTRACT_LABEL[c],
      count: won.filter((o) => o.customerContract === c).length,
      search: withSearch({ contract: c, stage: "ClosedWon", closedYear: year }),
    })).filter((b) => b.count > 0),
    health: (type ? [type] : WORK_TYPES).map((t) => {
      const active = jobs.filter((j) => j.workType === t && ACTIVE_JOB.has(j.status));
      const counts = { OnTrack: 0, Watch: 0, Behind: 0, NotSet: 0 } as Record<
        JobHealth | "NotSet",
        number
      >;
      for (const j of active) counts[j.health ?? "NotSet"]++;
      return { type: t, label: WORK_TYPE_LABEL[t], total: active.length, counts };
    }),
    oppAttention: (["noNextStep", "pastClose", "quotePastDue", "reminderDue"] as const).map(
      (kind) => ({ kind, count: opps.filter((o) => oppNeedsAttention(o, kind, today)).length }),
    ),
    jobAttention: (["pastEndDate", "noPhotos"] as const).map((kind) => ({
      kind,
      count: js.filter((j) => jobNeedsAttention(j, kind, photoJobIds, today)).length,
    })),
    byRep: bars(
      open.map((o) => ({
        label: o.salesRep ?? "No rep",
        search: withSearch({ rep: o.salesRep ?? NO_REP }),
      })),
    ),
  };
}
