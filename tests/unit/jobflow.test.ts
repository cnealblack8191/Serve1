/** Job status moves and who may make them. Run: npm run test:unit */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { createLocalBackend, NotAllowedError } = await import("../../src/data/local/index.ts");
const { setBackend } = await import("../../src/data/backend.ts");
const { canMove, movePatch } = await import("../../src/data/jobflow.ts");
const { setInvoiceStatus } = await import("../../src/data/billing.ts");

type B = ReturnType<typeof createLocalBackend>;
const as = async (b: B, email: string) =>
  assert.equal((await b.auth.signIn(email, "serv1demo")).kind, "done");

describe("job flow", () => {
  let b: B;
  beforeEach(() => {
    mem.clear();
    b = createLocalBackend();
    setBackend(b);
  });

  it("tech: scheduled -> en route -> in progress -> on hold -> in progress", async () => {
    await as(b, "tech1@serv1.demo");
    let j = (await b.jobs.get("job-2"))!;
    assert.equal(canMove(j, "enRoute", "Tech"), true);
    assert.equal(canMove(j, "approve", "Tech"), false);
    j = await b.jobs.update(j.id, movePatch(j, "enRoute"));
    assert.equal(j.status, "EnRoute");
    j = await b.jobs.update(j.id, movePatch(j, "start"));
    assert.equal(j.status, "InProgress");
    assert.ok(j.startedAt);
    assert.throws(() => movePatch(j, "hold", "  "), /reason/);
    j = await b.jobs.update(j.id, movePatch(j, "hold", "Waiting on a breaker"));
    assert.equal(j.status, "OnHold");
    assert.equal(j.holdReason, "Waiting on a breaker");
    j = await b.jobs.update(j.id, movePatch(j, "resume"));
    assert.equal(j.holdReason, null);
  });

  it("a tech cannot approve, cancel, mark paid or move the schedule", async () => {
    await as(b, "tech1@serv1.demo");
    await assert.rejects(b.jobs.update("job-4", { status: "Reviewed" }), NotAllowedError);
    await assert.rejects(b.jobs.update("job-2", { status: "Cancelled" }), NotAllowedError);
    await assert.rejects(b.jobs.update("job-4", { status: "Paid" }), NotAllowedError);
    await assert.rejects(
      b.jobs.update("job-2", { scheduledStart: new Date().toISOString() }),
      NotAllowedError,
    );
  });

  it("office: approve, send back with a note, cancel and reopen", async () => {
    await as(b, "office@serv1.demo");
    let j = (await b.jobs.get("job-4"))!; // Complete
    assert.equal(canMove(j, "approve", "Office"), true);
    assert.equal(canMove(j, "approve", "Owner"), false);
    j = await b.jobs.update(j.id, movePatch(j, "approve"));
    assert.equal(j.status, "Reviewed");
    assert.ok(j.reviewedAt);
    j = await b.jobs.update(j.id, movePatch(j, "sendBack", "Missing panel photo"));
    assert.equal(j.status, "InProgress");
    assert.equal(j.reviewNote, "Missing panel photo");
    assert.equal(j.completedAt, null);
    j = await b.jobs.update(j.id, movePatch(j, "cancel", "Customer cancelled"));
    assert.equal(j.status, "Cancelled");
    assert.equal(canMove(j, "cancel", "Office"), false);
    j = await b.jobs.update(j.id, movePatch(j, "reopen"));
    assert.equal(j.status, "New");
    assert.equal(j.assignedTechId, null);
  });

  it("paying the invoice marks the job paid", async () => {
    await as(b, "office@serv1.demo");
    const inv = (await b.invoices.list()).find((i) => i.jobId === "job-19")!; // Sent
    await setInvoiceStatus(inv, "Paid");
    assert.equal((await b.jobs.get("job-19"))?.status, "Paid");
  });
});
