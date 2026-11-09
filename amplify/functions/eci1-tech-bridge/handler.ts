import { createAwsStore, type AwsStoreConfig } from "./aws-store";
import { fail, handleBridge, type BridgeRequest, type BridgeStore, type Reply } from "./core";

/**
 * eci1-tech-bridge: Serv1's end of the ECI1 tech module (docs/ECI1-BRIDGE.md).
 *
 * Reached only through its function URL with AuthType AWS_IAM: AWS has already checked the
 * signature, the calling role and the time before this code runs (otherwise 403). The one
 * role allowed to call it is created in amplify/backend.ts. Body:
 * { serv1UserId, eciUserId, route, body } — the ECI1 server names the linked tech.
 *
 * Logs: one line per call with route and result (never bodies, images or names), plus
 * CloudWatch metrics in Embedded Metric Format: total calls, refusals, calls per tech and
 * distinct techs per caller session (the alarms in backend.ts watch these).
 */

interface UrlEvent {
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: {
    http?: { method?: string };
    authorizer?: { iam?: { userArn?: string; callerId?: string } };
  };
}
interface UrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const respond = (reply: Reply, status = 200): UrlResult => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(reply),
});

/** Distinct techs seen per caller session in the last 10 minutes (this running copy). */
const sessions = new Map<string, Map<string, number>>();
export function techsForSession(session: string, tech: string | null, nowMs: number): number {
  const seen = sessions.get(session) ?? new Map<string, number>();
  if (tech) seen.set(tech, nowMs);
  for (const [t, at] of seen) if (nowMs - at > 600_000) seen.delete(t);
  sessions.set(session, seen);
  if (sessions.size > 1000) sessions.delete(sessions.keys().next().value!);
  return seen.size;
}

export function metricsLine(args: {
  route: string;
  tech: string | null;
  ok: boolean;
  sessionTechs: number;
  nowMs: number;
}): string {
  return JSON.stringify({
    _aws: {
      Timestamp: args.nowMs,
      CloudWatchMetrics: [
        {
          Namespace: "Serv1/Eci1Bridge",
          Dimensions: [[], ["Tech"]],
          Metrics: [
            { Name: "Calls", Unit: "Count" },
            { Name: "Refused", Unit: "Count" },
          ],
        },
        {
          Namespace: "Serv1/Eci1Bridge",
          Dimensions: [[]],
          Metrics: [{ Name: "CallerSessionTechs", Unit: "Count" }],
        },
      ],
    },
    Tech: args.tech ?? "none",
    Calls: 1,
    Refused: args.ok ? 0 : 1,
    CallerSessionTechs: args.sessionTechs,
    route: args.route,
  });
}

/** The whole call with the store passed in, so tests need no AWS. */
export async function handleUrlEvent(
  event: UrlEvent,
  store: BridgeStore,
  env: Record<string, string | undefined>,
  now: Date,
  log: (line: string) => void,
): Promise<UrlResult> {
  if (event.requestContext?.http?.method && event.requestContext.http.method !== "POST")
    return respond(fail("invalid"), 405);
  let req: BridgeRequest = {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      req = parsed as BridgeRequest;
  } catch {
    return respond(fail("invalid"));
  }
  const reply = await handleBridge(req, store, {
    // Off switch for all traffic on Serv1's side (besides removing the caller's permission).
    enabled: env.ECI1_BRIDGE_ENABLED === "true",
    now,
    timeZone: env.COMPANY_TIME_ZONE || "America/New_York",
  });
  const tech = typeof req.serv1UserId === "string" ? req.serv1UserId.slice(0, 200) : null;
  const session =
    event.requestContext?.authorizer?.iam?.userArn ??
    event.requestContext?.authorizer?.iam?.callerId ??
    "unknown";
  log(
    metricsLine({
      route: String(req.route ?? "").slice(0, 40),
      tech,
      ok: reply.ok,
      sessionTechs: techsForSession(session, tech, now.getTime()),
      nowMs: now.getTime(),
    }),
  );
  return respond(reply);
}

function storeFromEnv(env: Record<string, string | undefined>): BridgeStore | null {
  const t = (k: string) => env[`TABLE_${k}`] ?? "";
  const tables = {
    User: t("User"),
    Job: t("Job"),
    Customer: t("Customer"),
    Site: t("Site"),
    Attachment: t("Attachment"),
    Signature: t("Signature"),
    TechNote: t("TechNote"),
    TechReceipt: t("TechReceipt"),
    TechAction: t("TechAction"),
    BridgeAudit: t("BridgeAudit"),
    Visit: t("Visit"),
  } satisfies AwsStoreConfig["tables"];
  if (
    Object.values(tables).some((v) => !v) ||
    !env.SERV1_BUCKET ||
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY
  )
    return null;
  return createAwsStore({
    region: env.AWS_REGION ?? "us-east-1",
    bucket: env.SERV1_BUCKET,
    tables,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN,
    },
    fetch: (u, i) => fetch(u, i),
  });
}

export const handler = async (event: UrlEvent): Promise<UrlResult> => {
  const store = storeFromEnv(process.env);
  // Fails closed: without its tables and bucket the bridge answers "try later" and does nothing.
  if (!store) return respond(fail("serv1_unavailable"));
  return handleUrlEvent(event, store, process.env, new Date(), (l) => console.log(l));
};
