/**
 * Microsoft 365 direct-connection API.
 *
 * The app owner connects ECI's own Microsoft 365 tenant by entering the details
 * of one Azure app registration. Everything here runs server-side: the client
 * secret is written to a server-only table and is never sent back to the
 * browser (the status call reports only whether a secret is stored).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Ms365Status {
  /** Mail + documents both usable. */
  documentsConnected: boolean;
  mailboxConnected: boolean;
  tenantId: string;
  clientId: string;
  siteId: string;
  driveId: string;
  mailbox: string;
  hasSecret: boolean;
  /** True when values come from hosting configuration and cannot be edited here. */
  managedByEnvironment: boolean;
  updatedBy: string;
  updatedAt: string | null;
}

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: owner } = await context.supabase.rpc("is_owner", {
    _user_id: context.userId,
  });
  if (!owner) throw new Error("Only the account owner can change the Microsoft 365 connection.");
}

export const getMs365Status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Ms365Status> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMs365Settings } = await import("./ms365.server");
    const s = await loadMs365Settings();
    const { data } = await supabaseAdmin
      .from("ms365_settings")
      .select("updated_by, updated_at")
      .eq("id", "default")
      .maybeSingle();
    const row = (data ?? {}) as { updated_by?: string | null; updated_at?: string | null };
    return {
      documentsConnected: Boolean(
        s.tenantId && s.clientId && s.clientSecret && s.siteId && s.driveId,
      ),
      mailboxConnected: Boolean(s.tenantId && s.clientId && s.clientSecret && s.mailbox),
      tenantId: s.tenantId ?? "",
      clientId: s.clientId ?? "",
      siteId: s.siteId ?? "",
      driveId: s.driveId ?? "",
      mailbox: s.mailbox ?? "",
      hasSecret: Boolean(s.clientSecret),
      managedByEnvironment: Boolean(process.env["MS_GRAPH_TENANT_ID"]),
      updatedBy: row.updated_by ?? "",
      updatedAt: row.updated_at ?? null,
    };
  });

const settingsSchema = z.object({
  tenantId: z.string().trim().max(200),
  clientId: z.string().trim().max(200),
  /** Empty string keeps the stored secret unchanged. */
  clientSecret: z.string().trim().max(500),
  siteId: z.string().trim().max(400),
  driveId: z.string().trim().max(400),
  mailbox: z.string().trim().max(320),
  updatedBy: z.string().trim().max(200).optional(),
});

export const saveMs365Settings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearMs365Cache } = await import("./ms365.server");

    const patch: Record<string, string | null> = {
      id: "default",
      tenant_id: data.tenantId || null,
      client_id: data.clientId || null,
      site_id: data.siteId || null,
      drive_id: data.driveId || null,
      shared_mailbox: data.mailbox || null,
      updated_by: data.updatedBy ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.clientSecret) patch["client_secret"] = data.clientSecret;

    const { error } = await supabaseAdmin
      .from("ms365_settings")
      .upsert(patch as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    clearMs365Cache();
    return { saved: true };
  });

export const clearMs365Settings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearMs365Cache } = await import("./ms365.server");
    const { error } = await supabaseAdmin.from("ms365_settings").delete().eq("id", "default");
    if (error) throw new Error(error.message);
    clearMs365Cache();
    return { cleared: true };
  });

export interface Ms365TestResult {
  signIn: { ok: boolean; detail: string };
  documents: { ok: boolean; detail: string };
  mailbox: { ok: boolean; detail: string };
}

/** Live check against Microsoft using the stored connection. */
export const testMs365Connection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Ms365TestResult> => {
    await assertAdmin(context as never);
    const { loadMs365Settings, ms365Token } = await import("./ms365.server");
    const s = await loadMs365Settings();

    const result: Ms365TestResult = {
      signIn: { ok: false, detail: "Not tested." },
      documents: { ok: false, detail: "Not tested." },
      mailbox: { ok: false, detail: "Not tested." },
    };

    if (!s.tenantId || !s.clientId || !s.clientSecret) {
      result.signIn = {
        ok: false,
        detail: "Directory (tenant) ID, Application (client) ID and a client secret are required.",
      };
      return result;
    }

    let token: string;
    try {
      token = await ms365Token({
        tenantId: s.tenantId,
        clientId: s.clientId,
        clientSecret: s.clientSecret,
      });
      result.signIn = { ok: true, detail: "Microsoft accepted the app registration." };
    } catch (err) {
      result.signIn = { ok: false, detail: (err as Error).message };
      return result;
    }

    const call = async (url: string) => {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`[${res.status}] ${await res.text()}`);
      return (await res.json()) as Record<string, unknown>;
    };

    if (s.siteId && s.driveId) {
      try {
        const json = await call(
          `https://graph.microsoft.com/v1.0/sites/${s.siteId}/drives/${s.driveId}/root/children?$top=1`,
        );
        const n = ((json["value"] as unknown[] | undefined) ?? []).length;
        result.documents = {
          ok: true,
          detail: `Document library reachable${n ? "" : " (folder is empty)"}.`,
        };
      } catch (err) {
        result.documents = { ok: false, detail: (err as Error).message };
      }
    } else {
      result.documents = { ok: false, detail: "Site ID and drive ID are not set yet." };
    }

    if (s.mailbox) {
      try {
        await call(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s.mailbox)}/mailFolders/inbox?$select=id`,
        );
        result.mailbox = { ok: true, detail: `Shared mailbox ${s.mailbox} reachable.` };
      } catch (err) {
        result.mailbox = { ok: false, detail: (err as Error).message };
      }
    } else {
      result.mailbox = { ok: false, detail: "Shared mailbox address is not set yet." };
    }

    return result;
  });
