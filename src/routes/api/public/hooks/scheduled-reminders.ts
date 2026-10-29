import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily reminder sweep, invoked by the database scheduler.
 * Authenticated with a shared secret header so nobody else can trigger it.
 */
export const Route = createFileRoute("/api/public/hooks/scheduled-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runReminderSweep } = await import("@/lib/eci/reminders.server");
        try {
          const result = await runReminderSweep(supabaseAdmin);
          return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
        } catch (e) {
          console.error("scheduled-reminders failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
