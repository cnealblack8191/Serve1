/**
 * Spectrum connector API v1, as Serv1 calls it (ECI-ECOSYSTEM services/spectrum-connector/API.md,
 * main at f430fa7). Shared by the Amplify function that signs the calls and by the local demo
 * fake in src/data, so both check the same value rules. Pure TypeScript: no imports.
 */

export const SPECTRUM_OPERATIONS = [
  "jobs.list",
  "jobs.get",
  "workOrders.list",
  "workOrders.get",
  "credentials.status",
  "credentials.test",
  "credentials.save",
] as const;
export type SpectrumOperation = (typeof SPECTRUM_OPERATIONS)[number];

export const SPECTRUM_ERROR_CODES = [
  "caller_refused",
  "operation_refused",
  "request_refused",
  "bad_request",
  "rate_limited",
  "not_configured",
  "bad_credentials",
  "spectrum_unavailable",
  "timeout",
  "spectrum_error",
  "not_found",
  "internal",
] as const;
export type SpectrumErrorCode = (typeof SPECTRUM_ERROR_CODES)[number];

export interface SpectrumAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface SpectrumJob {
  companyCode: string;
  jobNumber: string;
  jobName: string | null;
  address: SpectrumAddress;
  customer: { code: string | null; name: string | null };
  status: string | null;
  projectManager: string | null;
}

export interface SpectrumWorkOrder {
  companyCode: string;
  workOrderNumber: string;
  jobNumber: string | null;
  description: string | null;
  site: { name: string | null } & SpectrumAddress;
  status: string | null;
  assignedTechnician: string | null;
  dates: { entered: string | null; scheduled: string | null; completed: string | null };
}

export type SpectrumAuthMode = "basic" | "enhanced";

export interface CredentialsInput {
  address: string;
  companyCode: string;
  authorizationId: string;
  authMode: SpectrumAuthMode;
  operatorCode?: string;
}

export type CredentialsStatus =
  | { configured: true; savedBy: string; savedAt: string; authMode: SpectrumAuthMode }
  | { configured: false; unreadable?: true };

export type TestResult =
  | { result: "connected"; durationMs: number }
  | { result: "failed"; reason: SpectrumErrorCode; message: string; durationMs: number };

/** Parameters and data of each operation. */
export interface SpectrumOps {
  "jobs.list": {
    params: { status?: string };
    data: { records: SpectrumJob[]; truncated: boolean };
  };
  "jobs.get": { params: { jobNumber: string }; data: { record: SpectrumJob } };
  "workOrders.list": {
    params: { status?: string; jobNumber?: string };
    data: { records: SpectrumWorkOrder[]; truncated: boolean };
  };
  "workOrders.get": { params: { workOrderNumber: string }; data: { record: SpectrumWorkOrder } };
  "credentials.status": { params: Record<string, never>; data: CredentialsStatus };
  "credentials.test": { params: Record<string, never>; data: TestResult };
  "credentials.save": {
    params: CredentialsInput & { savedBy: string };
    data: { saved: true; savedBy: string; savedAt: string };
  };
}

export type SpectrumReply<O extends SpectrumOperation = SpectrumOperation> =
  | { ok: true; operation: O; data: SpectrumOps[O]["data"] }
  | { ok: false; error: { code: SpectrumErrorCode; message: string } };

// ---- value rules (API.md section 3) ---------------------------------------------------------

const RECORD_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,29}$/;
const STATUS = /^[A-Za-z0-9]{1,3}$/;
const COMPANY = /^[A-Za-z0-9]{1,6}$/;
const AUTH_ID = /^[A-Za-z0-9-]{8,128}$/;
const OPERATOR = /^[A-Za-z0-9]{1,10}$/;
// A DNS name: labels of letters, digits and "-", at least one dot, the last label not all digits.
const DNS_NAME =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]*$/;

export const isRecordNumber = (v: unknown): v is string =>
  typeof v === "string" && RECORD_NUMBER.test(v);
export const isStatusCode = (v: unknown): v is string => typeof v === "string" && STATUS.test(v);
export const isCompanyCode = (v: unknown): v is string => typeof v === "string" && COMPANY.test(v);
export const isAuthorizationId = (v: unknown): v is string =>
  typeof v === "string" && AUTH_ID.test(v);
export const isOperatorCode = (v: unknown): v is string =>
  typeof v === "string" && OPERATOR.test(v);

/** https://, a DNS name (not an IP or localhost), no user, password, query or fragment, ≤300 chars. */
export function isSpectrumAddress(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 300) return false;
  if (!/^https:\/\//i.test(v) || /[?#@\s]/.test(v)) return false;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    return false;
  if (url.port) return false;
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  return DNS_NAME.test(host);
}

const ALLOWED_FIELDS: Record<SpectrumOperation, readonly string[]> = {
  "jobs.list": ["status"],
  "jobs.get": ["jobNumber"],
  "workOrders.list": ["status", "jobNumber"],
  "workOrders.get": ["workOrderNumber"],
  "credentials.status": [],
  "credentials.test": [],
  "credentials.save": [
    "address",
    "companyCode",
    "authorizationId",
    "authMode",
    "operatorCode",
    "savedBy",
  ],
};

export const isSpectrumOperation = (v: unknown): v is SpectrumOperation =>
  typeof v === "string" && (SPECTRUM_OPERATIONS as readonly string[]).includes(v);

/**
 * True when the parameters would pass the connector's checks: a plain object, only the
 * operation's own fields, every value valid. Never says which field failed (no values echoed).
 */
export function validParams(op: SpectrumOperation, params: unknown): boolean {
  if (params === null || typeof params !== "object" || Array.isArray(params)) return false;
  const p = params as Record<string, unknown>;
  const allowed = ALLOWED_FIELDS[op];
  if (!Object.keys(p).every((k) => allowed.includes(k))) return false;
  const opt = (k: string, ok: (v: unknown) => boolean) => p[k] === undefined || ok(p[k]);
  switch (op) {
    case "jobs.list":
      return opt("status", isStatusCode);
    case "jobs.get":
      return isRecordNumber(p.jobNumber);
    case "workOrders.list":
      return opt("status", isStatusCode) && opt("jobNumber", isRecordNumber);
    case "workOrders.get":
      return isRecordNumber(p.workOrderNumber);
    case "credentials.status":
    case "credentials.test":
      return true;
    case "credentials.save": {
      if (p.authMode !== "basic" && p.authMode !== "enhanced") return false;
      const operatorOk =
        p.authMode === "enhanced"
          ? isOperatorCode(p.operatorCode)
          : opt("operatorCode", isOperatorCode);
      return (
        isSpectrumAddress(p.address) &&
        isCompanyCode(p.companyCode) &&
        isAuthorizationId(p.authorizationId) &&
        operatorOk &&
        typeof p.savedBy === "string" &&
        p.savedBy.trim().length >= 1 &&
        p.savedBy.length <= 100
      );
    }
  }
}

/** Who may run each operation in Serv1: the credential screens are Admin only. */
export function roleMayRun(op: SpectrumOperation, groups: readonly string[]): boolean {
  if (groups.includes("Admin")) return true;
  return groups.includes("Office") && !op.startsWith("credentials.");
}

/** Fixed, safe-to-show text for each code (the connector's own messages, where it gives one). */
export const SPECTRUM_ERROR_TEXT: Record<SpectrumErrorCode, string> = {
  caller_refused: "The Spectrum connector does not accept calls from this Serv1 yet.",
  operation_refused: "This Spectrum action is not allowed for your account.",
  request_refused: "The Spectrum connector refused the request.",
  bad_request: "Spectrum did not accept those values. Check them and try again.",
  rate_limited: "Too many Spectrum requests. Wait a moment and try again.",
  not_configured: "Spectrum credentials have not been saved.",
  bad_credentials: "Spectrum refused the saved credentials.",
  spectrum_unavailable: "Spectrum unavailable, try again later",
  timeout: "Spectrum unavailable, try again later",
  spectrum_error: "Spectrum unavailable, try again later",
  not_found: "Spectrum has no record with that number.",
  internal: "The Spectrum connector had a problem. Try again later.",
};

export const refusal = (code: SpectrumErrorCode, message = SPECTRUM_ERROR_TEXT[code]) =>
  ({ ok: false, error: { code, message } }) as const;
