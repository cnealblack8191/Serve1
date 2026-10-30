import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "billing" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/invoices/")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Invoices" />
      <EmptyState
        title="Invoices is not built yet"
        hint="Invoices from completed jobs, with status and PDF."
      />
    </>
  );
}
