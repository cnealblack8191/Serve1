import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { PageHeader } from "@/components/eci/primitives";
import { OpportunityForm } from "@/components/serv1/sales/OpportunityForm";
import { emptyOpportunity, isOfficeRole, useOpportunities, useOpportunityMutations } from "@/data";
import { OFFICE_VIEW, requireRole } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/opportunities/new")({
  beforeLoad: ({ context }) => {
    requireRole(context.user.role, OFFICE_VIEW);
    if (!isOfficeRole(context.user.role)) throw redirect({ to: "/opportunities" });
  },
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const opps = useOpportunities();
  const { create } = useOpportunityMutations();
  const reps = [...new Set((opps.data ?? []).map((o) => o.salesRep).filter(Boolean))] as string[];
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Add opportunity" description="A new lead, bid or service request." />
      <OpportunityForm
        initial={emptyOpportunity()}
        reps={reps}
        showMoney
        saving={create.isPending}
        submitLabel="Save opportunity"
        onSubmit={(d) =>
          create.mutate(d, {
            onSuccess: (o) => void navigate({ to: "/opportunities/$id", params: { id: o.id } }),
          })
        }
        onCancel={() => void navigate({ to: "/opportunities" })}
      />
      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t save the opportunity. Try again.
        </p>
      ) : null}
    </div>
  );
}
