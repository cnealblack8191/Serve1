/**
 * Microsoft 365 connection settings — SERVER ONLY.
 *
 * The customer connects their own Microsoft 365 tenant directly to this app:
 * they create one Azure app registration and enter its details here. Values are
 * stored in `public.ms365_settings`, a table with RLS enabled and no policies,
 * so only server code using the service role can read it. The client secret is
 * never returned to the browser.
 *
 * Environment variables (MS_GRAPH_* / SHAREPOINT_* / SHARED_MAILBOX_ADDRESS)
 * still win when present, so a hosted/managed configuration keeps working.
 */

export interface Ms365Settings {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
  mailbox: string;
}

export type Ms365Partial = { [K in keyof Ms365Settings]?: string | undefined };

let cache: { value: Ms365Partial; at: number } | null = null;
const TTL = 30_000;

export function clearMs365Cache() {
  cache = null;
}

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

async function readStored(): Promise<Ms365Partial> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ms365_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (!data) return {};
    const row = data as Record<string, string | null>;
    const pick = (k: string) => {
      const v = row[k];
      return v && v.trim() ? v.trim() : undefined;
    };
    return {
      tenantId: pick("tenant_id"),
      clientId: pick("client_id"),
      clientSecret: pick("client_secret"),
      siteId: pick("site_id"),
      driveId: pick("drive_id"),
      mailbox: pick("shared_mailbox"),
    };
  } catch (err) {
    console.error("Could not read Microsoft 365 settings:", err);
    return {};
  }
}

/** Effective settings: environment first, stored connection second. */
export async function loadMs365Settings(): Promise<Ms365Partial> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const stored = await readStored();
  const value: Ms365Partial = {
    tenantId: env("MS_GRAPH_TENANT_ID") ?? stored.tenantId,
    clientId: env("MS_GRAPH_CLIENT_ID") ?? stored.clientId,
    clientSecret: env("MS_GRAPH_CLIENT_SECRET") ?? stored.clientSecret,
    siteId: env("SHAREPOINT_SITE_ID") ?? stored.siteId,
    driveId: env("SHAREPOINT_DRIVE_ID") ?? stored.driveId,
    mailbox: env("SHARED_MAILBOX_ADDRESS") ?? stored.mailbox,
  };
  cache = { value, at: Date.now() };
  return value;
}

/** Client-credentials token for the customer's own app registration. */
export async function ms365Token(s: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${s.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft sign-in failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}
