import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "office" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/jobs/new")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="New Job" />
      <EmptyState
        title="New Job is not built yet"
        hint="Pick a customer and site, describe the work, save as New."
      />
    </>
  );
}
