import { presignGet, signRequest, type AwsCredentials } from "../shared/sigv4";
import {
  JobChanged,
  type BJob,
  type BNote,
  type BPhoto,
  type BReceipt,
  type BridgeStore,
  type BSignature,
  type BUser,
  type BVisit,
  type VisitWrite,
} from "./core";

/**
 * BridgeStore over Serv1's own DynamoDB tables and S3 bucket, signed with the function role's
 * temporary credentials (no SDK packages). The function's role may touch only the tables and
 * the jobs/ prefix that amplify/backend.ts grants; the rules themselves live in core.ts.
 *
 * Rows are written the way Amplify Data writes them (id, __typename, createdAt, updatedAt),
 * so the office screens read them like any other row. Rows the bridge creates use ids made
 * from the phone's actionId with a "does not exist yet" condition, so a repeat never makes
 * a second row.
 *
 * Pilot scale: lookups by job or tech scan the table once per call and filter in memory.
 * Add indexes before the tables grow large.
 */

export interface AwsStoreConfig {
  region: string;
  bucket: string;
  tables: {
    User: string;
    Job: string;
    Customer: string;
    Site: string;
    Attachment: string;
    Signature: string;
    TechNote: string;
    TechReceipt: string;
    TechAction: string;
    BridgeAudit: string;
    /** Multi-visit jobs (docs/VISITS.md). */
    Visit: string;
  };
  credentials: AwsCredentials;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
}

// ---- DynamoDB JSON ------------------------------------------------------------------------

type AV =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { L: AV[] }
  | { M: Record<string, AV> };

/** A row as a DynamoDB item (top level must be a map). */
const toItem = (row: Record<string, unknown>) => (toAV(row) as { M: Record<string, AV> }).M;

export function toAV(v: unknown): AV {
  if (v === null || v === undefined) return { NULL: true };
  if (typeof v === "string") return { S: v };
  if (typeof v === "number") return { N: String(v) };
  if (typeof v === "boolean") return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(toAV) };
  if (typeof v === "object")
    return {
      M: Object.fromEntries(
        Object.entries(v as object)
          .filter(([, x]) => x !== undefined)
          .map(([k, x]) => [k, toAV(x)]),
      ),
    };
  throw new Error("unsupported value");
}

export function fromAV(a: AV | undefined): unknown {
  if (!a) return undefined;
  if ("S" in a) return a.S;
  if ("N" in a) return Number(a.N);
  if ("BOOL" in a) return a.BOOL;
  if ("NULL" in a) return null;
  if ("L" in a) return a.L.map(fromAV);
  if ("M" in a) return Object.fromEntries(Object.entries(a.M).map(([k, x]) => [k, fromAV(x)]));
  return undefined;
}

const item = (m: Record<string, AV> | undefined) =>
  m
    ? (Object.fromEntries(Object.entries(m).map(([k, x]) => [k, fromAV(x)])) as Record<
        string,
        unknown
      >)
    : null;

const s = (v: unknown) => (typeof v === "string" ? v : null);
const list = <T>(v: unknown): T[] | null => {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? (x as T[]) : null;
  } catch {
    return null;
  }
};

export class ConditionFailed extends Error {}
export class TransactionCanceled extends Error {
  constructor(readonly reasons: string[]) {
    super("TransactionCanceled");
  }
}

export function createAwsStore(cfg: AwsStoreConfig): BridgeStore {
  const now = () => (cfg.now ? cfg.now() : new Date());
  const ddbUrl = new URL(`https://dynamodb.${cfg.region}.amazonaws.com/`);

  async function ddb(op: string, payload: object): Promise<Record<string, unknown>> {
    const body = JSON.stringify(payload);
    const headers = signRequest({
      method: "POST",
      url: ddbUrl,
      body,
      region: cfg.region,
      service: "dynamodb",
      credentials: cfg.credentials,
      contentType: "application/x-amz-json-1.0",
      headers: { "x-amz-target": `DynamoDB_20120810.${op}` },
    });
    const res = await cfg.fetch(ddbUrl.toString(), { method: "POST", headers, body });
    const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status >= 400) {
      const type = String(out.__type ?? "");
      if (type.endsWith("ConditionalCheckFailedException")) throw new ConditionFailed();
      if (type.endsWith("TransactionCanceledException"))
        throw new TransactionCanceled(
          ((out.CancellationReasons as { Code?: string }[] | undefined) ?? []).map(
            (r) => r.Code ?? "None",
          ),
        );
      throw new Error(`DynamoDB ${op} failed (${res.status})`);
    }
    return out;
  }

  const get = async (table: string, id: string) =>
    item(
      (await ddb("GetItem", { TableName: table, Key: { id: { S: id } }, ConsistentRead: true }))
        .Item as Record<string, AV> | undefined,
    );

  /** Whole-table scan for this call, filtered in memory (pilot scale). */
  const scans = new Map<string, Promise<Record<string, unknown>[]>>();
  const scan = (table: string) => {
    let p = scans.get(table);
    if (!p) {
      p = (async () => {
        const rows: Record<string, unknown>[] = [];
        let start: unknown;
        do {
          const out = await ddb("Scan", {
            TableName: table,
            ...(start ? { ExclusiveStartKey: start } : {}),
          });
          for (const i of (out.Items as Record<string, AV>[] | undefined) ?? [])
            rows.push(item(i)!);
          start = out.LastEvaluatedKey;
        } while (start);
        return rows;
      })();
      scans.set(table, p);
    }
    return p;
  };

  /** The condition that the job still matches `expect`, as DynamoDB expression parts. */
  function expectCondition(expect: Record<string, unknown>) {
    const names: Record<string, string> = {};
    const values: Record<string, AV> = {};
    const conds = ["attribute_exists(id)"];
    Object.entries(expect).forEach(([k, v], i) => {
      names[`#e${i}`] = k;
      if (v === null || v === undefined) {
        values[":nullType"] = { S: "NULL" };
        conds.push(`(attribute_not_exists(#e${i}) OR attribute_type(#e${i}, :nullType))`);
      } else {
        values[`:e${i}`] = toAV(v);
        conds.push(`#e${i} = :e${i}`);
      }
    });
    return { names, values, expression: conds.join(" AND ") };
  }

  /**
   * Creates the row unless one with this id exists (then does nothing), in one transaction with
   * a check that the job still matches `expect` (else JobChanged, nothing written).
   */
  async function addChild(
    table: string,
    typename: string,
    row: Record<string, unknown> & { jobId: unknown },
    expect: Record<string, unknown>,
  ) {
    const t = now().toISOString();
    const cond = expectCondition(expect);
    try {
      await ddb("TransactWriteItems", {
        TransactItems: [
          {
            ConditionCheck: {
              TableName: cfg.tables.Job,
              Key: { id: { S: String(row.jobId) } },
              ConditionExpression: cond.expression,
              ExpressionAttributeNames: cond.names,
              ...(Object.keys(cond.values).length
                ? { ExpressionAttributeValues: cond.values }
                : {}),
            },
          },
          {
            Put: {
              TableName: table,
              Item: toItem({ __typename: typename, createdAt: t, updatedAt: t, ...row }),
              ConditionExpression: "attribute_not_exists(id)",
            },
          },
        ],
      });
    } catch (e) {
      if (!(e instanceof TransactionCanceled)) throw e;
      const [job, put] = e.reasons;
      if (job === "ConditionalCheckFailed") throw new JobChanged();
      if (put !== "ConditionalCheckFailed") throw new Error("transaction cancelled");
      // The row already exists: a repeat, nothing to do.
    } finally {
      scans.delete(table);
    }
  }

  /**
   * A job change and its current visit's change in one transaction: both only if the job still
   * matches `expect` and the visit's status is still what the rules saw (else JobChanged).
   */
  async function updateJobAndVisit(
    id: string,
    patch: Partial<BJob>,
    expect: Record<string, unknown>,
    visit: VisitWrite,
  ) {
    const t = now().toISOString();
    const jobFields = { ...patch, updatedAt: t } as Record<string, unknown>;
    delete jobFields.id;
    const visitFields = { ...visit.patch, updatedAt: t } as Record<string, unknown>;
    delete visitFields.id;
    const js = setParts(jobFields, "j");
    const jc = expectCondition(expect);
    const vs = setParts(visitFields, "w");
    try {
      await ddb("TransactWriteItems", {
        TransactItems: [
          {
            Update: {
              TableName: cfg.tables.Job,
              Key: { id: { S: id } },
              UpdateExpression: js.expression,
              ConditionExpression: jc.expression,
              ExpressionAttributeNames: { ...js.names, ...jc.names },
              ExpressionAttributeValues: { ...js.values, ...jc.values },
            },
          },
          {
            Update: {
              TableName: cfg.tables.Visit,
              Key: { id: { S: visit.id } },
              UpdateExpression: vs.expression,
              // Still the status and the tech the rules saw (the office may reassign the visit).
              ConditionExpression: visit.expectAssignedTechId
                ? "attribute_exists(id) AND #wstatus = :wstatus AND #wtech = :wtech"
                : "attribute_exists(id) AND #wstatus = :wstatus AND (attribute_not_exists(#wtech) OR attribute_type(#wtech, :wnull))",
              ExpressionAttributeNames: {
                ...vs.names,
                "#wstatus": "status",
                "#wtech": "assignedTechId",
              },
              ExpressionAttributeValues: {
                ...vs.values,
                ":wstatus": { S: visit.expectStatus },
                ...(visit.expectAssignedTechId
                  ? { ":wtech": { S: visit.expectAssignedTechId } }
                  : { ":wnull": { S: "NULL" } }),
              },
            },
          },
          // The action's repeat marker, in the same write (Codex review of PR #21).
          ...(visit.action
            ? [
                {
                  Put: {
                    TableName: cfg.tables.TechAction,
                    Item: toItem({
                      __typename: "TechAction",
                      createdAt: t,
                      updatedAt: t,
                      ...visit.action,
                    }),
                    ConditionExpression: "attribute_not_exists(id)",
                  },
                },
              ]
            : []),
        ],
      });
    } catch (e) {
      if (!(e instanceof TransactionCanceled)) throw e;
      const [jobReason, visitReason, actionReason] = e.reasons;
      // Only the marker exists: this exact action was already applied. Nothing more to do.
      if (
        actionReason === "ConditionalCheckFailed" &&
        jobReason !== "ConditionalCheckFailed" &&
        visitReason !== "ConditionalCheckFailed"
      )
        return;
      throw new JobChanged();
    } finally {
      scans.delete(cfg.tables.Job);
      scans.delete(cfg.tables.Visit);
      scans.delete(cfg.tables.TechAction);
    }
  }

  /** Creates the row unless one with this id exists (then does nothing). */
  async function putOnce(table: string, typename: string, row: Record<string, unknown>) {
    const t = now().toISOString();
    try {
      await ddb("PutItem", {
        TableName: table,
        Item: toItem({ __typename: typename, createdAt: t, updatedAt: t, ...row }),
        ConditionExpression: "attribute_not_exists(id)",
      });
    } catch (e) {
      if (!(e instanceof ConditionFailed)) throw e;
    }
    scans.delete(table);
  }

  const toJob = (r: Record<string, unknown>): BJob => ({
    id: String(r.id),
    createdAt: s(r.createdAt) ?? "",
    updatedAt: s(r.updatedAt) ?? "",
    jobNumber: s(r.jobNumber),
    customerId: String(r.customerId ?? ""),
    siteId: s(r.siteId),
    description: s(r.description) ?? "",
    jobType: s(r.jobType),
    priority: s(r.priority) ?? "Normal",
    status: (s(r.status) ?? "New") as BJob["status"],
    assignedTechId: s(r.assignedTechId),
    scheduledStart: s(r.scheduledStart),
    scheduledEnd: s(r.scheduledEnd),
    startedAt: s(r.startedAt),
    completedAt: s(r.completedAt),
    notes: s(r.notes),
    reviewNote: s(r.reviewNote),
    holdReason: s(r.holdReason),
    holdNote: s(r.holdNote),
    officeChangedAt: s(r.officeChangedAt),
    officeNote: s(r.officeNote),
    noSignatureReason: s(r.noSignatureReason),
    noSignatureNote: s(r.noSignatureNote),
    materials: list(r.materials),
    materialsAt: s(r.materialsAt),
    techStatusAt: s(r.techStatusAt),
    visitTechIds: list<string>(r.visitTechIds),
  });
  const toVisit = (r: Record<string, unknown>): BVisit => ({
    id: String(r.id),
    jobId: String(r.jobId ?? ""),
    number: typeof r.number === "number" ? r.number : 0,
    scheduledStart: s(r.scheduledStart),
    scheduledEnd: s(r.scheduledEnd),
    assignedTechId: s(r.assignedTechId),
    status: (s(r.status) ?? "Scheduled") as BVisit["status"],
    startedAt: s(r.startedAt),
    completedAt: s(r.completedAt),
    holdReason: s(r.holdReason),
    note: s(r.note),
  });

  /** SET expression parts for an update (names and values prefixed so two can share a call). */
  function setParts(fields: Record<string, unknown>, p: string) {
    const names: Record<string, string> = {};
    const values: Record<string, AV> = {};
    const sets = Object.entries(fields).map(([k, v], i) => {
      names[`#${p}f${i}`] = k;
      values[`:${p}v${i}`] = toAV(v);
      return `#${p}f${i} = :${p}v${i}`;
    });
    return { names, values, expression: `SET ${sets.join(", ")}` };
  }

  const s3Url = (key: string) =>
    new URL(`https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`);

  return {
    async getUser(id) {
      const r = await get(cfg.tables.User, id);
      return r
        ? ({
            id: String(r.id),
            name: s(r.name) ?? "",
            role: s(r.role) ?? "",
            active: r.active !== false,
            identityId: s(r.identityId),
          } satisfies BUser)
        : null;
    },
    async getJob(id) {
      const r = await get(cfg.tables.Job, id);
      return r ? toJob(r) : null;
    },
    async jobsAssignedTo(identityId) {
      return (await scan(cfg.tables.Job))
        .map(toJob)
        .filter(
          (j) => j.assignedTechId === identityId || (j.visitTechIds ?? []).includes(identityId),
        );
    },
    async visits(jobId) {
      return (await scan(cfg.tables.Visit)).filter((r) => r.jobId === jobId).map(toVisit);
    },
    async getCustomer(id) {
      const r = await get(cfg.tables.Customer, id);
      return r ? { name: s(r.name) ?? "", phone: s(r.phone) } : null;
    },
    async getSite(id) {
      const r = await get(cfg.tables.Site, id);
      return r
        ? { name: s(r.name), address: s(r.address) ?? "", accessNotes: s(r.accessNotes) }
        : null;
    },
    async notes(jobId) {
      return (await scan(cfg.tables.TechNote))
        .filter((r) => r.jobId === jobId)
        .map(
          (r) =>
            ({
              id: String(r.id),
              jobId,
              text: s(r.text) ?? "",
              by: s(r.by),
              at: s(r.at) ?? "",
            }) satisfies BNote,
        );
    },
    async photos(jobId) {
      return (await scan(cfg.tables.Attachment))
        .filter((r) => r.jobId === jobId && r.type === "Photo")
        .map(
          (r) =>
            ({
              id: String(r.id),
              jobId,
              storagePath: s(r.storagePath) ?? "",
              caption: s(r.caption),
              createdAt: s(r.createdAt) ?? "",
            }) satisfies BPhoto,
        );
    },
    async receipts(jobId) {
      return (await scan(cfg.tables.TechReceipt))
        .filter((r) => r.jobId === jobId)
        .map(
          (r) =>
            ({
              id: String(r.id),
              jobId,
              kind: s(r.kind) ?? "other",
              vendor: s(r.vendor),
              date: s(r.date),
              amount: typeof r.amount === "number" ? r.amount : 0,
              paidWith: s(r.paidWith) ?? "company_card",
              note: s(r.note),
              storagePath: s(r.storagePath),
              assignedTechId: s(r.assignedTechId),
              at: s(r.at) ?? "",
            }) satisfies BReceipt,
        );
    },
    async signature(jobId) {
      const r = (await scan(cfg.tables.Signature))
        .filter((x) => x.jobId === jobId)
        .sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)))[0];
      return r
        ? ({
            id: String(r.id),
            jobId,
            signerName: s(r.signerName) ?? "",
            signedAt: s(r.signedAt) ?? "",
          } satisfies BSignature)
        : null;
    },
    async updateJob(id, patch, expect, visit) {
      if (visit) return updateJobAndVisit(id, patch, expect, visit);
      const fields = { ...patch, updatedAt: now().toISOString() } as Record<string, unknown>;
      delete fields.id;
      const names: Record<string, string> = {};
      const values: Record<string, AV> = {};
      const sets = Object.entries(fields).map(([k, v], i) => {
        names[`#f${i}`] = k;
        values[`:v${i}`] = toAV(v);
        return `#f${i} = :v${i}`;
      });
      // Only if the job is still as the rules saw it (atomic with the write).
      const conds = ["attribute_exists(id)"];
      Object.entries(expect).forEach(([k, v], i) => {
        names[`#e${i}`] = k;
        if (v === null || v === undefined) {
          values[":nullType"] = { S: "NULL" };
          conds.push(`(attribute_not_exists(#e${i}) OR attribute_type(#e${i}, :nullType))`);
        } else {
          values[`:e${i}`] = toAV(v);
          conds.push(`#e${i} = :e${i}`);
        }
      });
      try {
        await ddb("UpdateItem", {
          TableName: cfg.tables.Job,
          Key: { id: { S: id } },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ConditionExpression: conds.join(" AND "),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        });
      } catch (e) {
        if (e instanceof ConditionFailed) throw new JobChanged();
        throw e;
      } finally {
        scans.delete(cfg.tables.Job);
      }
    },
    addNote: (r, expect) => addChild(cfg.tables.TechNote, "TechNote", { ...r }, expect),
    addPhoto: (r, expect) =>
      addChild(
        cfg.tables.Attachment,
        "Attachment",
        {
          id: r.id,
          jobId: r.jobId,
          assignedTechId: r.assignedTechId,
          storagePath: r.storagePath,
          type: "Photo",
          caption: r.caption,
          uploadedBy: r.uploadedBy,
          jobTechIds: r.jobTechIds ?? null,
        },
        expect,
      ),
    addReceipt: (r, expect) =>
      addChild(
        cfg.tables.TechReceipt,
        "TechReceipt",
        { ...r, reviewStatus: "Pending", reviewNote: null, reviewedBy: null, reviewedAt: null },
        expect,
      ),
    addSignature: (r, expect) => addChild(cfg.tables.Signature, "Signature", { ...r }, expect),
    async putFile(key, bytes, contentType) {
      const url = s3Url(key);
      const headers = signRequest({
        method: "PUT",
        url,
        body: bytes,
        region: cfg.region,
        service: "s3",
        credentials: cfg.credentials,
        contentType,
      });
      const res = await cfg.fetch(url.toString(), {
        method: "PUT",
        headers,
        body: Buffer.from(bytes),
      });
      if (res.status >= 300) throw new Error(`S3 put failed (${res.status})`);
    },
    async fileUrl(key) {
      return presignGet({
        url: s3Url(key),
        region: cfg.region,
        service: "s3",
        credentials: cfg.credentials,
        expiresIn: 900,
        now: now(),
      });
    },
    async getAction(actionId) {
      const r = await get(cfg.tables.TechAction, actionId);
      return r
        ? { result: s(r.result) ?? "applied", jobId: s(r.jobId), serv1UserId: s(r.serv1UserId) }
        : null;
    },
    saveAction: (r) => putOnce(cfg.tables.TechAction, "TechAction", { ...r }),
    async audit(r) {
      const t = now().toISOString();
      await ddb("PutItem", {
        TableName: cfg.tables.BridgeAudit,
        Item: toItem({
          __typename: "BridgeAudit",
          id: `${t}-${Math.random().toString(36).slice(2, 10)}`,
          createdAt: t,
          updatedAt: t,
          ...r,
        }),
      });
    },
  };
}
