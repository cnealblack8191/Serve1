import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "tech" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/tech/")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Today" />
      <EmptyState
        title="Today is not built yet"
        hint="No jobs today. Jobs assigned to you appear here when the office schedules them."
      />
    </>
  );
}
