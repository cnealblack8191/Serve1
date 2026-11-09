/**
 * Multi-visit jobs (docs/VISITS.md) on the local demo backend: old jobs read as one visit, the
 * job follows its current visit, and only the right people can see or change each visit.
 * Run: npm run test:unit
 */
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
const { setBackend } = await import("../../src/data/backend.ts");
const v = await import("../../src/data/visits.ts");
const { movePatch, techMayMove } = await import("../../src/data/jobflow.ts");

type B = ReturnType<typeof createLocalBackend>;
const as = async (b: B, email: string) => {
  await b.auth.signOut();
  const r = await b.auth.signIn(email, "serv1demo");
  assert.equal(r.kind, "done");
};
const OFFICE = "office@serv1.demo";
const TARA = "tech1@serv1.demo"; // local-tech-1
const TOM = "tech2@serv1.demo"; // local-tech-2
const TESS = "tech3@serv1.demo"; // local-tech-3

describe("multi-visit jobs", () => {
  let b: B;
  beforeEach(() => {
    mem.clear();
    b = createLocalBackend();
    setBackend(b);
  });

  it("an older job with no visits reads as one visit built from its own schedule", async () => {
    await as(b, OFFICE);
    const job = (await b.jobs.list()).find((j) => j.id !== "job-20" && j.scheduledStart)!;
    const { visits, implied } = v.visitsOf(job, await b.visits.list());
    assert.equal(implied, true);
    assert.equal(visits.length, 1);
    assert.equal(visits[0]!.scheduledStart, job.scheduledStart);
    assert.equal(visits[0]!.assignedTechId, job.assignedTechId);
    assert.equal(v.visitStatusOf({ status: "Paid", holdReason: null }), "Done");
    assert.equal(v.visitStatusOf({ status: "OnHold", holdReason: v.RETURN_NEEDED }), "Done");
  });

  it("the board shows each visit of a multi-visit job on its own tech and time", async () => {
    await as(b, OFFICE);
    const entries = v
      .visitEntries(await b.jobs.list(), await b.visits.list())
      .filter((e) => e.id === "job-20");
    assert.deepEqual(
      entries.map((e) => [e.visit.number, e.assignedTechId, e.status]),
      [
        [1, "local-tech-1", "Complete"],
        [2, "local-tech-2", "Scheduled"],
        [3, "local-tech-1", "Scheduled"],
      ],
    );
    assert.equal(new Set(entries.map((e) => e.entryId)).size, 3);
    assert.equal(v.visitLabel(entries[1]!), "Visit 2 of 3");
  });

  it("every tech on the job reads it and all its visits; a tech not on it reads nothing", async () => {
    await as(b, TOM);
    assert.ok(await b.jobs.get("job-20"));
    assert.equal((await b.visits.list()).filter((x) => x.jobId === "job-20").length, 3);
    await as(b, TESS);
    assert.equal(await b.jobs.get("job-20"), null);
    assert.equal((await b.visits.list()).filter((x) => x.jobId === "job-20").length, 0);
  });

  it("a tech moves only their own visit, and never its plan", async () => {
    await as(b, TARA);
    // Visit 2 is Tom's.
    await assert.rejects(b.visits.update("visit-20-2", { status: "EnRoute" }));
    // Visit 3 is Tara's, but its time and tech are the office's.
    await assert.rejects(
      b.visits.update("visit-20-3", { scheduledStart: new Date().toISOString() }),
    );
    await assert.rejects(b.visits.update("visit-20-3", { assignedTechId: "local-tech-1" }));
    await b.visits.update("visit-20-3", { note: "Bring the bucket truck" });
  });

  it("visit by visit: start, Visit done (return needed), next tech, then Job complete", async () => {
    await as(b, TOM);
    let job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));
    assert.equal(job.status, "InProgress");
    assert.equal((await b.visits.get("visit-20-2"))!.status, "InProgress");

    // Not the last open visit: Tom ends his visit, the job waits for visit 3.
    let visits = v.liveVisitRows("job-20", await b.visits.list());
    assert.equal(v.isLastOpenVisit(visits, v.currentVisit(visits)!), false);
    job = await v.finishVisit(job, "Heads on poles 1 to 4");
    assert.equal(job.status, "Scheduled");
    const done = (await b.visits.get("visit-20-2"))!;
    assert.equal(done.status, "Done");
    assert.equal(done.note, "Heads on poles 1 to 4");

    // Tara does the last visit and completes the job (the signature step's update).
    await as(b, TARA);
    job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));
    visits = v.liveVisitRows("job-20", await b.visits.list());
    assert.equal(v.currentVisit(visits)!.id, "visit-20-3");
    assert.equal(v.isLastOpenVisit(visits, v.currentVisit(visits)!), true);
    job = await v.updateJobWithVisit(job, {
      status: "Complete",
      completedAt: new Date().toISOString(),
    });
    assert.equal(job.status, "Complete");
    assert.equal((await b.visits.get("visit-20-3"))!.status, "Done");
  });

  it("ending the last visit with a return needed holds the job; a new visit reschedules it", async () => {
    await as(b, OFFICE);
    const legacy = (await b.jobs.list()).find(
      (j) => j.status === "Scheduled" && j.assignedTechId === "local-tech-1" && !j.visitTechIds,
    )!;
    await as(b, TARA);
    let job = await v.updateJobWithVisit(legacy, movePatch(legacy, "start"));
    job = await v.finishVisit(job, "Need a part");
    assert.equal(job.status, "OnHold");
    assert.equal(job.holdReason, v.RETURN_NEEDED);
    assert.equal(job.holdNote, "Need a part");
    assert.ok(v.isReturnHold(job));

    // The office plans visit 2 for Tom: visit 1 is written from the job and shows as done.
    await as(b, OFFICE);
    const start = new Date(Date.now() + 2 * 86_400_000);
    await v.addVisit(job, { assignedTechId: "local-tech-2", start, minutes: 90 });
    job = (await b.jobs.get(legacy.id))!;
    const rows = v.liveVisitRows(legacy.id, await b.visits.list());
    assert.deepEqual(
      rows.map((r) => [r.number, r.assignedTechId, r.status]),
      [
        [1, "local-tech-1", "Done"],
        [2, "local-tech-2", "Scheduled"],
      ],
    );
    assert.equal(job.status, "Scheduled");
    assert.equal(job.holdReason, null);
    assert.equal(job.assignedTechId, "local-tech-2");
    assert.equal(job.scheduledStart, start.toISOString());
    assert.deepEqual([...job.visitTechIds!].sort(), ["local-tech-1", "local-tech-2"]);
    assert.ok(rows.every((r) => (r.jobTechIds ?? []).length === 2));
  });

  it("techs on the job read each other's photos and notes; others do not", async () => {
    await as(b, TARA);
    const job = (await b.jobs.get("job-20"))!;
    await b.attachments.create({
      jobId: "job-20",
      assignedTechId: "local-tech-1",
      jobTechIds: job.visitTechIds ?? null,
      storagePath: "tech-files/local-tech-1/job-20/a.jpg",
      type: "Photo",
      caption: null,
      uploadedBy: "Tara Tech",
    });
    await as(b, TOM);
    assert.equal((await b.attachments.list()).filter((a) => a.jobId === "job-20").length, 1);
    await as(b, TESS);
    assert.equal((await b.attachments.list()).filter((a) => a.jobId === "job-20").length, 0);
  });

  it("office: removing or moving needs a visit that has not started; cancel stops open visits", async () => {
    await as(b, OFFICE);
    const visits = await b.visits.list();
    const done = visits.find((x) => x.id === "visit-20-1")!;
    await assert.rejects(v.removeVisit(done), /has not started/);
    await v.removeVisit(visits.find((x) => x.id === "visit-20-3")!);
    assert.equal((await b.visits.get("visit-20-3"))!.status, "Cancelled");
    // Tara's only open visit is gone; Tom (visit 2) stays on the job.
    const job = (await b.jobs.get("job-20"))!;
    assert.deepEqual([...job.visitTechIds!].sort(), ["local-tech-1", "local-tech-2"]);
    await v.updateJobWithVisit(job, movePatch(job, "cancel", "Customer postponed"));
    assert.equal((await b.visits.get("visit-20-2"))!.status, "Cancelled");
    assert.equal((await b.visits.get("visit-20-1"))!.status, "Done");
  });

  it("a tech may end a visit (back to Scheduled) only from work under way", () => {
    assert.equal(techMayMove("InProgress", "Scheduled"), true);
    assert.equal(techMayMove("OnHold", "Scheduled"), true);
    assert.equal(techMayMove("Complete", "Scheduled"), false);
    assert.equal(techMayMove("Cancelled", "Scheduled"), false);
  });
});
