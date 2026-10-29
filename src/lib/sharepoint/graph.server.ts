/**
 * Microsoft Graph integration layer — SERVER ONLY.
 *
 * Nothing in this file may ever be imported from browser code: it is the single
 * place where Microsoft credentials and Graph calls will live. Today the
 * credentials are intentionally absent, so `isGraphConfigured()` returns false
 * and callers fall back to the preview document structure. When the tenant app
 * registration is created, fill in `getAccessToken()` and the request helper —
 * no UI or database change is required.
 *
 * Least privilege notes for the future connection:
 *  - Use application permissions scoped with "Sites.Selected" and grant this
 *    app access to the single designated document library only. Do not request
 *    Sites.ReadWrite.All / Files.ReadWrite.All tenant-wide.
 *  - Keep the site id and drive id pinned via environment configuration and
 *    reject any request that resolves outside DOCUMENT_ROOT.
 *  - Tokens are cached in memory on the server only and never returned to the
 *    client; the browser receives item metadata and short-lived URLs only.
 */

import type { BrowseItem } from "./types";

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
}

export class GraphNotConfiguredError extends Error {
  constructor() {
    super("Microsoft 365 is not connected yet.");
    this.name = "GraphNotConfiguredError";
  }
}

/** Reads configuration at call time (never at module scope). */
export function readGraphConfig(): GraphConfig | null {
  const tenantId = process.env["MS_GRAPH_TENANT_ID"];
  const clientId = process.env["MS_GRAPH_CLIENT_ID"];
  const clientSecret = process.env["MS_GRAPH_CLIENT_SECRET"];
  const siteId = process.env["SHAREPOINT_SITE_ID"];
  const driveId = process.env["SHAREPOINT_DRIVE_ID"];
  if (!tenantId || !clientId || !clientSecret || !siteId || !driveId) return null;
  return { tenantId, clientId, clientSecret, siteId, driveId };
}

export function isGraphConfigured(): boolean {
  return readGraphConfig() !== null;
}

/**
 * Effective configuration: environment variables first, then the connection the
 * customer entered in the app (stored server-side only).
 */
export async function loadGraphConfig(): Promise<GraphConfig | null> {
  const env = readGraphConfig();
  if (env) return env;
  const { loadMs365Settings } = await import("@/lib/integrations/ms365.server");
  const s = await loadMs365Settings();
  if (!s.tenantId || !s.clientId || !s.clientSecret || !s.siteId || !s.driveId) return null;
  return {
    tenantId: s.tenantId,
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    siteId: s.siteId,
    driveId: s.driveId,
  };
}

export async function graphConnected(): Promise<boolean> {
  return (await loadGraphConfig()) !== null;
}

/* ------------------------------------------------------------------ *
 * The provider contract. A live Graph client and the preview client
 * both implement it, so callers never branch on connection state.
 * ------------------------------------------------------------------ */

export interface DriveProvider {
  connected: boolean;
  /** List the children of a folder path (relative to the drive root). */
  listFolder(path: string): Promise<{ webUrl: string; items: BrowseItem[] }>;
  /** Create the folder if missing and return its durable identifiers. */
  ensureFolder(path: string): Promise<{
    siteId: string | null;
    driveId: string | null;
    itemId: string | null;
    webUrl: string;
    provisioned: boolean;
  }>;
  /** Upload a small file into a folder. */
  uploadFile(
    path: string,
    fileName: string,
    content: ArrayBuffer | string,
  ): Promise<BrowseItem>;
}

const GRAPH = "https://graph.microsoft.com/v1.0";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: GraphConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Microsoft token request failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

async function graphFetch(cfg: GraphConfig, path: string, init?: RequestInit) {
  const token = await getAccessToken(cfg);
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph request failed [${res.status}]: ${await res.text()}`);
  }
  return res;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  folder?: unknown;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
}

function toBrowseItem(item: GraphDriveItem, parentPath: string): BrowseItem {
  const isFolder = item.folder !== undefined;
  const ext = isFolder ? "" : (item.name.split(".").pop() ?? "").toUpperCase();
  return {
    id: item.id,
    name: item.name,
    kind: isFolder ? "folder" : "file",
    extension: ext,
    size: item.size ? `${Math.max(1, Math.round(item.size / 1024))} KB` : "",
    modifiedBy: item.lastModifiedBy?.user?.displayName ?? "",
    modifiedAt: item.lastModifiedDateTime?.slice(0, 10) ?? "",
    webUrl: item.webUrl ?? "",
    path: `${parentPath.replace(/\/$/, "")}/${item.name}`,
  };
}

const encodePath = (p: string) =>
  p
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");

/** Live Graph-backed provider. Exercised once credentials exist. */
export function createGraphProvider(cfg: GraphConfig): DriveProvider {
  const base = `/sites/${cfg.siteId}/drives/${cfg.driveId}`;
  return {
    connected: true,
    async listFolder(path) {
      const rel = encodePath(path);
      const url = rel ? `${base}/root:/${rel}:/children` : `${base}/root/children`;
      const res = await graphFetch(cfg, url);
      const json = (await res.json()) as { value: GraphDriveItem[] };
      return {
        webUrl: "",
        items: json.value.map((i) => toBrowseItem(i, path)),
      };
    },
    async ensureFolder(path) {
      const rel = encodePath(path);
      try {
        const res = await graphFetch(cfg, rel ? `${base}/root:/${rel}` : `${base}/root`);
        const item = (await res.json()) as GraphDriveItem;
        return {
          siteId: cfg.siteId,
          driveId: cfg.driveId,
          itemId: item.id,
          webUrl: item.webUrl ?? "",
          provisioned: true,
        };
      } catch {
        // Create the missing folder under its parent.
        const parts = path.split("/").filter(Boolean);
        const name = parts.pop() ?? "";
        const parent = encodePath(parts.join("/"));
        const res = await graphFetch(
          cfg,
          parent ? `${base}/root:/${parent}:/children` : `${base}/root/children`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name,
              folder: {},
              "@microsoft.graph.conflictBehavior": "replace",
            }),
          },
        );
        const item = (await res.json()) as GraphDriveItem;
        return {
          siteId: cfg.siteId,
          driveId: cfg.driveId,
          itemId: item.id,
          webUrl: item.webUrl ?? "",
          provisioned: true,
        };
      }
    },
    async uploadFile(path, fileName, content) {
      const rel = encodePath(`${path}/${fileName}`);
      const res = await graphFetch(cfg, `${base}/root:/${rel}:/content`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: content as BodyInit,
      });
      const item = (await res.json()) as GraphDriveItem;
      return toBrowseItem(item, path);
    },
  };
}

/**
 * Returns the live provider when Microsoft 365 is connected, otherwise the
 * preview provider backed by the sample folder structure.
 */
export async function getDriveProvider(): Promise<DriveProvider> {
  const cfg = await loadGraphConfig();
  if (cfg) return createGraphProvider(cfg);
  const { createPreviewProvider } = await import("./preview.server");
  return createPreviewProvider();
}
