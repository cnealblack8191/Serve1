import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { matches } from "@/components/serv1/office/matches";
import { SearchBox } from "@/components/serv1/office/SearchBox";
import {
  OPP_ATTENTION_LABEL,
  oppNeedsAttention,
  type OppAttention,
} from "@/components/serv1/sales/attention";
import { dateLabel, isPast, SELECT_CLASS } from "@/components/serv1/sales/format";
import { StageBadge } from "@/components/serv1/sales/StageBadge";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_CONTRACTS,
  OPEN_STAGES,
  OPPORTUNITY_STAGES,
  WORK_TYPES,
  useIsOffice,
  useOpportunities,
  type CustomerContract,
  type OpportunityStage,
  type WorkType,
} from "@/data";
import { OFFICE_VIEW, requireRole } from "@/lib/access";
import { CONTRACT_LABEL, STAGE_LABEL, WORK_TYPE_LABEL } from "@/lib/status";

type StageFilter = OpportunityStage | "open" | "all";
interface Search {
  stage?: StageFilter;
  type?: WorkType;
  contract?: CustomerContract;
  rep?: string;
  attention?: OppAttention;
}
const oneOf = <T extends string>(v: unknown, list: readonly T[]) =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;

export const Route = createFileRoute("/_authenticated/opportunities/")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_VIEW),
  // Filters live in the address so dashboard links open the matching list.
  validateSearch: (s: Record<string, unknown>): Search => ({
    stage: oneOf(s["stage"], [...OPPORTUNITY_STAGES, "open", "all"] as StageFilter[]),
    type: oneOf(s["type"], WORK_TYPES),
    contract: oneOf(s["contract"], CUSTOMER_CONTRACTS),
    rep: typeof s["rep"] === "string" ? s["rep"] : undefined,
    attention: oneOf(s["attention"], Object.keys(OPP_ATTENTION_LABEL) as OppAttention[]),
  }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isOffice = useIsOffice();
  const opps = useOpportunities();
  const [q, setQ] = useState("");
  const stage = search.stage ?? "open";
  const setFilter = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const reps = [...new Set((opps.data ?? []).map((o) => o.salesRep).filter(Boolean))] as string[];
  const rows = (opps.data ?? [])
    .filter((o) =>
      stage === "all" ? true : stage === "open" ? OPEN_STAGES.includes(o.stage) : o.stage === stage,
    )
    .filter((o) => !search.type || o.type === search.type)
    .filter((o) => !search.contract || o.customerContract === search.contract)
    .filter((o) => !search.rep || o.salesRep === search.rep)
    .filter((o) => !search.attention || oppNeedsAttention(o, search.attention))
    .filter((o) =>
      matches(
        q,
        o.name,
        o.eciQuoteNumber,
        o.customerContact,
        o.customerPoNumber,
        o.workOrderNumber,
      ),
    )
    .sort(
      (a, b) =>
        OPPORTUNITY_STAGES.indexOf(a.stage) - OPPORTUNITY_STAGES.indexOf(b.stage) ||
        (a.expectedClose ?? "9").localeCompare(b.expectedClose ?? "9"),
    );
  const filtered =
    !!q ||
    stage !== "open" ||
    !!search.type ||
    !!search.contract ||
    !!search.rep ||
    !!search.attention;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        description={
          search.attention ? OPP_ATTENTION_LABEL[search.attention] : "Sales and service pipeline."
        }
      >
        {isOffice ? (
          <>
            <Button asChild variant="outline">
              <Link to="/import">Import from Smartsheet</Link>
            </Button>
            <Button asChild>
              <Link to="/opportunities/new">Add opportunity</Link>
            </Button>
          </>
        ) : null}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <SearchBox
            label="Search opportunities"
            placeholder="Name, quote #, PO #, contact"
            value={q}
            onChange={setQ}
          />
        </div>
        <select
          aria-label="Stage"
          className={SELECT_CLASS}
          value={stage}
          onChange={(e) => setFilter({ stage: e.target.value as StageFilter })}
        >
          <option value="open">Open (stages 1 to 6)</option>
          <option value="all">All stages</option>
          {OPPORTUNITY_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Type"
          className={SELECT_CLASS}
          value={search.type ?? ""}
          onChange={(e) => setFilter({ type: (e.target.value || undefined) as WorkType })}
        >
          <option value="">All types</option>
          {WORK_TYPES.map((t) => (
            <option key={t} value={t}>
              {WORK_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Customer contract"
          className={SELECT_CLASS}
          value={search.contract ?? ""}
          onChange={(e) =>
            setFilter({ contract: (e.target.value || undefined) as CustomerContract })
          }
        >
          <option value="">All contracts</option>
          {CUSTOMER_CONTRACTS.map((c) => (
            <option key={c} value={c}>
              {CONTRACT_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          aria-label="Sales rep"
          className={SELECT_CLASS}
          value={search.rep ?? ""}
          onChange={(e) => setFilter({ rep: e.target.value || undefined })}
        >
          <option value="">All reps</option>
          {reps.sort().map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {search.attention ? (
        <Button variant="outline" size="sm" onClick={() => setFilter({ attention: undefined })}>
          Show all, not just “{OPP_ATTENTION_LABEL[search.attention]}”
        </Button>
      ) : null}

      {opps.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading opportunities…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No opportunities match" : "No opportunities yet"}
          hint={
            filtered
              ? "Change the filters above."
              : isOffice
                ? "Use Add opportunity, or import the Smartsheet exports."
                : undefined
          }
        />
      ) : (
        <ul className="eci-card divide-y divide-border/70" aria-label="Opportunities">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                to="/opportunities/$id"
                params={{ id: o.id }}
                className="grid gap-2 px-4 py-3 hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_10rem_minmax(0,1fr)_8rem] md:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {CONTRACT_LABEL[o.customerContract]} · {WORK_TYPE_LABEL[o.type]}
                    {o.eciQuoteNumber ? ` · ${o.eciQuoteNumber}` : ""}
                  </span>
                </span>
                <span>
                  <StageBadge stage={o.stage} />
                </span>
                <span className="min-w-0 truncate text-sm">
                  {o.nextStep ? (
                    <>
                      {o.nextStep}
                      {o.nextStepDue ? (
                        <span
                          className={
                            isPast(o.nextStepDue)
                              ? " font-medium text-red-700 dark:text-red-400"
                              : " text-muted-foreground"
                          }
                        >
                          {" "}
                          · due {dateLabel(o.nextStepDue)}
                        </span>
                      ) : null}
                    </>
                  ) : OPEN_STAGES.includes(o.stage) ? (
                    <span className="text-muted-foreground">No next step</span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground md:text-right">
                  {o.salesRep ?? "No rep"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
