import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lets a manager run the daily reminder sweep on demand (same logic the scheduler runs). */
export const runRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "manage_permissions",
    });
    if (!allowed) throw new Error("Only Admins and Division Managers can run the reminder sweep.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runReminderSweep } = await import("@/lib/eci/reminders.server");
    return runReminderSweep(supabaseAdmin);
  });
