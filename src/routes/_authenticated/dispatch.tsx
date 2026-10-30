import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "dispatch" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/dispatch")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Dispatch Board" />
      <EmptyState
        title="Dispatch Board is not built yet"
        hint="Unscheduled queue on the left, techs on a timeline; drag a job onto a tech and time."
      />
    </>
  );
}
