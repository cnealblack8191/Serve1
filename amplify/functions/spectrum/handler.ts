import {
  isSpectrumOperation,
  refusal,
  roleMayRun,
  SPECTRUM_ERROR_CODES,
  validParams,
  type SpectrumErrorCode,
  type SpectrumReply,
} from "./contract";
import { signRequest } from "../shared/sigv4";

/**
 * Serv1's server-side caller for the Spectrum connector (API.md section 1). The browser never
 * signs or sees connector traffic: it calls the `spectrum` query (amplify/data/resource.ts),
 * AppSync runs this function, and this function signs the POST with its own role's temporary
 * credentials (SigV4, execute-api, us-east-2).
 *
 * Never logs or returns parameters: credentials.save carries the Spectrum credentials.
 * Environment (set at deployment, never in code): SPECTRUM_CONNECTOR_URL, the connector's
 * ApiEndpoint stack output. AWS_* keys are the Lambda runtime's own.
 */

interface AppSyncEvent {
  arguments: { operation?: unknown; params?: unknown };
  identity?: {
    groups?: string[] | null;
    username?: string;
    claims?: Record<string, unknown>;
  } | null;
}

const REGION = "us-east-2";
/** The connector gives up on Spectrum after 10 s; allow a little more for the hop itself. */
const TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 8 * 1024;

const claim = (e: AppSyncEvent, k: string) => {
  const v = e.identity?.claims?.[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** The signed-in admin's name or email, from the session (never from a form field). */
export const savedByFrom = (e: AppSyncEvent) =>
  (
    claim(e, "name") ??
    claim(e, "preferred_username") ??
    claim(e, "email") ??
    e.identity?.username ??
    ""
  ).slice(0, 100);

const isReply = (v: unknown): v is SpectrumReply => {
  if (!v || typeof v !== "object") return false;
  const r = v as { ok?: unknown; error?: { code?: unknown; message?: unknown }; data?: unknown };
  if (r.ok === true) return "data" in r;
  return (
    r.ok === false &&
    typeof r.error?.message === "string" &&
    (SPECTRUM_ERROR_CODES as readonly unknown[]).includes(r.error?.code)
  );
};

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The whole call, with fetch and environment passed in so tests need no network. */
export async function callConnector(
  event: AppSyncEvent,
  env: Record<string, string | undefined>,
  fetchImpl: Fetch,
): Promise<SpectrumReply> {
  const op = event.arguments?.operation;
  if (!isSpectrumOperation(op)) return refusal("operation_refused");
  const groups = event.identity?.groups ?? [];
  if (!roleMayRun(op, groups)) return refusal("operation_refused");

  let params: unknown = event.arguments?.params ?? {};
  if (typeof params === "string") {
    try {
      params = params.trim() ? JSON.parse(params) : {};
    } catch {
      return refusal("bad_request");
    }
  }
  if (op === "credentials.save" && params && typeof params === "object") {
    params = { ...(params as object), savedBy: savedByFrom(event) };
  }
  if (!validParams(op, params)) return refusal("bad_request");

  const base = env.SPECTRUM_CONNECTOR_URL;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!base || !accessKeyId || !secretAccessKey) {
    return refusal("internal", "Serv1 is not connected to the Spectrum connector yet.");
  }

  const body = JSON.stringify(params);
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return refusal("bad_request");
  const url = new URL(`${base.replace(/\/+$/, "")}/v1/${op}`);
  const headers = signRequest({
    method: "POST",
    url,
    body,
    region: REGION,
    service: "execute-api",
    credentials: { accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN },
  });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    // No Origin header: the connector refuses browser-style requests (request_refused).
    const res = await fetchImpl(url.toString(), {
      method: "POST",
      headers,
      body,
      signal: abort.signal,
      redirect: "error",
    });
    const reply: unknown = await res.json().catch(() => null);
    if (isReply(reply)) return reply;
    // API Gateway's own 403 for a bad signature has no connector envelope.
    if (res.status === 403) return refusal("caller_refused");
    return refusal("internal");
  } catch (e) {
    return refusal(abort.signal.aborted ? "timeout" : "spectrum_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export const handler = async (event: AppSyncEvent): Promise<SpectrumReply> => {
  const reply = await callConnector(event, process.env, (u, i) => fetch(u, i));
  // Operation and outcome only; never parameters or records.
  const code: SpectrumErrorCode | "ok" = reply.ok ? "ok" : reply.error.code;
  console.log(
    JSON.stringify({ operation: String(event.arguments?.operation ?? ""), result: code }),
  );
  return reply;
};
