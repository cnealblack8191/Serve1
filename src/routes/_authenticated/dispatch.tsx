import { createFileRoute, redirect } from "@tanstack/react-router";

import { DispatchBoard } from "@/components/serv1/dispatch/DispatchBoard";

/** Lane "dispatch" (docs/PLAN.md). Data comes only from "@/data". */
export const Route = createFileRoute("/_authenticated/dispatch")({
  // Only Admin and Office dispatch (AppShell nav). Techs go to Today, Owners to the Dashboard.
  beforeLoad: ({ context }) => {
    const role = context.user.role;
    if (role === "Tech") throw redirect({ to: "/tech", replace: true });
    if (role !== "Admin" && role !== "Office") throw redirect({ to: "/", replace: true });
  },
  component: DispatchBoard,
});
