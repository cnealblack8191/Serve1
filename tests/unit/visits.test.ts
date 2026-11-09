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
const { findOverlaps } = await import("../../src/data/dispatch.ts");

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

    // Tara cannot change the job before the office hands it over (only the office reassigns).
    await as(b, TARA);
    job = (await b.jobs.get("job-20"))!;
    await assert.rejects(v.updateJobWithVisit(job, movePatch(job, "start")));
    await as(b, OFFICE);
    assert.deepEqual(
      v.handoversDue(await b.jobs.list(), await b.visits.list()).map((j) => j.id),
      ["job-20"],
    );
    await v.syncJobWithVisits("job-20");
    assert.equal((await b.jobs.get("job-20"))!.assignedTechId, "local-tech-1");

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

  it("a Visit done whose job update failed is finished on retry, never the next visit", async () => {
    // Visits 2 and 3 both Tom's, back to back (Codex review of PR #21).
    await as(b, OFFICE);
    const v3 = (await b.visits.get("visit-20-3"))!;
    await v.rescheduleVisit(v3, {
      assignedTechId: "local-tech-2",
      start: new Date(v3.scheduledStart!),
      minutes: 60,
    });
    await as(b, TOM);
    let job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));

    // The visit is saved, then the job update fails.
    const realUpdate = b.jobs.update;
    b.jobs.update = async () => {
      throw new Error("network");
    };
    await assert.rejects(v.finishVisit(job, "Poles 1 to 4", "visit-20-2"));
    b.jobs.update = realUpdate;
    assert.equal((await b.visits.get("visit-20-2"))!.status, "Done");
    job = (await b.jobs.get("job-20"))!;
    assert.equal(job.status, "InProgress");

    // Retry naming the same visit: only the job is finished; visit 3 is untouched.
    job = await v.finishVisit(job, "Poles 1 to 4", "visit-20-2");
    assert.equal(job.status, "Scheduled");
    assert.equal((await b.visits.get("visit-20-3"))!.status, "Scheduled");
  });

  it("every office visit change writes the job, so a completion in flight notices it", async () => {
    await as(b, OFFICE);
    const job = (await b.jobs.get("job-20"))!;
    const realUpdate = b.jobs.update;
    const writes: string[] = [];
    b.jobs.update = async (id, patch) => {
      writes.push(id);
      return realUpdate(id, patch);
    };
    // Visit 4 for Tara, who already has visits: the job's tech list does not change.
    await v.addVisit(job, {
      assignedTechId: "local-tech-1",
      start: new Date(Date.now() + 9 * 86_400_000),
      minutes: 60,
    });
    b.jobs.update = realUpdate;
    assert.ok(writes.includes("job-20"));
  });

  it("Job complete is refused while another visit is planned, even if the screen said last", async () => {
    await as(b, TOM);
    let job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));
    // Visit 3 is still planned (the office may have added it after the screen loaded).
    await assert.rejects(
      v.updateJobWithVisit(job, { status: "Complete", completedAt: new Date().toISOString() }),
      /Another visit of this job is planned/,
    );
    assert.equal((await b.visits.get("visit-20-2"))!.status, "InProgress");
    assert.equal((await b.jobs.get("job-20"))!.status, "InProgress");
  });

  it("a completion whose job save failed stays on the tech's screen and can be retried", async () => {
    await as(b, OFFICE);
    await v.removeVisit((await b.visits.get("visit-20-3"))!);
    await as(b, TOM);
    let job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));
    const realUpdate = b.jobs.update;
    b.jobs.update = async () => {
      throw new Error("network");
    };
    const done = { status: "Complete" as const, completedAt: new Date().toISOString() };
    await assert.rejects(v.updateJobWithVisit(job, done));
    b.jobs.update = realUpdate;
    job = (await b.jobs.get("job-20"))!;
    const rows = v.liveVisitRows("job-20", await b.visits.list());
    // Every visit is finished, but the job is still In Progress: the screen keeps visit 2.
    assert.equal(v.currentVisit(rows) ?? null, null);
    assert.equal(v.actingVisit(job, rows)?.id, "visit-20-2");
    assert.equal(v.isLastOpenVisit(rows, v.actingVisit(job, rows)!), true);
    job = await v.updateJobWithVisit(job, done);
    assert.equal(job.status, "Complete");
    // Once complete, nothing is left to act on.
    assert.equal(v.actingVisit(job, v.liveVisitRows("job-20", await b.visits.list())), null);
  });

  it("a lost Visit done is repaired, not repeated, when the screen has moved on", async () => {
    await as(b, OFFICE);
    const v3 = (await b.visits.get("visit-20-3"))!;
    await v.rescheduleVisit(v3, {
      assignedTechId: "local-tech-2",
      start: new Date(v3.scheduledStart!),
      minutes: 60,
    });
    await as(b, TOM);
    let job = (await b.jobs.get("job-20"))!;
    job = await v.updateJobWithVisit(job, movePatch(job, "start"));
    const realUpdate = b.jobs.update;
    b.jobs.update = async () => {
      throw new Error("network");
    };
    await assert.rejects(v.finishVisit(job, null, "visit-20-2"));
    b.jobs.update = realUpdate;
    job = (await b.jobs.get("job-20"))!;

    // Reloaded, the screen's current visit is visit 3, not started, while the job is In Progress.
    await assert.rejects(
      v.updateJobWithVisit(job, { status: "Complete", completedAt: new Date().toISOString() }),
    );
    job = await v.finishVisit(job, null, "visit-20-3");
    assert.equal(job.status, "Scheduled");
    assert.equal((await b.visits.get("visit-20-3"))!.status, "Scheduled");
    // The office handover repairs it the same way.
    await as(b, OFFICE);
    await b.jobs.update("job-20", { status: "InProgress" });
    await v.syncJobWithVisits("job-20");
    assert.equal((await b.jobs.get("job-20"))!.status, "Scheduled");
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

  it("removing the last open visit holds the job for a return visit (Codex review of PR #21)", async () => {
    await as(b, OFFICE);
    const visits = await b.visits.list();
    await v.removeVisit(visits.find((x) => x.id === "visit-20-3")!);
    await v.removeVisit((await b.visits.list()).find((x) => x.id === "visit-20-2")!);
    const job = (await b.jobs.get("job-20"))!;
    assert.equal(job.status, "OnHold");
    assert.equal(job.holdReason, v.RETURN_NEEDED);
  });

  it("moving a multi-visit job to the next tech keeps each receipt with its own tech", async () => {
    await as(b, OFFICE);
    const r = await b.techReceipts.create({
      jobId: "job-20",
      assignedTechId: "local-tech-2",
      kind: "materials",
      vendor: null,
      date: null,
      amount: 12,
      paidWith: "personal",
      note: null,
      storagePath: null,
      at: new Date().toISOString(),
      actionId: null,
      reviewStatus: "Pending",
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
    });
    // Tom's visit 2 goes: the job's current visit becomes Tara's visit 3.
    await v.removeVisit((await b.visits.list()).find((x) => x.id === "visit-20-2")!);
    assert.equal((await b.jobs.get("job-20"))!.assignedTechId, "local-tech-1");
    assert.equal((await b.techReceipts.get(r.id))!.assignedTechId, "local-tech-2");
  });

  it("a reopened multi-visit job is scheduled with a new visit (Codex review of PR #21)", async () => {
    await as(b, OFFICE);
    let job = (await b.jobs.get("job-20"))!;
    assert.equal(v.scheduleMode(job, await b.visits.list()), "reschedule");
    job = await v.updateJobWithVisit(job, movePatch(job, "cancel", "Postponed"));
    job = await v.updateJobWithVisit(job, movePatch(job, "reopen"));
    assert.equal(v.scheduleMode(job, await b.visits.list()), "add");
    const legacy = (await b.jobs.list()).find((j) => j.id !== "job-20" && !j.visitTechIds)!;
    assert.equal(v.scheduleMode(legacy, await b.visits.list()), "job");
    await v.addVisit(job, {
      assignedTechId: "local-tech-3",
      start: new Date(Date.now() + 86_400_000),
      minutes: 60,
    });
    const rows = v.liveVisitRows("job-20", await b.visits.list());
    assert.equal(v.currentVisit(rows)!.assignedTechId, "local-tech-3");
    assert.equal((await b.jobs.get("job-20"))!.status, "Scheduled");
  });

  it("a job's other visit with the same tech still counts as a double booking", async () => {
    await as(b, OFFICE);
    const entries = v.visitEntries(await b.jobs.list(), await b.visits.list());
    const v3 = entries.find((e) => e.visit.id === "visit-20-3")!;
    const v1 = entries.find((e) => e.visit.id === "visit-20-1")!;
    // Move visit 3 (Tara) onto visit 1's time (also Tara): visit 1 is the clash.
    const start = new Date(v1.scheduledStart!);
    const clashes = findOverlaps(
      entries.map((e) => ({ ...e, status: e.status === "Complete" ? "Scheduled" : e.status })),
      v3.entryId,
      "local-tech-1",
      start,
      new Date(start.getTime() + 3_600_000),
    );
    assert.deepEqual(
      clashes.map((c) => (c as typeof v1).entryId),
      [v1.entryId],
    );
  });

  it("a tech with a visit on the job only reads it while another tech's visit is current", async () => {
    // Codex review of PR #21: shared access is read-only on the server, not only in the screens.
    await as(b, TARA);
    assert.ok(await b.jobs.get("job-20"));
    await assert.rejects(b.jobs.update("job-20", { status: "InProgress" }));
    await assert.rejects(b.jobs.update("job-20", { notes: "not mine to write" }));
    await as(b, TOM);
    await b.jobs.update("job-20", { notes: "Tom's visit: heads delivered" });
  });

  it("removing a job's only visit sends the job back to Unscheduled", async () => {
    await as(b, OFFICE);
    const legacy = (await b.jobs.list()).find(
      (j) => j.status === "Scheduled" && j.assignedTechId && !j.visitTechIds,
    )!;
    const added = await v.addVisit(legacy, {
      assignedTechId: legacy.assignedTechId!,
      start: new Date(Date.now() + 3 * 86_400_000),
      minutes: 60,
    });
    await v.removeVisit(added);
    const only = v.liveVisitRows(legacy.id, await b.visits.list());
    assert.equal(only.length, 1);
    await v.removeVisit(only[0]!);
    const job = (await b.jobs.get(legacy.id))!;
    assert.equal(job.status, "New");
    assert.equal(job.assignedTechId, null);
    assert.equal(job.scheduledStart, null);
    assert.equal(v.visitsOf(job, await b.visits.list()).implied, true);
  });
});
