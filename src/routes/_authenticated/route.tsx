import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/eci/AppShell";
import { getCurrentUser } from "@/data";

/** Every screen under /_authenticated requires a signed-in user. */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
