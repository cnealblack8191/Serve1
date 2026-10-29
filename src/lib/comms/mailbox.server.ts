/**
 * Microsoft 365 shared-mailbox integration layer — SERVER ONLY.
 *
 * This is the single place where Microsoft Graph mail calls will live. It must
 * never be imported from browser code: no token, client secret or privileged
 * call is allowed to reach the client. Until the tenant connection is made,
 * `getMailboxProvider()` returns the preview provider, so the whole
 * application (UI, database relationships, workflows) runs against a real code
 * path rather than a mockup.
 *
 * Least privilege notes for the future connection:
 *  - Request application permissions Mail.ReadWrite and Mail.Send, then scope
 *    them with an ApplicationAccessPolicy to the ONE designated shared mailbox.
 *    Do not grant tenant-wide mailbox access.
 *  - The mailbox address is pinned through SHARED_MAILBOX_ADDRESS; every Graph
 *    path is built from it, so the app cannot read another mailbox.
 *  - Tokens are cached in server memory only and never returned to the client.
 *  - Attachments resolve through the SharePoint document layer, so files are
 *    referenced rather than copied.
 */

import type { MailAddress, MailFolder } from "./types";

export interface MailboxConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
}

export class MailboxNotConfiguredError extends Error {
  constructor() {
    super("The Microsoft 365 shared mailbox is not connected yet.");
    this.name = "MailboxNotConfiguredError";
  }
}

/** Reads configuration at call time (never at module scope). */
export function readMailboxConfig(): MailboxConfig | null {
  const tenantId = process.env["MS_GRAPH_TENANT_ID"];
  const clientId = process.env["MS_GRAPH_CLIENT_ID"];
  const clientSecret = process.env["MS_GRAPH_CLIENT_SECRET"];
  const mailbox = process.env["SHARED_MAILBOX_ADDRESS"];
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null;
  return { tenantId, clientId, clientSecret, mailbox };
}

export function isMailboxConfigured(): boolean {
  return readMailboxConfig() !== null;
}

/**
 * Effective configuration: environment variables first, then the Microsoft 365
 * connection the customer entered in the app (stored server-side only).
 */
export async function loadMailboxConfig(): Promise<MailboxConfig | null> {
  const env = readMailboxConfig();
  if (env) return env;
  const { loadMs365Settings } = await import("@/lib/integrations/ms365.server");
  const s = await loadMs365Settings();
  if (!s.tenantId || !s.clientId || !s.clientSecret || !s.mailbox) return null;
  return {
    tenantId: s.tenantId,
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    mailbox: s.mailbox,
  };
}

/** One message as delivered by a provider sync. */
export interface ProviderMessage {
  graphMessageId: string;
  internetMessageId: string | null;
  conversationId: string;
  folder: MailFolder;
  direction: "inbound" | "outbound";
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  bodyPreview: string;
  bodyHtml: string;
  isRead: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  attachments: { name: string; extension: string; sizeBytes: number | null; webUrl: string }[];
}

export interface SendPayload {
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  bodyHtml: string;
  /** SharePoint items referenced as attachments. */
  attachments: { name: string; webUrl: string }[];
  /** Graph message id being replied to / forwarded, when applicable. */
  inReplyTo?: string | null;
}

export interface SendResult {
  graphMessageId: string | null;
  internetMessageId: string | null;
  conversationId: string | null;
  status: "sent" | "queued" | "pending";
  detail: string;
}

/**
 * The provider contract. Both the live Graph client and the preview client
 * implement it, so calling code never branches on connection state.
 */
export interface MailboxProvider {
  connected: boolean;
  mailboxAddress: string;
  /** Incremental sync of the shared mailbox (delta token handled internally). */
  deltaSync(deltaToken: string | null): Promise<{
    messages: ProviderMessage[];
    deltaToken: string | null;
  }>;
  /** Send a message from the shared mailbox. */
  sendMail(payload: SendPayload): Promise<SendResult>;
  /** Move a conversation to the archive folder. */
  archiveThread(conversationId: string | null): Promise<void>;
  /** Mark a message read/unread in the mailbox. */
  markRead(graphMessageId: string | null, read: boolean): Promise<void>;
}

const GRAPH = "https://graph.microsoft.com/v1.0";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: MailboxConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

const addr = (v: unknown): MailAddress => {
  const e = (v as { emailAddress?: { name?: string; address?: string } } | undefined)?.emailAddress;
  return { name: e?.name ?? "", address: e?.address ?? "" };
};
const addrList = (v: unknown): MailAddress[] => (Array.isArray(v) ? v.map(addr) : []);
const graphRecipients = (list: MailAddress[]) =>
  list.map((a) => ({ emailAddress: { address: a.address, name: a.name || undefined } }));

/** Live Microsoft Graph provider, pinned to the designated shared mailbox. */
export function createGraphMailboxProvider(cfg: MailboxConfig): MailboxProvider {
  const base = `${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}`;

  const call = async (path: string, init: RequestInit = {}) => {
    const token = await getAccessToken(cfg);
    const res = await fetch(path.startsWith("http") ? path : `${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Graph mail request failed [${res.status}]: ${body}`);
      throw new Error(`Microsoft 365 request failed [${res.status}]: ${body}`);
    }
    return res.status === 204 ? null : ((await res.json()) as Record<string, unknown>);
  };

  const folderOf = (parent: string | undefined): MailFolder => {
    const v = (parent ?? "").toLowerCase();
    if (v.includes("sent")) return "sent";
    if (v.includes("draft")) return "drafts";
    if (v.includes("archive")) return "archive";
    return "inbox";
  };

  return {
    connected: true,
    mailboxAddress: cfg.mailbox,

    async deltaSync(deltaToken) {
      const url = deltaToken ?? "/mailFolders/inbox/messages/delta?$top=50";
      const json = (await call(url)) ?? {};
      const value = (json["value"] as Record<string, unknown>[] | undefined) ?? [];
      const messages: ProviderMessage[] = value.map((m) => ({
        graphMessageId: String(m["id"] ?? ""),
        internetMessageId: (m["internetMessageId"] as string | null) ?? null,
        conversationId: String(m["conversationId"] ?? m["id"] ?? ""),
        folder: folderOf(m["parentFolderId"] as string | undefined),
        direction: addr(m["from"]).address.toLowerCase() === cfg.mailbox.toLowerCase()
          ? "outbound"
          : "inbound",
        from: addr(m["from"]),
        to: addrList(m["toRecipients"]),
        cc: addrList(m["ccRecipients"]),
        subject: String(m["subject"] ?? ""),
        bodyPreview: String(m["bodyPreview"] ?? ""),
        bodyHtml: String((m["body"] as { content?: string } | undefined)?.content ?? ""),
        isRead: Boolean(m["isRead"]),
        sentAt: (m["sentDateTime"] as string | null) ?? null,
        receivedAt: (m["receivedDateTime"] as string | null) ?? null,
        attachments: [],
      }));
      return {
        messages,
        deltaToken: (json["@odata.deltaLink"] as string | undefined) ?? deltaToken,
      };
    },

    async sendMail(payload) {
      const body = {
        message: {
          subject: payload.subject,
          body: { contentType: "HTML", content: payload.bodyHtml },
          toRecipients: graphRecipients(payload.to),
          ccRecipients: graphRecipients(payload.cc),
          bccRecipients: graphRecipients(payload.bcc),
          // SharePoint files are attached by reference, never copied.
          attachments: payload.attachments.map((a) => ({
            "@odata.type": "#microsoft.graph.referenceAttachment",
            name: a.name,
            sourceUrl: a.webUrl,
            providerType: "oneDriveBusiness",
            permission: "view",
            isFolder: false,
          })),
        },
        saveToSentItems: true,
      };
      await call(`/sendMail`, { method: "POST", body: JSON.stringify(body) });
      return {
        graphMessageId: null,
        internetMessageId: null,
        conversationId: null,
        status: "sent",
        detail: "Sent from the shared mailbox.",
      };
    },

    async archiveThread(conversationId) {
      if (!conversationId) return;
      const json =
        (await call(
          `/messages?$filter=conversationId eq '${conversationId}'&$select=id&$top=50`,
        )) ?? {};
      const value = (json["value"] as { id: string }[] | undefined) ?? [];
      for (const m of value) {
        await call(`/messages/${m.id}/move`, {
          method: "POST",
          body: JSON.stringify({ destinationId: "archive" }),
        });
      }
    },

    async markRead(graphMessageId, read) {
      if (!graphMessageId) return;
      await call(`/messages/${graphMessageId}`, {
        method: "PATCH",
        body: JSON.stringify({ isRead: read }),
      });
    },
  };
}

/** Live provider when Microsoft 365 is configured, preview provider otherwise. */
export async function getMailboxProvider(
  previewHints: { name: string; address: string; subject: string }[] = [],
): Promise<MailboxProvider> {
  const cfg = await loadMailboxConfig();
  if (cfg) return createGraphMailboxProvider(cfg);
  const { createPreviewMailboxProvider } = await import("./preview.server");
  return createPreviewMailboxProvider(previewHints);
}
