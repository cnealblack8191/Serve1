import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "office" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/jobs/$id")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Job" />
      <EmptyState
        title="Job is not built yet"
        hint="Office view of one job: details, photos, signature, invoice."
      />
    </>
  );
}
