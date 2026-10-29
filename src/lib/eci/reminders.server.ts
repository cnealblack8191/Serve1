import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AUTO_REMINDER_KEYS, AUTO_REMINDER_TIMING } from "./reminders";

type Admin = SupabaseClient<Database>;
type Perm = Database["public"]["Enums"]["app_permission"];

interface Recipient {
  id: string;
  prefs: Record<string, boolean>;
  perms: Set<Perm>;
}

interface PendingNotification {
  id: string;
  user_id: string;
  dedupe_key: string;
  title: string;
  detail: string;
  at: string;
  kind: "reminder";
  read: false;
}

const DAY = 86_400_000;

const stamp = () =>
  new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const uid = () => `N-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Runs the daily reminder sweep. Idempotent: every reminder carries a dedupe key
 * (type + record + user) so re-running never duplicates a notification.
 */
export async function runReminderSweep(admin: Admin) {
  const now = Date.now();

  const [profiles, roles, rolePerms, opps, bids] = await Promise.all([
    admin.from("profiles").select("id, notification_prefs"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("role_permissions").select("role, permission"),
    admin
      .from("opportunities")
      .select("id, name, customer, stage, created_at, expected_bid_date, assigned_to")
      .in("stage", ["New Opportunity"]),
    admin
      .from("bids")
      .select("id, name, customer, stage, opportunity_id, stage_changed_at, owner")
      .in("stage", ["Estimating", "Awaiting Approval", "Ready to Send", "Sent to Customer"]),
  ]);

  for (const r of [profiles, roles, rolePerms, opps, bids]) {
    if (r.error) throw new Error(r.error.message);
  }

  const permsByRole = new Map<string, Set<Perm>>();
  for (const rp of rolePerms.data ?? []) {
    if (!permsByRole.has(rp.role)) permsByRole.set(rp.role, new Set());
    permsByRole.get(rp.role)!.add(rp.permission);
  }
  const roleByUser = new Map((roles.data ?? []).map((r) => [r.user_id, r.role]));

  const recipients: Recipient[] = (profiles.data ?? []).map((p) => ({
    id: p.id,
    prefs: (p.notification_prefs ?? {}) as Record<string, boolean>,
    perms: permsByRole.get(roleByUser.get(p.id) ?? "") ?? new Set(),
  }));

  const wants = (r: Recipient, key: string, perm: Perm) =>
    r.perms.has(perm) && (r.prefs[key] ?? true) !== false;

  const pending: PendingNotification[] = [];
  const push = (
    r: Recipient,
    dedupe: string,
    title: string,
    detail: string,
  ) =>
    pending.push({
      id: uid(),
      user_id: r.id,
      dedupe_key: `${dedupe}:${r.id}`,
      title,
      detail,
      at: stamp(),
      kind: "reminder",
      read: false,
    });

  /* 1. Bid / no-bid decision prompt */
  for (const o of opps.data ?? []) {
    const created = parseDate(o.created_at);
    if (!created || now - created.getTime() < AUTO_REMINDER_TIMING.bidNoBidAfterDays * DAY) continue;
    const ageDays = Math.floor((now - created.getTime()) / DAY);
    for (const r of recipients) {
      if (!wants(r, AUTO_REMINDER_KEYS.bidNoBid, "crm")) continue;
      push(
        r,
        `bid-no-bid:${o.id}`,
        "Bid / no-bid decision needed",
        `${o.name} (${o.customer}) has been a New Opportunity for ${ageDays} days. Decide whether ECI will bid.`,
      );
    }
  }

  /* 2. Bid due-date reminder (~1 week before expected bid date) */
  const oppById = new Map((opps.data ?? []).map((o) => [o.id, o]));
  const allOppIds = [...new Set((bids.data ?? []).map((b) => b.opportunity_id).filter(Boolean))];
  const missing = allOppIds.filter((id) => !oppById.has(id));
  if (missing.length) {
    const extra = await admin
      .from("opportunities")
      .select("id, name, customer, stage, created_at, expected_bid_date, assigned_to")
      .in("id", missing);
    if (extra.error) throw new Error(extra.error.message);
    for (const o of extra.data ?? []) oppById.set(o.id, o);
  }

  for (const b of bids.data ?? []) {
    if (b.stage === "Sent to Customer") continue;
    const opp = oppById.get(b.opportunity_id);
    const due = parseDate(opp?.expected_bid_date);
    if (!due) continue;
    const msLeft = due.getTime() - now;
    if (msLeft < 0 || msLeft > AUTO_REMINDER_TIMING.bidDueWithinDays * DAY) continue;
    const daysLeft = Math.max(0, Math.round(msLeft / DAY));
    for (const r of recipients) {
      if (!wants(r, AUTO_REMINDER_KEYS.bidDue, "bids")) continue;
      push(
        r,
        `bid-due:${b.id}`,
        "Bid due soon",
        `${b.name} (${b.customer}) is due ${opp?.expected_bid_date} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Current stage: ${b.stage}.`,
      );
    }
  }

  /* 3. Post-bid status update reminder */
  for (const b of bids.data ?? []) {
    if (b.stage !== "Sent to Customer") continue;
    const changed = parseDate(b.stage_changed_at);
    if (!changed || now - changed.getTime() < AUTO_REMINDER_TIMING.postBidAfterDays * DAY) continue;
    const days = Math.floor((now - changed.getTime()) / DAY);
    for (const r of recipients) {
      if (!wants(r, AUTO_REMINDER_KEYS.postBid, "bids")) continue;
      push(
        r,
        `post-bid:${b.id}`,
        "Follow up on sent quote",
        `${b.name} (${b.customer}) was sent ${days} days ago with no status change. Check in with the customer and update the bid.`,
      );
    }
  }

  if (pending.length === 0) return { checked: recipients.length, inserted: 0 };

  // Skip anything already generated on a previous run.
  const keys = pending.map((p) => p.dedupe_key);
  const existing = await admin.from("notifications").select("dedupe_key").in("dedupe_key", keys);
  if (existing.error) throw new Error(existing.error.message);
  const seen = new Set((existing.data ?? []).map((e) => e.dedupe_key));
  const fresh = pending.filter((p) => !seen.has(p.dedupe_key));

  if (fresh.length) {
    const { error } = await admin.from("notifications").insert(fresh);
    if (error) throw new Error(error.message);
  }

  return { checked: recipients.length, inserted: fresh.length };
}
