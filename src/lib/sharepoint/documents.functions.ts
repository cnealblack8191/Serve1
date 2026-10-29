/**
 * Document service — the only bridge between the app and SharePoint.
 *
 * Every call is authenticated and runs server-side; Microsoft credentials are
 * never exposed to the browser. While Microsoft 365 is not connected these
 * functions still work end to end against the preview drive provider, so the
 * UI, database relationships and workflows are production paths, not mockups.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  folderPathFor,
  type BrowseResult,
  type DocumentLocation,
  type DocumentOrigin,
  type DocumentRecordType,
  type GeneratedDocumentKind,
  type LinkedDocument,
  DOCUMENT_ROOT,
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

/** Keeps every path inside the designated library — never the whole tenant. */
const guardPath = (path: string): string => {
  const clean = `/${path.split("/").filter(Boolean).join("/")}`;
  if (clean.includes("..")) throw new Error("Invalid folder path");
  if (clean !== DOCUMENT_ROOT && !clean.startsWith(`${DOCUMENT_ROOT}/`)) return DOCUMENT_ROOT;
  return clean;
};

type Row = Record<string, unknown>;

const toDoc = (ref: Row, link: Row, alsoLinkedTo: LinkedDocument["alsoLinkedTo"]): LinkedDocument => ({
  id: String(ref["id"]),
  provider: String(ref["provider"] ?? "sharepoint"),
  siteId: (ref["site_id"] as string | null) ?? null,
  driveId: (ref["drive_id"] as string | null) ?? null,
  itemId: (ref["item_id"] as string | null) ?? null,
  name: String(ref["name"] ?? ""),
  kind: (ref["kind"] as "file" | "folder") ?? "file",
  extension: String(ref["extension"] ?? ""),
  sizeBytes: (ref["size_bytes"] as number | null) ?? null,
  webUrl: String(ref["web_url"] ?? ""),
  folderPath: String(ref["folder_path"] ?? ""),
  origin: (ref["origin"] as DocumentOrigin) ?? "linked",
  generatedKind: (ref["generated_kind"] as GeneratedDocumentKind | null) ?? null,
  createdByName: String(ref["created_by_name"] ?? ""),
  modifiedAt: String(ref["modified_at"] ?? ""),
  linkId: String(link["id"]),
  label: String(link["label"] ?? ""),
  linkedBy: String(link["linked_by"] ?? ""),
  alsoLinkedTo,
});

/* ------------------------------------------------------------------ */
/* Browsing                                                            */
/* ------------------------------------------------------------------ */

export const browseDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path?: string }) => ({ path: optStr(input?.path) || DOCUMENT_ROOT }))
  .handler(async ({ data }): Promise<BrowseResult> => {
    const path = guardPath(data.path);
    const { getDriveProvider } = await import("./graph.server");
    const provider = await getDriveProvider();
    const { items, webUrl } = await provider.listFolder(path);

    const parts = path.split("/").filter(Boolean);
    const breadcrumbs = parts.map((name, i) => ({
      name,
      path: `/${parts.slice(0, i + 1).join("/")}`,
    }));

    return {
      connected: provider.connected,
      path,
      webUrl,
      breadcrumbs,
      items: items.sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
      ),
    };
  });

/* ------------------------------------------------------------------ */
/* Per-record documents                                                */
/* ------------------------------------------------------------------ */

interface RecordInput {
  recordType: string;
  recordId: string;
  name?: string;
  customer?: string;
}

const validateRecord = (input: RecordInput) => ({
  recordType: recordType(input?.recordType),
  recordId: str(input?.recordId, "Record id"),
  name: optStr(input?.name),
  customer: optStr(input?.customer),
});

export const getRecordDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRecord)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ connected: boolean; location: DocumentLocation; documents: LinkedDocument[] }> => {
      const supabase = context.supabase;

      const { data: locRow, error: locErr } = await supabase
        .from("document_locations")
        .select("*")
        .eq("record_type", data.recordType)
        .eq("record_id", data.recordId)
        .maybeSingle();
      if (locErr) throw new Error(locErr.message);

      const fallbackPath = folderPathFor(data.recordType, {
        recordId: data.recordId,
        name: data.name,
        customer: data.customer,
      });

      const location: DocumentLocation = locRow
        ? {
            recordType: data.recordType,
            recordId: data.recordId,
            siteId: locRow.site_id,
            driveId: locRow.drive_id,
            folderItemId: locRow.folder_item_id,
            folderPath: locRow.folder_path,
            webUrl: locRow.web_url,
            provisioned: locRow.provisioned,
          }
        : {
            recordType: data.recordType,
            recordId: data.recordId,
            siteId: null,
            driveId: null,
            folderItemId: null,
            folderPath: fallbackPath,
            webUrl: "",
            provisioned: false,
          };

      const { data: links, error: linkErr } = await supabase
        .from("document_links")
        .select("*, document_refs(*)")
        .eq("record_type", data.recordType)
        .eq("record_id", data.recordId)
        .order("created_at", { ascending: false });
      if (linkErr) throw new Error(linkErr.message);

      const rows = (links ?? []) as unknown as (Row & { document_refs: Row | null })[];
      const ids = rows.map((r) => String(r["document_id"]));

      // Cross-references: the same physical file seen from other records.
      let others: Row[] = [];
      if (ids.length > 0) {
        const { data: all } = await supabase
          .from("document_links")
          .select("document_id, record_type, record_id")
          .in("document_id", ids);
        others = (all ?? []) as unknown as Row[];
      }

      const documents = rows
        .filter((r) => r.document_refs)
        .map((r) =>
          toDoc(
            r.document_refs as Row,
            r,
            others
              .filter(
                (o) =>
                  String(o["document_id"]) === String(r["document_id"]) &&
                  !(
                    String(o["record_type"]) === data.recordType &&
                    String(o["record_id"]) === data.recordId
                  ),
              )
              .map((o) => ({
                recordType: o["record_type"] as DocumentRecordType,
                recordId: String(o["record_id"]),
              })),
          ),
        );

      const { graphConnected } = await import("./graph.server");
      return { connected: await graphConnected(), location, documents };
    },
  );

/** Creates (or repairs) the record's SharePoint folder and stores its identifiers. */
export const ensureRecordFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRecord)
  .handler(async ({ data, context }): Promise<DocumentLocation> => {
    const path = guardPath(
      folderPathFor(data.recordType, {
        recordId: data.recordId,
        name: data.name,
        customer: data.customer,
      }),
    );
    const { getDriveProvider } = await import("./graph.server");
    const provider = await getDriveProvider();
    const folder = await provider.ensureFolder(path);

    const { data: saved, error } = await context.supabase
      .from("document_locations")
      .upsert(
        {
          record_type: data.recordType,
          record_id: data.recordId,
          site_id: folder.siteId,
          drive_id: folder.driveId,
          folder_item_id: folder.itemId,
          folder_path: path,
          web_url: folder.webUrl,
          provisioned: folder.provisioned,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "record_type,record_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      recordType: data.recordType,
      recordId: data.recordId,
      siteId: saved.site_id,
      driveId: saved.drive_id,
      folderItemId: saved.folder_item_id,
      folderPath: saved.folder_path,
      webUrl: saved.web_url,
      provisioned: saved.provisioned,
    };
  });

/* ------------------------------------------------------------------ */
/* Associating documents                                               */
/* ------------------------------------------------------------------ */

interface AttachInput {
  recordType: string;
  recordId: string;
  label?: string;
  linkedBy?: string;
  /** Existing app document reference, when attaching a file already known. */
  documentId?: string;
  /** Otherwise the drive item (from browsing) or a manual SharePoint URL. */
  item?: {
    itemId?: string;
    driveId?: string;
    siteId?: string;
    name?: string;
    extension?: string;
    webUrl?: string;
    folderPath?: string;
    modifiedAt?: string;
    modifiedBy?: string;
  };
  origin?: DocumentOrigin;
}

export const attachDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AttachInput) => {
    const base = {
      recordType: recordType(input?.recordType),
      recordId: str(input?.recordId, "Record id"),
      label: optStr(input?.label),
      linkedBy: optStr(input?.linkedBy),
      origin: (input?.origin ?? "linked") as DocumentOrigin,
    };
    if (input?.documentId) return { ...base, documentId: str(input.documentId, "Document") };
    const item = input?.item ?? {};
    const name = str(item.name, "File name");
    const webUrl = optStr(item.webUrl);
    if (webUrl && !/^https?:\/\//i.test(webUrl)) throw new Error("Link must start with http(s)://");
    return {
      ...base,
      item: {
        itemId: optStr(item.itemId) || null,
        driveId: optStr(item.driveId) || null,
        siteId: optStr(item.siteId) || null,
        name,
        extension: optStr(item.extension) || (name.split(".").pop() ?? "").toUpperCase(),
        webUrl,
        folderPath: optStr(item.folderPath),
        modifiedAt: optStr(item.modifiedAt),
        modifiedBy: optStr(item.modifiedBy),
      },
    };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    let documentId = "documentId" in data ? data.documentId : undefined;

    if (!documentId && "item" in data && data.item) {
      const item = data.item;
      // A preview item has no Graph id yet; match on the web URL instead so we
      // never duplicate a reference to the same physical file.
      let existing: string | null = null;
      if (item.itemId && item.driveId) {
        const { data: hit } = await supabase
          .from("document_refs")
          .select("id")
          .eq("drive_id", item.driveId)
          .eq("item_id", item.itemId)
          .maybeSingle();
        existing = hit?.id ?? null;
      } else if (item.webUrl) {
        const { data: hit } = await supabase
          .from("document_refs")
          .select("id")
          .eq("web_url", item.webUrl)
          .maybeSingle();
        existing = hit?.id ?? null;
      }

      if (existing) {
        documentId = existing;
      } else {
        const { data: created, error } = await supabase
          .from("document_refs")
          .insert({
            provider: "sharepoint",
            site_id: item.siteId,
            drive_id: item.driveId,
            item_id: item.itemId,
            name: item.name,
            kind: "file",
            extension: item.extension,
            web_url: item.webUrl,
            folder_path: item.folderPath,
            origin: data.origin,
            created_by_name: data.linkedBy,
            modified_at: item.modifiedAt,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        documentId = created.id;
      }
    }

    if (!documentId) throw new Error("Nothing to attach");

    const { error: linkErr } = await supabase.from("document_links").upsert(
      {
        document_id: documentId,
        record_type: data.recordType,
        record_id: data.recordId,
        label: data.label,
        linked_by: data.linkedBy,
      },
      { onConflict: "document_id,record_type,record_id" },
    );
    if (linkErr) throw new Error(linkErr.message);

    return { documentId };
  });

export const detachDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { linkId: string }) => ({ linkId: str(input?.linkId, "Link") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("document_links")
      .delete()
      .eq("id", data.linkId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Uploads and generated documents                                     */
/* ------------------------------------------------------------------ */

export const uploadRecordDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: RecordInput & { fileName: string; contentBase64?: string; label?: string; uploadedBy?: string }) => ({
      ...validateRecord(input),
      fileName: str(input?.fileName, "File name"),
      contentBase64: optStr(input?.contentBase64),
      label: optStr(input?.label),
      uploadedBy: optStr(input?.uploadedBy),
    }),
  )
  .handler(async ({ data, context }) => {
    const path = guardPath(
      folderPathFor(data.recordType, {
        recordId: data.recordId,
        name: data.name,
        customer: data.customer,
      }),
    );
    const { getDriveProvider } = await import("./graph.server");
    const provider = await getDriveProvider();
    const bytes = data.contentBase64
      ? Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0)).buffer
      : new ArrayBuffer(0);
    const item = await provider.uploadFile(path, data.fileName, bytes);

    const { data: ref, error } = await context.supabase
      .from("document_refs")
      .insert({
        provider: "sharepoint",
        site_id: null,
        drive_id: null,
        item_id: provider.connected ? item.id : null,
        name: item.name,
        kind: "file",
        extension: item.extension,
        web_url: item.webUrl,
        folder_path: path,
        origin: "uploaded",
        created_by_name: data.uploadedBy,
        modified_at: item.modifiedAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: linkErr } = await context.supabase.from("document_links").insert({
      document_id: ref.id,
      record_type: data.recordType,
      record_id: data.recordId,
      label: data.label,
      linked_by: data.uploadedBy,
    });
    if (linkErr) throw new Error(linkErr.message);

    return { documentId: ref.id, connected: provider.connected };
  });

/**
 * Registers a document the application produced (proposal, estimate, bid
 * submission, work-order paperwork, invoice, supporting file) against its
 * record. Once Microsoft 365 is connected the same call also writes the file
 * into the record's SharePoint folder.
 */
export const registerGeneratedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input: RecordInput & {
        fileName: string;
        generatedKind: string;
        label?: string;
        createdBy?: string;
        contentBase64?: string;
      },
    ) => ({
      ...validateRecord(input),
      fileName: str(input?.fileName, "File name"),
      generatedKind: str(input?.generatedKind, "Document kind") as GeneratedDocumentKind,
      label: optStr(input?.label),
      createdBy: optStr(input?.createdBy),
      contentBase64: optStr(input?.contentBase64),
    }),
  )
  .handler(async ({ data, context }) => {
    const path = guardPath(
      folderPathFor(data.recordType, {
        recordId: data.recordId,
        name: data.name,
        customer: data.customer,
      }),
    );
    const { getDriveProvider } = await import("./graph.server");
    const provider = await getDriveProvider();

    let webUrl = "";
    let itemId: string | null = null;
    if (provider.connected) {
      const bytes = data.contentBase64
        ? Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0)).buffer
        : new ArrayBuffer(0);
      const item = await provider.uploadFile(path, data.fileName, bytes);
      webUrl = item.webUrl;
      itemId = item.id;
    }

    const { data: ref, error } = await context.supabase
      .from("document_refs")
      .insert({
        provider: "sharepoint",
        item_id: itemId,
        name: data.fileName,
        kind: "file",
        extension: (data.fileName.split(".").pop() ?? "").toUpperCase(),
        web_url: webUrl,
        folder_path: path,
        origin: "generated",
        generated_kind: data.generatedKind,
        created_by_name: data.createdBy,
        modified_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: linkErr } = await context.supabase.from("document_links").insert({
      document_id: ref.id,
      record_type: data.recordType,
      record_id: data.recordId,
      label: data.label || data.generatedKind,
      linked_by: data.createdBy,
    });
    if (linkErr) throw new Error(linkErr.message);

    return { documentId: ref.id, pendingUpload: !provider.connected };
  });
