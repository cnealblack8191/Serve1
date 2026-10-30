import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "office" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/jobs/")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Jobs" />
      <EmptyState title="Jobs is not built yet" hint="Every job with status color and search." />
    </>
  );
}
