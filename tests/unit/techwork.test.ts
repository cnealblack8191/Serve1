/** officeChangedAt moves only on the office's own changes; tech rows stay on the tech's jobs. */
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

const { createLocalBackend } = await import("../../src/data/local/index.ts");

describe("office changes and tech rows", () => {
  let b: ReturnType<typeof createLocalBackend>;
  beforeEach(() => {
    mem.clear();
    b = createLocalBackend();
  });

  it("office edits stamp officeChangedAt; the tech's own changes do not", async () => {
    await b.auth.signIn("office@serv1.demo", "serv1demo");
    const j = (await b.jobs.list()).find((x) => x.status === "Scheduled" && x.assignedTechId)!;
    const after = await b.jobs.update(j.id, { notes: "Bring the ladder" });
    assert.ok(after.officeChangedAt);
    const tech = (await b.users.list()).find((u) => u.identityId === j.assignedTechId)!;
    await b.auth.signIn(tech.email, "serv1demo");
    const moved = await b.jobs.update(j.id, { status: "EnRoute" });
    assert.equal(moved.officeChangedAt, after.officeChangedAt);
  });

  it("a tech reads receipts and notes only on their own jobs; office reviews", async () => {
    await b.auth.signIn("tech1@serv1.demo", "serv1demo");
    assert.equal((await b.techReceipts.list()).length, 0);
    await assert.rejects(b.techReceipts.update("trcpt-1", { reviewStatus: "Approved" }));
    await b.auth.signIn("office@serv1.demo", "serv1demo");
    const r = await b.techReceipts.update("trcpt-1", { reviewStatus: "Approved" });
    assert.equal(r.reviewStatus, "Approved");
    assert.equal((await b.techNotes.list()).length, 1);
  });

  it("tech notes and receipts follow the job when the office reassigns it", async () => {
    await b.auth.signIn("office@serv1.demo", "serv1demo");
    await b.jobs.update("job-7", { assignedTechId: "local-tech-1" });
    assert.ok((await b.techReceipts.list()).every((r) => r.assignedTechId === "local-tech-1"));
    assert.ok((await b.techNotes.list()).every((n) => n.assignedTechId === "local-tech-1"));
    await b.auth.signIn("tech3@serv1.demo", "serv1demo");
    assert.equal((await b.techReceipts.list()).length, 0, "former tech loses access");
    await b.auth.signIn("tech1@serv1.demo", "serv1demo");
    assert.equal((await b.techReceipts.list()).length, 1, "new tech gains it");
  });
});
