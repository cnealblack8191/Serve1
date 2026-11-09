/** ECI1 bridge AWS side: signer vs the AWS SDK, DynamoDB/S3 requests, URL handler. No network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

import { presignGet, signRequest } from "../../amplify/functions/shared/sigv4.ts";
import {
  createAwsStore,
  fromAV,
  toAV,
} from "../../amplify/functions/eci1-tech-bridge/aws-store.ts";
import {
  handleUrlEvent,
  techsForSession,
} from "../../amplify/functions/eci1-tech-bridge/handler.ts";
import { JobChanged, type BridgeStore } from "../../amplify/functions/eci1-tech-bridge/core.ts";

// AWS's documentation example keys: synthetic.
const KEYS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  sessionToken: "synthetic-session-token",
};
const NOW = new Date("2026-11-07T15:04:05Z");
const sdk = (service: string, region: string, uriEscapePath = true) =>
  new SignatureV4({ service, region, credentials: KEYS, sha256: Sha256, uriEscapePath });

describe("signer matches the AWS SDK", () => {
  it("S3 PUT with a binary body", async () => {
    const url = new URL(
      "https://serv1-files.s3.us-east-1.amazonaws.com/jobs/j1/tech-photos/a-0.jpg",
    );
    const body = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const mine = signRequest({
      method: "PUT",
      url,
      body,
      region: "us-east-1",
      service: "s3",
      credentials: KEYS,
      contentType: "image/jpeg",
      now: NOW,
    });
    const theirs = await sdk("s3", "us-east-1", false).sign(
      {
        method: "PUT",
        protocol: "https:",
        hostname: url.hostname,
        path: url.pathname,
        headers: {
          host: url.hostname,
          "content-type": "image/jpeg",
          "x-amz-content-sha256": mine["x-amz-content-sha256"]!,
        },
        body,
      },
      { signingDate: NOW },
    );
    assert.equal(mine.authorization, theirs.headers.authorization);
  });
  it("DynamoDB call with x-amz-target", async () => {
    const url = new URL("https://dynamodb.us-east-1.amazonaws.com/");
    const body = JSON.stringify({ TableName: "Job-abc", Key: { id: { S: "j1" } } });
    const extra = { "x-amz-target": "DynamoDB_20120810.GetItem" };
    const mine = signRequest({
      method: "POST",
      url,
      body,
      region: "us-east-1",
      service: "dynamodb",
      credentials: KEYS,
      contentType: "application/x-amz-json-1.0",
      headers: extra,
      now: NOW,
    });
    const theirs = await sdk("dynamodb", "us-east-1").sign(
      {
        method: "POST",
        protocol: "https:",
        hostname: url.hostname,
        path: "/",
        headers: {
          host: url.hostname,
          "content-type": "application/x-amz-json-1.0",
          "x-amz-content-sha256": mine["x-amz-content-sha256"]!,
          ...extra,
        },
        body,
      },
      { signingDate: NOW },
    );
    assert.equal(mine.authorization, theirs.headers.authorization);
  });
  it("S3 short-lived GET link (as the S3 presigner makes it: UNSIGNED-PAYLOAD, host only)", async () => {
    const url = new URL("https://serv1-files.s3.us-east-1.amazonaws.com/jobs/j1/receipts/r-1.jpg");
    const mine = presignGet({
      url,
      region: "us-east-1",
      service: "s3",
      credentials: KEYS,
      expiresIn: 900,
      now: NOW,
    });
    const theirs = await sdk("s3", "us-east-1", false).presign(
      {
        method: "GET",
        protocol: "https:",
        hostname: url.hostname,
        path: url.pathname,
        headers: { host: url.hostname, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
        query: {},
      },
      {
        signingDate: NOW,
        expiresIn: 900,
        unhoistableHeaders: new Set(["x-amz-content-sha256"]),
        unsignableHeaders: new Set(["x-amz-content-sha256"]),
      },
    );
    const q = theirs.query as Record<string, string>;
    assert.equal(new URL(mine).searchParams.get("X-Amz-Signature"), q["X-Amz-Signature"]);
    assert.equal(new URL(mine).searchParams.get("X-Amz-Expires"), "900");
  });
});

describe("DynamoDB values", () => {
  it("round-trips rows", () => {
    const row = {
      id: "j1",
      qty: 2.5,
      ok: true,
      none: null,
      materials: [{ name: "Wire", qty: 3, unit: "ft" }],
    };
    assert.deepEqual(fromAV(toAV(row)), row);
  });
});

describe("store requests", () => {
  type Sent = {
    url: string;
    target: string | undefined;
    body: Record<string, unknown> | null;
    method: string;
  };
  const fake = (answer: (s: Sent) => { status: number; json: unknown }) => {
    const sent: Sent[] = [];
    const store = createAwsStore({
      region: "us-east-1",
      bucket: "serv1-files",
      tables: {
        User: "User-t",
        Job: "Job-t",
        Customer: "Customer-t",
        Site: "Site-t",
        Attachment: "Attachment-t",
        Signature: "Signature-t",
        TechNote: "TechNote-t",
        Visit: "Visit-t",
        TechReceipt: "TechReceipt-t",
        TechAction: "TechAction-t",
        BridgeAudit: "BridgeAudit-t",
      },
      credentials: KEYS,
      now: () => NOW,
      fetch: async (url, init) => {
        const headers = init.headers as Record<string, string>;
        const s: Sent = {
          url,
          method: String(init.method),
          target: headers["x-amz-target"],
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        };
        sent.push(s);
        const a = answer(s);
        return { status: a.status, json: async () => a.json } as unknown as Response;
      },
    });
    return { store, sent };
  };

  const note = {
    id: "eci1-a1",
    jobId: "j1",
    assignedTechId: "t",
    actionId: "a1",
    text: "x",
    by: "Tara",
    at: NOW.toISOString(),
  };
  const cancelled = (codes: string[]) => () => ({
    status: 400,
    json: {
      __type: "com.amazonaws.dynamodb.v20120810#TransactionCanceledException",
      CancellationReasons: codes.map((Code) => ({ Code })),
    },
  });

  it("adds rows in one transaction with a check on the job's assignment and status", async () => {
    const { store, sent } = fake(() => ({ status: 200, json: {} }));
    await store.addNote(note, { assignedTechId: "t", status: "InProgress" });
    assert.equal(sent[0]!.target, "DynamoDB_20120810.TransactWriteItems");
    const [check, put] = sent[0]!.body!.TransactItems as Record<string, Record<string, unknown>>[];
    assert.equal(check!.ConditionCheck!.TableName, "Job-t");
    assert.equal(
      check!.ConditionCheck!.ConditionExpression,
      "attribute_exists(id) AND #e0 = :e0 AND #e1 = :e1",
    );
    assert.equal(put!.Put!.ConditionExpression, "attribute_not_exists(id)");
    assert.deepEqual((put!.Put!.Item as Record<string, unknown>).__typename, { S: "TechNote" });
  });
  it("a repeat (row exists) is quietly ignored; a changed job is JobChanged", async () => {
    await fake(cancelled(["None", "ConditionalCheckFailed"])).store.addNote(note, {
      status: "InProgress",
    });
    await assert.rejects(
      fake(cancelled(["ConditionalCheckFailed", "None"])).store.addNote(note, {
        status: "InProgress",
      }),
      JobChanged,
    );
  });
  it("other database errors surface (the bridge then answers serv1_unavailable)", async () => {
    const { store } = fake(() => ({ status: 500, json: {} }));
    await assert.rejects(store.getJob("j1"));
  });
  it("a job change with its visit is one transaction, conditional on both (docs/VISITS.md)", async () => {
    const { store, sent } = fake(() => ({ status: 200, json: {} }));
    await store.updateJob(
      "mv",
      { status: "InProgress" },
      { assignedTechId: "tech-a", status: "Scheduled" },
      {
        id: "v1",
        patch: { status: "InProgress" },
        expectStatus: "Scheduled",
        expectAssignedTechId: "tech-a",
      },
    );
    assert.equal(sent[0]!.target, "DynamoDB_20120810.TransactWriteItems");
    const [job, visit] = sent[0]!.body!.TransactItems as Record<string, Record<string, unknown>>[];
    assert.equal(job!.Update!.TableName, "Job-t");
    assert.equal(
      job!.Update!.ConditionExpression,
      "attribute_exists(id) AND #e0 = :e0 AND #e1 = :e1",
    );
    assert.equal(visit!.Update!.TableName, "Visit-t");
    // Still the status and the tech the rules saw (Codex review of PR #21).
    assert.equal(
      visit!.Update!.ConditionExpression,
      "attribute_exists(id) AND #wstatus = :wstatus AND #wtech = :wtech",
    );
    assert.deepEqual(
      (visit!.Update!.ExpressionAttributeValues as Record<string, unknown>)[":wtech"],
      { S: "tech-a" },
    );
    assert.deepEqual(
      (visit!.Update!.ExpressionAttributeValues as Record<string, unknown>)[":wstatus"],
      { S: "Scheduled" },
    );
    // Either side changed meanwhile: nothing saved, JobChanged.
    await assert.rejects(
      fake(cancelled(["None", "ConditionalCheckFailed"])).store.updateJob(
        "mv",
        { status: "InProgress" },
        { status: "Scheduled" },
        {
          id: "v1",
          patch: { status: "InProgress" },
          expectStatus: "Scheduled",
          expectAssignedTechId: "tech-a",
        },
      ),
      JobChanged,
    );
  });
  it("the action marker is saved in the same transaction; an existing marker means already applied", async () => {
    const action = {
      id: "act-1",
      jobId: "mv",
      route: "visit_done" as const,
      serv1UserId: "u-a",
      at: NOW.toISOString(),
      result: "applied" as const,
    };
    const vw = {
      id: "v1",
      patch: { status: "Done" as const },
      expectStatus: "InProgress" as const,
      expectAssignedTechId: "tech-a",
      action,
    };
    const { store, sent } = fake(() => ({ status: 200, json: {} }));
    await store.updateJob("mv", { status: "Scheduled" }, { status: "InProgress" }, vw);
    const items = sent[0]!.body!.TransactItems as Record<string, Record<string, unknown>>[];
    assert.equal(items.length, 3);
    assert.equal(items[2]!.Put!.TableName, "TechAction-t");
    assert.equal(items[2]!.Put!.ConditionExpression, "attribute_not_exists(id)");
    assert.deepEqual((items[2]!.Put!.Item as Record<string, unknown>).id, { S: "act-1" });
    // Only the marker exists: a repeat of this exact action, nothing more to do.
    await fake(cancelled(["None", "None", "ConditionalCheckFailed"])).store.updateJob(
      "mv",
      { status: "Scheduled" },
      { status: "InProgress" },
      vw,
    );
    // The job or visit changed: JobChanged, whatever the marker.
    await assert.rejects(
      fake(cancelled(["ConditionalCheckFailed", "None", "ConditionalCheckFailed"])).store.updateJob(
        "mv",
        { status: "Scheduled" },
        { status: "InProgress" },
        vw,
      ),
      JobChanged,
    );
  });
  it("job updates touch only the given fields and require the job to exist", async () => {
    const { store, sent } = fake(() => ({ status: 200, json: {} }));
    await store.updateJob(
      "j1",
      { status: "EnRoute", techStatusAt: NOW.toISOString() },
      { assignedTechId: "tech-a", status: "Scheduled", techStatusAt: null },
    );
    const b = sent[0]!.body!;
    assert.equal(
      b.ConditionExpression,
      "attribute_exists(id) AND #e0 = :e0 AND #e1 = :e1 AND (attribute_not_exists(#e2) OR attribute_type(#e2, :nullType))",
    );
    const names = b.ExpressionAttributeNames as Record<string, string>;
    assert.deepEqual(
      [names["#e0"], names["#e1"], names["#e2"]],
      ["assignedTechId", "status", "techStatusAt"],
    );
  });
  it("a failed condition means the job changed (nothing saved)", async () => {
    const { store } = fake(() => ({
      status: 400,
      json: { __type: "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException" },
    }));
    await assert.rejects(
      store.updateJob("j1", { status: "EnRoute" }, { status: "Scheduled" }),
      JobChanged,
    );
  });
  it("files go to the jobs/ prefix with a signed PUT", async () => {
    const { store, sent } = fake(() => ({ status: 200, json: {} }));
    await store.putFile("jobs/j1/tech-photos/a-0.jpg", new Uint8Array([1, 2]), "image/jpeg");
    assert.equal(sent[0]!.method, "PUT");
    assert.equal(
      sent[0]!.url,
      "https://serv1-files.s3.us-east-1.amazonaws.com/jobs/j1/tech-photos/a-0.jpg",
    );
  });
});

describe("function URL handler", () => {
  const store = {
    getUser: async () => null,
    audit: async () => undefined,
  } as unknown as BridgeStore;
  const ev = (obj: unknown, base64 = true) => ({
    body: base64 ? Buffer.from(JSON.stringify(obj)).toString("base64") : JSON.stringify(obj),
    isBase64Encoded: base64,
    requestContext: {
      http: { method: "POST" },
      authorizer: { iam: { userArn: "arn:aws:sts::1:assumed-role/caller/s1" } },
    },
  });

  it("ships off: every call answers not_enabled", async () => {
    const lines: string[] = [];
    const r = await handleUrlEvent(ev({ serv1UserId: "u", route: "jobs" }), store, {}, NOW, (l) =>
      lines.push(l),
    );
    assert.equal(JSON.parse(r.body).code, "not_enabled");
    const m = JSON.parse(lines[0]!);
    assert.equal(m.Refused, 1);
    assert.equal(m._aws.CloudWatchMetrics[0].Namespace, "Serv1/Eci1Bridge");
    assert.ok(!lines[0]!.includes("body"), "never logs request bodies");
  });
  it("reads base64 bodies and refuses junk", async () => {
    const on = { ECI1_BRIDGE_ENABLED: "true" };
    const r = await handleUrlEvent(
      ev({ serv1UserId: "u", route: "jobs" }),
      store,
      on,
      NOW,
      () => undefined,
    );
    assert.equal(JSON.parse(r.body).code, "not_linked");
    const bad = await handleUrlEvent(
      { body: "{oops", isBase64Encoded: false },
      store,
      on,
      NOW,
      () => undefined,
    );
    assert.equal(JSON.parse(bad.body).code, "invalid");
    const get = await handleUrlEvent(
      { requestContext: { http: { method: "GET" } } },
      store,
      on,
      NOW,
      () => undefined,
    );
    assert.equal(get.statusCode, 405);
  });
  it("counts distinct techs per caller session over 10 minutes", () => {
    const t = NOW.getTime();
    assert.equal(techsForSession("sess-x", "a", t), 1);
    assert.equal(techsForSession("sess-x", "b", t + 1000), 2);
    assert.equal(techsForSession("sess-x", "a", t + 2000), 2);
    assert.equal(techsForSession("sess-x", "c", t + 700_000), 1);
  });
});
