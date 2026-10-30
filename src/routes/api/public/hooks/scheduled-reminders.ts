import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily reminder sweep, invoked by the database scheduler.
 * Authenticated with a shared secret header so nobody else can trigger it.
 */

/**
 * Compare in constant time, so response latency cannot be used to recover the
 * secret a character at a time. Hashing first keeps both inputs the same length,
 * which `timingSafeEqual` requires and which stops the length itself leaking.
 */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export const Route = createFileRoute("/api/public/hooks/scheduled-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LOVABLE_CRON_SECRET"];
        // Accepted during a rotation so the scheduler can be updated without downtime.
        const previous = process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
        const provided = request.headers.get("x-cron-secret") ?? "";

        if (!expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const authorized =
          (await secretMatches(provided, expected)) ||
          (previous ? await secretMatches(provided, previous) : false);

        if (!authorized) {
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
