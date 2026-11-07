/** Double booking and the dispatcher's attention queue. Run: npm run test:unit */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dispatchAttention, findOverlaps } from "../../src/data/dispatch.ts";
import { JOB_TRACKING_DEFAULTS, type Job } from "../../src/data/types.ts";

const job = (j: Partial<Job>): Job => ({
  ...JOB_TRACKING_DEFAULTS,
  id: "x",
  jobNumber: null,
  customerId: "c",
  siteId: null,
  description: "",
  jobType: null,
  priority: "Normal",
  status: "Scheduled",
  assignedTechId: "t1",
  scheduledStart: null,
  scheduledEnd: null,
  startedAt: null,
  completedAt: null,
  notes: null,
  laborHours: null,
  createdAt: "",
  updatedAt: "",
  ...j,
});
const at = (h: number) => new Date(2026, 10, 9, h);

describe("findOverlaps", () => {
  const jobs = [
    job({ id: "a", scheduledStart: at(9).toISOString(), scheduledEnd: at(11).toISOString() }),
    job({
      id: "b",
      scheduledStart: at(13).toISOString(),
      scheduledEnd: at(14).toISOString(),
      status: "Cancelled",
    }),
    job({
      id: "c",
      assignedTechId: "t2",
      scheduledStart: at(9).toISOString(),
      scheduledEnd: at(11).toISOString(),
    }),
  ];
  it("finds a clash with the same tech only", () => {
    assert.deepEqual(
      findOverlaps(jobs, "new", "t1", at(10), at(12)).map((j) => j.id),
      ["a"],
    );
  });
  it("touching ends do not clash; cancelled jobs free their time; the job itself is ignored", () => {
    assert.equal(findOverlaps(jobs, "new", "t1", at(11), at(12)).length, 0);
    assert.equal(findOverlaps(jobs, "new", "t1", at(13), at(14)).length, 0);
    assert.equal(findOverlaps(jobs, "a", "t1", at(9), at(11)).length, 0);
  });
});

describe("dispatchAttention", () => {
  const now = at(12);
  const items = dispatchAttention(
    [
      job({ id: "late", scheduledStart: at(9).toISOString() }),
      job({ id: "soon", scheduledStart: at(13).toISOString() }),
      job({ id: "hold", status: "OnHold", holdReason: "Part" }),
      job({ id: "back", status: "InProgress", reviewNote: "Photo" }),
      job({ id: "urgent", status: "New", assignedTechId: null, priority: "Emergency" }),
      job({ id: "normal", status: "New", assignedTechId: null }),
      job({ id: "review", status: "Complete" }),
    ],
    now,
  );
  it("lists stuck work, most pressing first", () => {
    assert.deepEqual(
      items.map((i) => [i.job.id, i.reason]),
      [
        ["late", "late"],
        ["urgent", "urgentUnassigned"],
        ["hold", "onHold"],
        ["back", "sentBack"],
        ["review", "toReview"],
      ],
    );
  });
});
