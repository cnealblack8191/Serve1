import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";

/** Lane "billing" builds this screen (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Invoice" />
      <EmptyState title="Invoice is not built yet" hint="One invoice: line items, total, PDF." />
    </>
  );
}
