import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "tech" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/tech/$id")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Job" />
      <EmptyState
        title="Job is not built yet"
        hint="Start the job, add photos and notes, complete it and collect the customer's signature."
      />
    </>
  );
}
