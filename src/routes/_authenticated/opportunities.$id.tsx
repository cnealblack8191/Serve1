import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { DataRow, EmptyState, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { money } from "@/components/serv1/billing/format";
import { dateLabel, isPast, MONEY_FIELDS } from "@/components/serv1/sales/format";
import { OpportunityForm } from "@/components/serv1/sales/OpportunityForm";
import { StageBadge } from "@/components/serv1/sales/StageBadge";
import { WinDialog } from "@/components/serv1/sales/WinDialog";
import { Button } from "@/components/ui/button";
import {
  isClosedStage,
  useCurrentUser,
  useCustomer,
  useIsOffice,
  useJob,
  useOpportunities,
  useOpportunity,
  changedFields,
  useOpportunityMutations,
} from "@/data";
import { canSeeMoney, OFFICE_VIEW, requireRole } from "@/lib/access";
import { CONTRACT_LABEL, WORK_TYPE_LABEL } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/opportunities/$id")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_VIEW),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <Opportunity key={id} id={id} />;
}

function Opportunity({ id }: { id: string }) {
  const opp = useOpportunity(id);
  const all = useOpportunities();
  const isOffice = useIsOffice();
  const me = useCurrentUser();
  const showMoney = canSeeMoney(me.data?.role);
  const customer = useCustomer(opp.data?.customerId ?? undefined);
  const job = useJob(opp.data?.jobId ?? undefined);
  const { update } = useOpportunityMutations();
  const [editing, setEditing] = useState(false);
  const [winning, setWinning] = useState(false);

  if (opp.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const o = opp.data;
  if (!o) {
    return (
      <>
        <PageHeader title="Opportunity" />
        <EmptyState title="Opportunity not found" hint="Go back to Opportunities." />
      </>
    );
  }
  const reps = [...new Set((all.data ?? []).map((x) => x.salesRep).filter(Boolean))] as string[];

  if (editing) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...draft } = o;
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader title={`Edit: ${o.name}`} />
        <OpportunityForm
          initial={draft}
          reps={reps}
          showMoney={showMoney}
          saving={update.isPending}
          submitLabel="Save changes"
          onSubmit={(d) =>
            update.mutate(
              { id: o.id, patch: changedFields(draft, d) },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const fmtMoney = (k: (typeof MONEY_FIELDS)[number]) => {
    const v = o[k.key] as number | null;
    if (v === null) return "—";
    return k.kind === "money" ? money(v) : k.kind === "pct" ? `${v}%` : String(v);
  };

  return (
    <div className="space-y-8">
      <Link to="/opportunities" className="text-sm text-eci-copper hover:underline">
        ← All opportunities
      </Link>
      <PageHeader title={o.name}>
        <StageBadge stage={o.stage} />
        {isOffice ? (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!isClosedStage(o.stage) ? (
              <Button onClick={() => setWinning(true)}>Mark won</Button>
            ) : null}
          </>
        ) : null}
      </PageHeader>

      {o.jobId ? (
        <section className="eci-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            Won{o.closedAt ? ` on ${dateLabel(o.closedAt)}` : ""}. This opportunity is now job{" "}
            <span className="font-medium">{job.data?.jobNumber ?? "…"}</span>.
          </p>
          <Button asChild variant="outline">
            <Link to="/jobs/$id" params={{ id: o.jobId }}>
              Open the job
            </Link>
          </Button>
        </section>
      ) : null}

      <section className="eci-card grid gap-x-8 px-5 py-2 md:grid-cols-3">
        <DataRow label="Customer contract" value={CONTRACT_LABEL[o.customerContract]} />
        <DataRow label="Type" value={WORK_TYPE_LABEL[o.type]} />
        <DataRow
          label="Customer"
          value={
            customer.data ? (
              <Link
                to="/customers/$id"
                params={{ id: customer.data.id }}
                className="hover:underline"
              >
                {customer.data.name}
              </Link>
            ) : (
              "Not chosen yet"
            )
          }
        />
        <DataRow label="Customer contact" value={o.customerContact ?? "—"} />
        <DataRow label="Invoice contact" value={o.invoiceContact ?? "—"} />
        <DataRow label="Sales rep" value={o.salesRep ?? "—"} />
        <DataRow label="ECI quote #" value={o.eciQuoteNumber ?? "—"} />
        <DataRow label="Work order #" value={o.workOrderNumber ?? "—"} />
        <DataRow label="Customer PO #" value={o.customerPoNumber ?? "—"} />
        <DataRow label="Quote due" value={dateLabel(o.quoteDue)} />
        <DataRow label="Site visit" value={dateLabel(o.siteVisitDate)} />
        <DataRow
          label="Expected close"
          value={
            <span
              className={
                !isClosedStage(o.stage) && isPast(o.expectedClose)
                  ? "font-medium text-red-700 dark:text-red-400"
                  : ""
              }
            >
              {dateLabel(o.expectedClose)}
            </span>
          }
        />
        {o.priority ? <DataRow label="Priority" value={o.priority} /> : null}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Next step" />
        <div className="eci-card p-5 text-sm">
          {o.nextStep ? (
            <p>
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
              {o.nextStepRemind ? (
                <span className="text-muted-foreground"> · reminder on</span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted-foreground">No next step yet.</p>
          )}
          {o.notes ? <p className="mt-3 whitespace-pre-wrap">{o.notes}</p> : null}
        </div>
      </section>

      {showMoney ? (
        <section className="space-y-3">
          <SectionHeading title="Amounts" />
          <div className="eci-card grid gap-x-8 px-5 py-2 sm:grid-cols-2 md:grid-cols-4">
            {MONEY_FIELDS.map((f) => (
              <DataRow key={f.key} label={f.label} value={fmtMoney(f)} />
            ))}
          </div>
        </section>
      ) : null}

      {isOffice && !isClosedStage(o.stage) ? (
        <WinDialog opportunity={o} open={winning} onOpenChange={setWinning} />
      ) : null}
    </div>
  );
}
