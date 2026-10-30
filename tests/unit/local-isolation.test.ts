/**
 * Proves the local demo backend enforces technician isolation on every
 * operation, not just on reads (Codex review of PR #1). Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// Minimal localStorage for Node.
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

const as = async (b: ReturnType<typeof createLocalBackend>, email: string) => {
  const r = await b.auth.signIn(email, "serv1demo");
  assert.equal(r.kind, "done");
};

describe("local backend: technician isolation", () => {
  let b: ReturnType<typeof createLocalBackend>;
  beforeEach(() => {
    mem.clear();
    b = createLocalBackend();
    setBackend(b);
  });

  it("a tech lists only their own jobs", async () => {
    await as(b, "tech1@serv1.demo");
    const jobs = await b.jobs.list();
    assert.ok(jobs.length > 0);
    assert.ok(jobs.every((j) => j.assignedTechId === "local-tech-1"));
    assert.equal(await b.jobs.get("job-3"), null); // tech2's job
  });

  it("a tech cannot update or delete another tech's job", async () => {
    await as(b, "tech1@serv1.demo");
    await assert.rejects(b.jobs.update("job-3", { notes: "hijacked" }), NotAllowedError);
    await assert.rejects(b.jobs.remove("job-3"), NotAllowedError);
    await as(b, "office@serv1.demo");
    const job3 = await b.jobs.get("job-3");
    assert.equal(job3?.notes, "Materials on truck.");
  });

  it("a tech can update their own job but not reassign it or delete it", async () => {
    await as(b, "tech1@serv1.demo");
    const updated = await b.jobs.update("job-2", { status: "InProgress", notes: "On site" });
    assert.equal(updated.status, "InProgress");
    await assert.rejects(
      b.jobs.update("job-2", { assignedTechId: "local-tech-2" }),
      NotAllowedError,
    );
    await assert.rejects(b.jobs.remove("job-2"), NotAllowedError);
  });

  it("a tech cannot add an attachment or signature to a job that is not theirs", async () => {
    await as(b, "tech1@serv1.demo");
    await assert.rejects(
      b.attachments.create({
        jobId: "job-3",
        assignedTechId: "local-tech-1",
        storagePath: "x",
        type: "Photo",
        caption: null,
        uploadedBy: null,
      }),
      NotAllowedError,
    );
    await assert.rejects(
      b.signatures.create({
        jobId: "job-3",
        assignedTechId: "local-tech-2",
        signerName: "Forged",
        storagePath: "x",
        signedAt: new Date().toISOString(),
      }),
      NotAllowedError,
    );
    // Tagging a row with someone else's identity is refused too.
    await assert.rejects(
      b.attachments.create({
        jobId: "job-2",
        assignedTechId: "local-tech-2",
        storagePath: "x",
        type: "Photo",
        caption: null,
        uploadedBy: null,
      }),
      NotAllowedError,
    );
  });

  it("a tech sees only attachments on their own jobs", async () => {
    await as(b, "office@serv1.demo");
    await b.attachments.create({
      jobId: "job-3",
      assignedTechId: "local-tech-2",
      storagePath: "jobs/job-3/photos/a.jpg",
      type: "Photo",
      caption: "tech2 job",
      uploadedBy: "office",
    });
    await b.attachments.create({
      jobId: "job-2",
      assignedTechId: "local-tech-1",
      storagePath: "jobs/job-2/photos/b.jpg",
      type: "Photo",
      caption: "tech1 job",
      uploadedBy: "office",
    });
    await as(b, "tech1@serv1.demo");
    const mine = await b.attachments.list();
    assert.deepEqual(
      mine.map((a) => a.caption),
      ["tech1 job"],
    );
  });

  it("a tech cannot read or write files outside their own prefix", async () => {
    await as(b, "tech1@serv1.demo");
    await assert.rejects(b.files.getUrl("jobs/job-3/photos/a.jpg"), NotAllowedError);
    await assert.rejects(
      b.files.getUrl("tech-files/local-tech-2/job-3/photos/a.jpg"),
      NotAllowedError,
    );
    await assert.rejects(
      b.files.upload("jobs/job-2/photos/x.jpg", new Blob(["x"]), "image/jpeg"),
      NotAllowedError,
    );
  });

  it("attachments and signatures follow the job when the office reassigns it", async () => {
    await as(b, "office@serv1.demo");
    await b.attachments.create({
      jobId: "job-2",
      assignedTechId: "local-tech-1",
      storagePath: "jobs/job-2/photos/p.jpg",
      type: "Photo",
      caption: "before",
      uploadedBy: "office",
    });
    await b.signatures.create({
      jobId: "job-2",
      assignedTechId: "local-tech-1",
      signerName: "Customer",
      storagePath: "jobs/job-2/signatures/s.png",
      signedAt: new Date().toISOString(),
    });
    await b.jobs.update("job-2", { assignedTechId: "local-tech-2" });
    await as(b, "tech1@serv1.demo");
    assert.equal((await b.attachments.list()).length, 0);
    assert.equal((await b.signatures.list()).length, 0);
    await as(b, "tech2@serv1.demo");
    assert.deepEqual(
      (await b.attachments.list()).map((a) => a.caption),
      ["before"],
    );
    assert.equal((await b.signatures.list()).length, 1);
  });

  it("an owner may change an invoice's status but nothing else", async () => {
    await as(b, "office@serv1.demo");
    const inv = await b.invoices.create({
      invoiceNumber: "INV-TEST",
      jobId: "job-4",
      customerId: "cust-2",
      lineItems: [],
      total: 275,
      status: "Draft",
      pdfPath: null,
    });
    await as(b, "owner@serv1.demo");
    const paid = await b.invoices.update(inv.id, { status: "Paid" });
    assert.equal(paid.status, "Paid");
    await assert.rejects(b.invoices.update(inv.id, { total: 1 }), NotAllowedError);
    await assert.rejects(b.invoices.update(inv.id, { status: "Sent", total: 1 }), NotAllowedError);
    await assert.rejects(
      b.invoices.create({
        invoiceNumber: "INV-X",
        jobId: "job-4",
        customerId: "cust-2",
        lineItems: [],
        total: 1,
        status: "Draft",
        pdfPath: null,
      }),
      NotAllowedError,
    );
    await assert.rejects(b.invoices.remove(inv.id), NotAllowedError);
  });

  it("only office accounts and techs (own prefix) may upload; owners and signed-out callers may not", async () => {
    await assert.rejects(
      b.files.upload("jobs/job-1/photos/x.jpg", new Blob(["x"]), "image/jpeg"),
      NotAllowedError,
    );
    await as(b, "owner@serv1.demo");
    await assert.rejects(
      b.files.upload("jobs/job-1/photos/x.jpg", new Blob(["x"]), "image/jpeg"),
      NotAllowedError,
    );
    await assert.rejects(
      b.files.upload(
        "tech-files/local-tech-1/job-2/signatures/s.png",
        new Blob(["x"]),
        "image/png",
      ),
      NotAllowedError,
    );
    await as(b, "office@serv1.demo");
    assert.equal(
      await b.files.upload("jobs/job-1/photos/x.jpg", new Blob(["x"]), "image/jpeg"),
      "jobs/job-1/photos/x.jpg",
    );
    await as(b, "tech1@serv1.demo");
    assert.equal(
      await b.files.upload(
        "tech-files/local-tech-1/job-2/photos/p.jpg",
        new Blob(["x"]),
        "image/jpeg",
      ),
      "tech-files/local-tech-1/job-2/photos/p.jpg",
    );
  });

  it("two tabs never overwrite each other's changes", async () => {
    // Two backends over the same storage stand in for two browser tabs.
    const tabA = createLocalBackend();
    const tabB = createLocalBackend();
    await as(tabA, "office@serv1.demo"); // session is shared storage, like two tabs of one browser
    await tabA.jobs.update("job-2", { notes: "from tab A" });
    await tabB.jobs.update("job-3", { notes: "from tab B" });
    const fresh = createLocalBackend();
    assert.equal((await fresh.jobs.get("job-2"))?.notes, "from tab A");
    assert.equal((await fresh.jobs.get("job-3"))?.notes, "from tab B");
    assert.equal((await tabA.jobs.get("job-3"))?.notes, "from tab B");
  });

  it("owners read everything but cannot change jobs; office can", async () => {
    await as(b, "owner@serv1.demo");
    assert.ok((await b.jobs.list()).length >= 6);
    await assert.rejects(b.jobs.update("job-1", { notes: "owner edit" }), NotAllowedError);
    await as(b, "office@serv1.demo");
    const j = await b.jobs.update("job-1", { notes: "office edit" });
    assert.equal(j.notes, "office edit");
  });
});
