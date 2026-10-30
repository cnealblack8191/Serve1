import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "office" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/customers/")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Customers" />
      <EmptyState
        title="Customers is not built yet"
        hint="Customer list with search; each customer has sites with access notes."
      />
    </>
  );
}
