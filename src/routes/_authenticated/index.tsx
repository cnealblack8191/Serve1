import { createFileRoute, redirect } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "billing" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/")({
  // Techs have no dashboard; their home is Today (SPEC.md section 13).
  beforeLoad: ({ context }) => {
    if (context.user.role === "Tech") throw redirect({ to: "/tech", replace: true });
  },
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <EmptyState
        title="Dashboard is not built yet"
        hint="Jobs completed today and this week, revenue invoiced, open jobs by status, jobs per tech."
      />
    </>
  );
}
