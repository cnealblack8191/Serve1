/**
 * Communications service — the ONE API every module uses for email.
 *
 * CRM, estimating, bids, jobs, work orders and invoicing all call these
 * functions; no module talks to a mailbox itself. Every call is authenticated
 * and runs server-side, so Microsoft credentials never reach the browser.
 * Microsoft 365 remains the system of record: rows here carry Graph identifiers
 * and are reconciled by `syncMailbox`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DocumentRecordType } from "@/lib/sharepoint/types";
import {
  COMM_PURPOSES,
  type CommPurpose,
  type TimelineEntry,
  type DeliveryStatus,
  type MailAddress,
  type MailFolder,
  type MailboxStatus,
  type Message,
  type MessageAttachment,
  type MessageLink,
  type MessageThread,
} from "./types";

const RECORD_TYPES: DocumentRecordType[] = [
  "customer",
  "contact",
  "opportunity",
  "bid",
  "estimate",
  "job",
  "work_order",
  "invoice",
  "email",
];

const FOLDERS: MailFolder[] = ["inbox", "sent", "drafts", "archive"];

const str = (v: unknown, field: string): string => {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${field} is required`);
  return v.trim();
};
const optStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const recordType = (v: unknown): DocumentRecordType => {
  if (typeof v !== "string" || !RECORD_TYPES.includes(v as DocumentRecordType)) {
    throw new Error("Unknown record type");
  }
  return v as DocumentRecordType;
};
const folderOf = (v: unknown, fallback: MailFolder): MailFolder =>
  typeof v === "string" && FOLDERS.includes(v as MailFolder) ? (v as MailFolder) : fallback;

const purposeOf = (v: unknown): CommPurpose =>
  typeof v === "string" && COMM_PURPOSES.includes(v as CommPurpose)
    ? (v as CommPurpose)
    : "general";

const addressList = (v: unknown): MailAddress[] =>
  Array.isArray(v)
    ? v
        .map((a) => ({
          name: optStr((a as MailAddress | undefined)?.name),
          address: optStr((a as MailAddress | undefined)?.address).toLowerCase(),
        }))
        .filter((a) => a.address.includes("@"))
    : [];

type Row = Record<string, unknown>;

const toLink = (r: Row): MessageLink => ({
  id: String(r["id"]),
  recordType: r["record_type"] as DocumentRecordType,
  recordId: String(r["record_id"] ?? ""),
  autoMatched: Boolean(r["auto_matched"]),
  linkedBy: String(r["linked_by"] ?? ""),
});

const toAttachment = (r: Row): MessageAttachment => ({
  id: String(r["id"]),
  documentId: (r["document_id"] as string | null) ?? null,
  name: String(r["name"] ?? ""),
  extension: String(r["extension"] ?? ""),
  sizeBytes: (r["size_bytes"] as number | null) ?? null,
  webUrl: String(r["web_url"] ?? ""),
  inline: Boolean(r["inline"]),
});

const toMessage = (
  r: Row,
  attachments: MessageAttachment[],
  links: MessageLink[],
): Message => ({
  id: String(r["id"]),
  threadId: String(r["thread_id"]),
  purpose: purposeOf(r["purpose"]),
  graphMessageId: (r["graph_message_id"] as string | null) ?? null,
  internetMessageId: (r["internet_message_id"] as string | null) ?? null,
  direction: (r["direction"] as Message["direction"]) ?? "outbound",
  folder: folderOf(r["folder"], "sent"),
  from: {
    name: String(r["from_name"] ?? ""),
    address: String(r["from_address"] ?? ""),
  },
  to: addressList(r["to_addresses"]),
  cc: addressList(r["cc_addresses"]),
  bcc: addressList(r["bcc_addresses"]),
  subject: String(r["subject"] ?? ""),
  bodyPreview: String(r["body_preview"] ?? ""),
  bodyHtml: String(r["body_html"] ?? ""),
  isDraft: Boolean(r["is_draft"]),
  isRead: Boolean(r["is_read"]),
  hasAttachments: Boolean(r["has_attachments"]),
  deliveryStatus: (r["delivery_status"] as DeliveryStatus) ?? "pending",
  deliveryDetail: String(r["delivery_detail"] ?? ""),
  source: (r["source"] as Message["source"]) ?? "app",
  sentAt: (r["sent_at"] as string | null) ?? null,
  receivedAt: (r["received_at"] as string | null) ?? null,
  sentByName: String(r["sent_by_name"] ?? ""),
  attachments,
  links,
});

const toThread = (r: Row, links: MessageLink[]): MessageThread => ({
  id: String(r["id"]),
  graphConversationId: (r["graph_conversation_id"] as string | null) ?? null,
  subject: String(r["subject"] ?? "(no subject)"),
  preview: String(r["preview"] ?? ""),
  folder: folderOf(r["folder"], "inbox"),
  participants: addressList(r["participants"]),
  hasAttachments: Boolean(r["has_attachments"]),
  unreadCount: Number(r["unread_count"] ?? 0),
  messageCount: Number(r["message_count"] ?? 0),
  lastMessageAt: String(r["last_message_at"] ?? ""),
  links,
});

type Client = { from: (t: string) => any };

/** Reads every link row for a set of messages/threads. */
async function loadLinks(supabase: Client, messageIds: string[], threadIds: string[]) {
  const byMessage = new Map<string, MessageLink[]>();
  const byThread = new Map<string, MessageLink[]>();
  if (messageIds.length === 0 && threadIds.length === 0) return { byMessage, byThread };
  const { data } = await supabase
    .from("message_links")
    .select("*")
    .or(
      [
        messageIds.length ? `message_id.in.(${messageIds.join(",")})` : "",
        threadIds.length ? `thread_id.in.(${threadIds.join(",")})` : "",
      ]
        .filter(Boolean)
        .join(","),
    );
  for (const row of (data ?? []) as Row[]) {
    const link = toLink(row);
    const mid = row["message_id"] as string | null;
    const tid = row["thread_id"] as string | null;
    if (mid) byMessage.set(mid, [...(byMessage.get(mid) ?? []), link]);
    if (tid) byThread.set(tid, [...(byThread.get(tid) ?? []), link]);
  }
  return { byMessage, byThread };
}

async function insertLinks(
  supabase: Client,
  rows: {
    message_id?: string | null;
    thread_id?: string | null;
    record_type: string;
    record_id: string;
    auto_matched: boolean;
    linked_by: string;
  }[],
) {
  if (rows.length === 0) return;
  for (const row of rows) {
    await supabase.from("message_links").insert(row);
  }
}

/* ------------------------------------------------------------------ */
/* Sync — reconcile with the designated shared mailbox                  */
/* ------------------------------------------------------------------ */

const SYNC_ID = "shared-mailbox";

async function runSync(supabase: Client, userName: string): Promise<MailboxStatus> {
  const { previewContactHints, matchRecordsForAddresses } = await import("./matching.server");
  const { getMailboxProvider } = await import("./mailbox.server");

  const { data: stateRow } = await supabase
    .from("mailbox_sync_state")
    .select("*")
    .eq("id", SYNC_ID)
    .maybeSingle();

  const hints = await previewContactHints(supabase);
  const provider = await getMailboxProvider(hints);
  const { messages, deltaToken } = await provider.deltaSync(
    (stateRow?.["delta_token"] as string | null) ?? null,
  );

  for (const m of messages) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("graph_message_id", m.graphMessageId)
      .maybeSingle();
    if (existing) continue;

    // Thread (conversation) upsert.
    let threadId: string | null = null;
    const { data: thread } = await supabase
      .from("message_threads")
      .select("id, message_count")
      .eq("graph_conversation_id", m.conversationId)
      .maybeSingle();
    const participants = [m.from, ...m.to, ...m.cc];
    if (thread) {
      threadId = String(thread["id"]);
      await supabase
        .from("message_threads")
        .update({
          last_message_at: m.receivedAt ?? m.sentAt ?? new Date().toISOString(),
          preview: m.bodyPreview,
          message_count: Number(thread["message_count"] ?? 0) + 1,
          has_attachments: m.attachments.length > 0,
        })
        .eq("id", threadId);
    } else {
      const { data: created } = await supabase
        .from("message_threads")
        .insert({
          graph_conversation_id: m.conversationId,
          subject: m.subject,
          preview: m.bodyPreview,
          folder: m.folder,
          participants,
          has_attachments: m.attachments.length > 0,
          unread_count: m.isRead ? 0 : 1,
          message_count: 1,
          last_message_at: m.receivedAt ?? m.sentAt ?? new Date().toISOString(),
        })
        .select("id")
        .single();
      threadId = created ? String(created["id"]) : null;
    }
    if (!threadId) continue;

    const { data: inserted } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        graph_message_id: m.graphMessageId,
        internet_message_id: m.internetMessageId,
        direction: m.direction,
        folder: m.folder,
        from_name: m.from.name,
        from_address: m.from.address,
        to_addresses: m.to,
        cc_addresses: m.cc,
        subject: m.subject,
        body_preview: m.bodyPreview,
        body_html: m.bodyHtml,
        is_read: m.isRead,
        has_attachments: m.attachments.length > 0,
        delivery_status: m.direction === "inbound" ? "received" : "sent",
        source: provider.connected ? "graph" : "app",
        sent_at: m.sentAt,
        received_at: m.receivedAt,
        sent_by_name: m.direction === "outbound" ? "Shared mailbox" : "",
      })
      .select("id")
      .single();
    const messageId = inserted ? String(inserted["id"]) : null;
    if (!messageId) continue;

    if (m.attachments.length) {
      for (const a of m.attachments) {
        await supabase.from("message_attachments").insert({
          message_id: messageId,
          name: a.name,
          extension: a.extension,
          size_bytes: a.sizeBytes,
          web_url: a.webUrl,
        });
      }
    }

    // Automatic CRM association by email address.
    const matches = await matchRecordsForAddresses(
      supabase,
      [m.from, ...m.to, ...m.cc].map((a) => a.address),
    );
    await insertLinks(
      supabase,
      matches.flatMap((t) => [
        {
          message_id: messageId,
          record_type: t.recordType,
          record_id: t.recordId,
          auto_matched: true,
          linked_by: "Automatic match",
        },
        {
          thread_id: threadId,
          message_id: null,
          record_type: t.recordType,
          record_id: t.recordId,
          auto_matched: true,
          linked_by: "Automatic match",
        },
      ]),
    );
  }

  await importLegacyEmails(supabase, userName);

  const nowIso = new Date().toISOString();
  await supabase.from("mailbox_sync_state").upsert(
    {
      id: SYNC_ID,
      mailbox_address: provider.mailboxAddress,
      folder: "inbox",
      delta_token: deltaToken,
      last_synced_at: nowIso,
      connected: provider.connected,
      updated_at: nowIso,
    },
    { onConflict: "id" },
  );

  return {
    connected: provider.connected,
    mailboxAddress: provider.mailboxAddress,
    lastSyncedAt: nowIso,
  };
}

/** Brings historical email_records rows into the unified history, once. */
async function importLegacyEmails(supabase: Client, userName: string) {
  const { data: legacy } = await supabase
    .from("email_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (legacy ?? []) as Row[];
  if (rows.length === 0) return;

  const ids = rows.map((r) => `legacy:${String(r["id"])}`);
  const { data: already } = await supabase
    .from("messages")
    .select("graph_message_id")
    .in("graph_message_id", ids);
  const seen = new Set((already ?? []).map((r: Row) => String(r["graph_message_id"])));

  for (const r of rows) {
    const key = `legacy:${String(r["id"])}`;
    if (seen.has(key)) continue;
    const recordId = String(r["record_id"] ?? "");
    const created = String(r["created_at"] ?? new Date().toISOString());
    const { data: thread } = await supabase
      .from("message_threads")
      .insert({
        graph_conversation_id: key,
        subject: String(r["subject"] ?? ""),
        preview: String(r["body"] ?? "").slice(0, 160),
        folder: "sent",
        participants: [{ name: "", address: String(r["recipient"] ?? "") }],
        message_count: 1,
        last_message_at: created,
      })
      .select("id")
      .single();
    if (!thread) continue;
    const threadId = String(thread["id"]);
    const { data: msg } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        graph_message_id: key,
        direction: "outbound",
        folder: "sent",
        from_name: "Electrical Contractor Inc.",
        from_address: "",
        to_addresses: [{ name: "", address: String(r["recipient"] ?? "") }],
        subject: String(r["subject"] ?? ""),
        body_preview: String(r["body"] ?? "").slice(0, 160),
        body_html: String(r["body"] ?? ""),
        delivery_status: "sent",
        source: "legacy",
        sent_at: created,
        sent_by_name: userName,
      })
      .select("id")
      .single();
    if (!msg || !recordId) continue;
    const type = inferRecordType(recordId);
    await insertLinks(supabase, [
      {
        message_id: String(msg["id"]),
        record_type: type,
        record_id: recordId,
        auto_matched: true,
        linked_by: "Imported history",
      },
      {
        thread_id: threadId,
        message_id: null,
        record_type: type,
        record_id: recordId,
        auto_matched: true,
        linked_by: "Imported history",
      },
    ]);
  }
}

function inferRecordType(recordId: string): DocumentRecordType {
  const id = recordId.toUpperCase();
  if (id.startsWith("BID")) return "bid";
  if (id.startsWith("JOB")) return "job";
  if (id.startsWith("INV")) return "invoice";
  if (id.startsWith("WO")) return "work_order";
  return "opportunity";
}

export const syncMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userName?: string }) => ({ userName: optStr(input?.userName) }))
  .handler(async ({ data, context }): Promise<MailboxStatus> =>
    runSync(context.supabase as unknown as Client, data.userName || "ECI"),
  );

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export const listThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folder?: string; search?: string }) => ({
    folder: folderOf(input?.folder, "inbox"),
    search: optStr(input?.search),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ status: MailboxStatus; threads: MessageThread[] }> => {
      const supabase = context.supabase as unknown as Client;

      const { data: stateRow } = await supabase
        .from("mailbox_sync_state")
        .select("*")
        .eq("id", SYNC_ID)
        .maybeSingle();

      let status: MailboxStatus = {
        connected: Boolean(stateRow?.["connected"]),
        mailboxAddress: String(stateRow?.["mailbox_address"] ?? ""),
        lastSyncedAt: (stateRow?.["last_synced_at"] as string | null) ?? null,
      };
      // First load (or a stale mirror) pulls from the mailbox provider.
      const stale =
        !stateRow ||
        Date.now() - new Date(String(stateRow["last_synced_at"] ?? 0)).getTime() > 5 * 60_000;
      if (stale) {
        try {
          status = await runSync(supabase, "ECI");
        } catch (e) {
          console.error("Mailbox sync failed", e);
        }
      }

      let query = supabase
        .from("message_threads")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (data.folder === "sent" || data.folder === "drafts") {
        // Sent and Drafts follow the messages, not the conversation's home folder.
        const { data: msgRows } = await supabase
          .from("messages")
          .select("thread_id")
          .eq("folder", data.folder)
          .order("created_at", { ascending: false })
          .limit(300);
        const ids = [...new Set((msgRows ?? []).map((r: Row) => String(r["thread_id"])))];
        if (ids.length === 0) return { status, threads: [] };
        query = query.in("id", ids);
      } else {
        query = query.eq("folder", data.folder);
      }
      if (data.search) query = query.ilike("subject", `%${data.search}%`);
      const { data: rows, error } = await query;
      if (error) throw error;

      const threadRows = (rows ?? []) as Row[];
      const { byThread } = await loadLinks(
        supabase,
        [],
        threadRows.map((r) => String(r["id"])),
      );
      return {
        status,
        threads: threadRows.map((r) => toThread(r, byThread.get(String(r["id"])) ?? [])),
      };
    },
  );

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => ({ threadId: str(input?.threadId, "Thread") }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ thread: MessageThread | null; messages: Message[] }> => {
      const supabase = context.supabase as unknown as Client;
      const { data: threadRow } = await supabase
        .from("message_threads")
        .select("*")
        .eq("id", data.threadId)
        .maybeSingle();
      if (!threadRow) return { thread: null, messages: [] };

      const { data: msgRows } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", data.threadId)
        .order("created_at", { ascending: true });
      const rows = (msgRows ?? []) as Row[];
      const ids = rows.map((r) => String(r["id"]));

      const { data: attRows } = ids.length
        ? await supabase.from("message_attachments").select("*").in("message_id", ids)
        : { data: [] };
      const attByMessage = new Map<string, MessageAttachment[]>();
      for (const a of (attRows ?? []) as Row[]) {
        const mid = String(a["message_id"]);
        attByMessage.set(mid, [...(attByMessage.get(mid) ?? []), toAttachment(a)]);
      }

      const { byMessage, byThread } = await loadLinks(supabase, ids, [data.threadId]);
      return {
        thread: toThread(threadRow as Row, byThread.get(data.threadId) ?? []),
        messages: rows.map((r) =>
          toMessage(r, attByMessage.get(String(r["id"])) ?? [], byMessage.get(String(r["id"])) ?? []),
        ),
      };
    },
  );

/** Communication history for one business record — used by every module. */
export const getRecordCommunications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recordType: string; recordId: string }) => ({
    recordType: recordType(input?.recordType),
    recordId: str(input?.recordId, "Record id"),
  }))
  .handler(
    async ({ data, context }): Promise<{ status: MailboxStatus; messages: Message[] }> => {
      const supabase = context.supabase as unknown as Client;

      const { data: stateRow } = await supabase
        .from("mailbox_sync_state")
        .select("*")
        .eq("id", SYNC_ID)
        .maybeSingle();
      const status: MailboxStatus = {
        connected: Boolean(stateRow?.["connected"]),
        mailboxAddress: String(stateRow?.["mailbox_address"] ?? ""),
        lastSyncedAt: (stateRow?.["last_synced_at"] as string | null) ?? null,
      };

      const { data: linkRows } = await supabase
        .from("message_links")
        .select("*")
        .eq("record_type", data.recordType)
        .eq("record_id", data.recordId);
      const links = (linkRows ?? []) as Row[];
      const messageIds = [
        ...new Set(links.map((l) => l["message_id"]).filter(Boolean).map(String)),
      ];
      const threadIds = [
        ...new Set(links.map((l) => l["thread_id"]).filter(Boolean).map(String)),
      ];

      const filters = [
        messageIds.length ? `id.in.(${messageIds.join(",")})` : "",
        threadIds.length ? `thread_id.in.(${threadIds.join(",")})` : "",
      ].filter(Boolean);
      if (filters.length === 0) return { status, messages: [] };

      const { data: msgRows } = await supabase
        .from("messages")
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = (msgRows ?? []) as Row[];
      const ids = rows.map((r) => String(r["id"]));

      const { data: attRows } = ids.length
        ? await supabase.from("message_attachments").select("*").in("message_id", ids)
        : { data: [] };
      const attByMessage = new Map<string, MessageAttachment[]>();
      for (const a of (attRows ?? []) as Row[]) {
        const mid = String(a["message_id"]);
        attByMessage.set(mid, [...(attByMessage.get(mid) ?? []), toAttachment(a)]);
      }
      const { byMessage } = await loadLinks(supabase, ids, []);

      return {
        status,
        messages: rows.map((r) =>
          toMessage(r, attByMessage.get(String(r["id"])) ?? [], byMessage.get(String(r["id"])) ?? []),
        ),
      };
    },
  );

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

interface SendInput {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: string;
  bodyHtml?: string;
  threadId?: string;
  inReplyTo?: string;
  isDraft?: boolean;
  purpose?: string;
  sentByName?: string;
  attachments?: unknown;
  links?: unknown;
}

const validateSend = (input: SendInput) => ({
  to: addressList(input?.to),
  cc: addressList(input?.cc),
  bcc: addressList(input?.bcc),
  subject: optStr(input?.subject),
  bodyHtml: optStr(input?.bodyHtml),
  threadId: optStr(input?.threadId),
  inReplyTo: optStr(input?.inReplyTo),
  isDraft: Boolean(input?.isDraft),
  purpose: purposeOf(input?.purpose),
  sentByName: optStr(input?.sentByName),
  attachments: Array.isArray(input?.attachments)
    ? (input.attachments as Row[]).map((a) => ({
        documentId: optStr(a["documentId"]) || null,
        name: optStr(a["name"]),
        extension: optStr(a["extension"]),
        sizeBytes: typeof a["sizeBytes"] === "number" ? (a["sizeBytes"] as number) : null,
        webUrl: optStr(a["webUrl"]),
      }))
    : [],
  links: Array.isArray(input?.links)
    ? (input.links as Row[]).map((l) => ({
        recordType: recordType(l["recordType"]),
        recordId: str(l["recordId"], "Record id"),
      }))
    : [],
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSend)
  .handler(async ({ data, context }): Promise<{ messageId: string; threadId: string; status: DeliveryStatus; detail: string }> => {
    const supabase = context.supabase as unknown as Client;
    const userId = context.userId;
    if (!data.isDraft && data.to.length === 0) throw new Error("At least one recipient is required");

    const { getMailboxProvider } = await import("./mailbox.server");
    const { matchRecordsForAddresses } = await import("./matching.server");
    const provider = await getMailboxProvider();

    let result = {
      graphMessageId: null as string | null,
      internetMessageId: null as string | null,
      conversationId: null as string | null,
      status: "pending" as "sent" | "queued" | "pending",
      detail: "Saved as a draft.",
    };
    if (!data.isDraft) {
      result = await provider.sendMail({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        attachments: data.attachments
          .filter((a) => a.webUrl)
          .map((a) => ({ name: a.name, webUrl: a.webUrl })),
        inReplyTo: data.inReplyTo || null,
      });
    }

    const nowIso = new Date().toISOString();
    const folder: MailFolder = data.isDraft ? "drafts" : "sent";
    const preview = data.bodyHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 160);

    // Thread: reply keeps the conversation, otherwise start one.
    let threadId = data.threadId;
    if (threadId) {
      const { data: t } = await supabase
        .from("message_threads")
        .select("message_count")
        .eq("id", threadId)
        .maybeSingle();
      await supabase
        .from("message_threads")
        .update({
          last_message_at: nowIso,
          preview,
          message_count: Number(t?.["message_count"] ?? 0) + 1,
          has_attachments: data.attachments.length > 0,
        })
        .eq("id", threadId);
    } else {
      const { data: created, error } = await supabase
        .from("message_threads")
        .insert({
          graph_conversation_id: result.conversationId,
          subject: data.subject,
          preview,
          folder,
          participants: [...data.to, ...data.cc],
          has_attachments: data.attachments.length > 0,
          message_count: 1,
          last_message_at: nowIso,
        })
        .select("id")
        .single();
      if (error) throw error;
      threadId = String(created["id"]);
    }

    const { data: inserted, error: msgErr } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        graph_message_id: result.graphMessageId,
        internet_message_id: result.internetMessageId,
        direction: "outbound",
        folder,
        from_name: data.sentByName || "Electrical Contractor Inc.",
        from_address: provider.mailboxAddress,
        to_addresses: data.to,
        cc_addresses: data.cc,
        bcc_addresses: data.bcc,
        subject: data.subject,
        body_preview: preview,
        body_html: data.bodyHtml,
        is_draft: data.isDraft,
        has_attachments: data.attachments.length > 0,
        delivery_status: data.isDraft ? "pending" : result.status,
        delivery_detail: result.detail,
        source: "app",
        purpose: data.purpose,
        sent_at: data.isDraft ? null : nowIso,
        sent_by: userId,
        sent_by_name: data.sentByName || "",
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;
    const messageId = String(inserted["id"]);

    for (const a of data.attachments) {
      await supabase.from("message_attachments").insert({
        message_id: messageId,
        document_id: a.documentId,
        name: a.name,
        extension: a.extension,
        size_bytes: a.sizeBytes,
        web_url: a.webUrl,
      });
    }

    // Explicit record associations plus automatic address matching.
    const auto = await matchRecordsForAddresses(
      supabase,
      [...data.to, ...data.cc].map((a) => a.address),
    );
    const targets = [
      ...data.links.map((l) => ({ ...l, auto: false })),
      ...auto
        .filter((a) => !data.links.some((l) => l.recordType === a.recordType && l.recordId === a.recordId))
        .map((a) => ({ ...a, auto: true })),
    ];
    await insertLinks(
      supabase,
      targets.flatMap((t) => [
        {
          message_id: messageId,
          record_type: t.recordType,
          record_id: t.recordId,
          auto_matched: t.auto,
          linked_by: data.sentByName || "",
        },
        {
          thread_id: threadId!,
          message_id: null,
          record_type: t.recordType,
          record_id: t.recordId,
          auto_matched: t.auto,
          linked_by: data.sentByName || "",
        },
      ]),
    );

    return {
      messageId,
      threadId: threadId!,
      status: (data.isDraft ? "pending" : result.status) as DeliveryStatus,
      detail: result.detail,
    };
  });

/** Drafts use the same path: call `sendMessage` with `isDraft: true`. */

/* ------------------------------------------------------------------ */
/* Thread actions & manual filing                                      */
/* ------------------------------------------------------------------ */

export const archiveThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; folder?: string }) => ({
    threadId: str(input?.threadId, "Thread"),
    folder: folderOf(input?.folder, "archive"),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    const { data: thread } = await supabase
      .from("message_threads")
      .select("graph_conversation_id")
      .eq("id", data.threadId)
      .maybeSingle();
    const { getMailboxProvider } = await import("./mailbox.server");
    const provider = await getMailboxProvider();
    if (data.folder === "archive") {
      await provider.archiveThread((thread?.["graph_conversation_id"] as string | null) ?? null);
    }
    await supabase.from("message_threads").update({ folder: data.folder }).eq("id", data.threadId);
    await supabase.from("messages").update({ folder: data.folder }).eq("thread_id", data.threadId);
    return { ok: true };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => ({ threadId: str(input?.threadId, "Thread") }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    await supabase.from("messages").update({ is_read: true }).eq("thread_id", data.threadId);
    await supabase.from("message_threads").update({ unread_count: 0 }).eq("id", data.threadId);
    const { data: rows } = await supabase
      .from("messages")
      .select("graph_message_id")
      .eq("thread_id", data.threadId);
    const { getMailboxProvider } = await import("./mailbox.server");
    const provider = await getMailboxProvider();
    for (const r of (rows ?? []) as Row[]) {
      const gid = r["graph_message_id"] as string | null;
      if (gid && !gid.startsWith("legacy:")) await provider.markRead(gid, true);
    }
    return { ok: true };
  });

export const linkMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      messageId?: string;
      threadId?: string;
      recordType: string;
      recordId: string;
      linkedBy?: string;
    }) => ({
      messageId: optStr(input?.messageId),
      threadId: optStr(input?.threadId),
      recordType: recordType(input?.recordType),
      recordId: str(input?.recordId, "Record id"),
      linkedBy: optStr(input?.linkedBy),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    if (!data.messageId && !data.threadId) throw new Error("Nothing to file");
    const rows: Parameters<typeof insertLinks>[1] = [];
    if (data.messageId) {
      rows.push({
        message_id: data.messageId,
        record_type: data.recordType,
        record_id: data.recordId,
        auto_matched: false,
        linked_by: data.linkedBy,
      });
    }
    if (data.threadId) {
      rows.push({
        thread_id: data.threadId,
        message_id: null,
        record_type: data.recordType,
        record_id: data.recordId,
        auto_matched: false,
        linked_by: data.linkedBy,
      });
    }
    await insertLinks(supabase, rows);
    return { ok: true };
  });

export const unlinkMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linkId: string }) => ({ linkId: str(input?.linkId, "Link") }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    await supabase.from("message_links").delete().eq("id", data.linkId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Unified business timeline                                           */
/* ------------------------------------------------------------------ */

/**
 * One date-ordered feed per record: incoming email, outgoing email, bids sent,
 * invoices sent, reminders, work-order communications and the documents filed
 * against the record. Read-only — it composes data the service already owns.
 */
export const getRecordTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recordType: string; recordId: string }) => ({
    recordType: recordType(input?.recordType),
    recordId: str(input?.recordId, "Record id"),
  }))
  .handler(async ({ data, context }): Promise<{ entries: TimelineEntry[] }> => {
    const supabase = context.supabase as unknown as Client;
    const entries: TimelineEntry[] = [];

    // --- Email ---------------------------------------------------------
    const { data: linkRows } = await supabase
      .from("message_links")
      .select("*")
      .eq("record_type", data.recordType)
      .eq("record_id", data.recordId);
    const links = (linkRows ?? []) as Row[];
    const messageIds = [
      ...new Set(links.map((l) => l["message_id"]).filter(Boolean).map(String)),
    ];
    const threadIds = [
      ...new Set(links.map((l) => l["thread_id"]).filter(Boolean).map(String)),
    ];
    const filters = [
      messageIds.length ? `id.in.(${messageIds.join(",")})` : "",
      threadIds.length ? `thread_id.in.(${threadIds.join(",")})` : "",
    ].filter(Boolean);

    if (filters.length) {
      const { data: msgRows } = await supabase
        .from("messages")
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = (msgRows ?? []) as Row[];
      const ids = rows.map((r) => String(r["id"]));
      const { data: attRows } = ids.length
        ? await supabase.from("message_attachments").select("*").in("message_id", ids)
        : { data: [] };
      const attByMessage = new Map<string, string[]>();
      for (const a of (attRows ?? []) as Row[]) {
        const mid = String(a["message_id"]);
        attByMessage.set(mid, [...(attByMessage.get(mid) ?? []), String(a["name"] ?? "")]);
      }

      for (const r of rows) {
        const inbound = r["direction"] === "inbound";
        const to = addressList(r["to_addresses"])
          .map((a) => a.address)
          .join(", ");
        entries.push({
          id: `msg-${String(r["id"])}`,
          kind: inbound ? "email_in" : "email_out",
          purpose: purposeOf(r["purpose"]),
          title: String(r["subject"] ?? "(no subject)"),
          detail: inbound
            ? `From ${String(r["from_address"] ?? "")}`
            : `To ${to || "—"}`,
          actor: String(r["sent_by_name"] ?? r["from_name"] ?? ""),
          at: String(r["sent_at"] ?? r["received_at"] ?? r["created_at"] ?? ""),
          threadId: String(r["thread_id"] ?? "") || null,
          webUrl: "",
          attachmentNames: attByMessage.get(String(r["id"])) ?? [],
        });
      }
    }

    // --- Documents -----------------------------------------------------
    const { data: docLinks } = await supabase
      .from("document_links")
      .select("*")
      .eq("record_type", data.recordType)
      .eq("record_id", data.recordId);
    const docLinkRows = (docLinks ?? []) as Row[];
    const docIds = [...new Set(docLinkRows.map((l) => String(l["document_id"])))];
    if (docIds.length) {
      const { data: docRows } = await supabase
        .from("document_refs")
        .select("*")
        .in("id", docIds);
      const byId = new Map<string, Row>(
        ((docRows ?? []) as Row[]).map((d) => [String(d["id"]), d]),
      );
      for (const l of docLinkRows) {
        const d = byId.get(String(l["document_id"]));
        if (!d) continue;
        entries.push({
          id: `doc-${String(l["id"])}`,
          kind: "document",
          purpose: null,
          title: String(d["name"] ?? ""),
          detail: String(l["label"] ?? "") || String(d["origin"] ?? "Document"),
          actor: String(l["linked_by"] ?? d["created_by_name"] ?? ""),
          at: String(l["created_at"] ?? d["created_at"] ?? ""),
          threadId: null,
          webUrl: String(d["web_url"] ?? ""),
          attachmentNames: [],
        });
      }
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { entries: entries.slice(0, 200) };
  });
