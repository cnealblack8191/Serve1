/** Business Services dashboard counts. Run: npm run test:unit */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { businessStats } from "../../src/components/serv1/sales/businessStats.ts";
import { emptyOpportunity } from "../../src/data/opportunities.ts";
import { JOB_TRACKING_DEFAULTS, type Job, type Opportunity } from "../../src/data/types.ts";

const now = new Date(2026, 10, 7, 12);
let n = 0;
const opp = (o: Partial<Opportunity>): Opportunity => ({
  ...emptyOpportunity(),
  id: `o${++n}`,
  name: `Opp ${n}`,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...o,
});
const job = (j: Partial<Job>): Job => ({
  ...JOB_TRACKING_DEFAULTS,
  id: `j${++n}`,
  jobNumber: null,
  customerId: "c",
  siteId: null,
  description: "",
  jobType: null,
  priority: "Normal",
  status: "New",
  assignedTechId: null,
  scheduledStart: null,
  scheduledEnd: null,
  startedAt: null,
  completedAt: null,
  notes: null,
  laborHours: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...j,
});

describe("businessStats", () => {
  const opps = [
    opp({
      stage: "Prospect",
      type: "HighVoltage",
      customerContract: "DeKalbGov",
      salesRep: "A",
      nextStep: "x",
    }),
    opp({
      stage: "Assessment",
      type: "LowVoltage",
      customerContract: "NonContract",
      salesRep: "A",
    }),
    opp({
      stage: "Assessment",
      type: "Service",
      siteVisitDate: "2026-11-10",
      salesRep: "B",
      nextStep: "y",
    }),
    opp({
      stage: "ProposalSent",
      type: "Service",
      expectedClose: "2026-11-01",
      salesRep: "B",
      nextStep: "z",
    }),
    opp({
      stage: "CustomerReview",
      type: "HighVoltage",
      customerContract: "GwinnettSchools",
      nextStep: "z",
    }),
    opp({
      stage: "ClosedWon",
      type: "HighVoltage",
      customerContract: "DeKalbGov",
      closedAt: "2026-05-01T00:00:00.000Z",
    }),
    opp({ stage: "ClosedWon", type: "LowVoltage", closedAt: "2026-06-01T00:00:00.000Z" }),
    opp({ stage: "ClosedWon", type: "LowVoltage", closedAt: "2025-06-01T00:00:00.000Z" }), // last year
    opp({ stage: "ClosedLost", type: "Service", closedAt: "2026-07-01T00:00:00.000Z" }),
    opp({ stage: "NoBid", type: "Service", closedAt: "2026-08-01T00:00:00.000Z" }),
  ];
  const jobs = [
    job({ workType: "HighVoltage", status: "InProgress", health: "OnTrack" }),
    job({ workType: "HighVoltage", status: "Scheduled", health: "Behind", endDate: "2026-11-01" }),
    job({ workType: "LowVoltage", status: "New" }),
    job({ workType: "Service", status: "Complete" }),
    job({ workType: "Service", status: "Invoiced", completionPhotosOnFile: true }),
  ];
  const s = businessStats(opps, jobs, [], null, now);

  it("key numbers", () => {
    assert.equal(s.openOpportunities, 5);
    assert.equal(s.won, 2); // this year only
    assert.equal(s.lost, 1);
    assert.equal(s.noBid, 1);
    assert.equal(s.winRate, 2 / 3); // no-bid excluded
    assert.equal(s.jobsInProgress, 3);
    assert.equal(s.quotesWithCustomer, 2);
    assert.equal(s.siteVisitsToSchedule, 1);
    assert.equal(s.pastExpectedClose, 1);
  });

  it("pipeline by stage covers stages 1 to 6 in order", () => {
    assert.deepEqual(
      s.byStage.map((b) => [b.label, b.count]),
      [
        ["Prospect", 1],
        ["Assessment", 2],
        ["ProposalBidding", 0],
        ["ProposalSent", 1],
        ["CustomerReview", 1],
        ["CustomerFollowUp", 0],
      ],
    );
  });

  it("non-contract work is split by type", () => {
    const labels = Object.fromEntries(s.byContract.map((b) => [b.label, b.count]));
    assert.equal(labels["DeKalb Gov."], 1);
    assert.equal(labels["Gwinnett Schools"], 1);
    assert.equal(labels["Low Voltage (other)"], 1);
    assert.equal(labels["Non-contract service"], 2);
  });

  it("work health per type, and needs-attention counts", () => {
    const hv = s.health.find((h) => h.type === "HighVoltage")!;
    assert.deepEqual(hv.counts, { OnTrack: 1, Watch: 0, Behind: 1, NotSet: 0 });
    const att = Object.fromEntries(
      [...s.oppAttention, ...s.jobAttention].map((a) => [a.kind, a.count]),
    );
    assert.equal(att["noNextStep"], 1);
    assert.equal(att["pastClose"], 1);
    assert.equal(att["pastEndDate"], 1);
    assert.equal(att["noPhotos"], 1); // the Complete job; the invoiced one has photos on file
  });

  it("the type filter narrows everything", () => {
    const hv = businessStats(opps, jobs, [], "HighVoltage", now);
    assert.equal(hv.openOpportunities, 2);
    assert.equal(hv.won, 1);
    assert.equal(hv.lost, 0);
    assert.equal(hv.winRate, 1);
    assert.equal(hv.jobsInProgress, 2);
    assert.deepEqual(hv.byStage[0]!.search, { stage: "Prospect", type: "HighVoltage" });
  });

  it("open by rep", () => {
    assert.deepEqual(
      s.byRep.map((b) => [b.label, b.count]),
      [
        ["A", 2],
        ["B", 2],
        ["No rep", 1],
      ],
    );
  });
});
