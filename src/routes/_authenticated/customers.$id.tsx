import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "office" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Customer" />
      <EmptyState
        title="Customer is not built yet"
        hint="Customer detail with sites and job history."
      />
    </>
  );
}
