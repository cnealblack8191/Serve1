import { createFileRoute } from "@tanstack/react-router";

import { DispatchBoard } from "@/components/serv1/dispatch/DispatchBoard";

/** Lane "dispatch" (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/dispatch")({
  component: DispatchBoard,
});
