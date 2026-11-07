/** Opportunities: access, won -> job, needs-attention rules. Run: npm run test:unit */
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
const { winOpportunity, emptyOpportunity } = await import("../../src/data/opportunities.ts");
const { oppNeedsAttention, jobNeedsAttention } =
  await import("../../src/components/serv1/sales/attention.ts");

type B = ReturnType<typeof createLocalBackend>;
const as = async (b: B, email: string) => {
  assert.equal((await b.auth.signIn(email, "serv1demo")).kind, "done");
};

describe("opportunities", () => {
  let b: B;
  beforeEach(() => {
    mem.clear();
    b = createLocalBackend();
    setBackend(b);
  });

  it("techs cannot read or write opportunities; owners read only", async () => {
    await as(b, "tech1@serv1.demo");
    assert.deepEqual(await b.opportunities.list(), []);
    assert.equal(await b.opportunities.get("opp-1"), null);
    await assert.rejects(b.opportunities.create(emptyOpportunity()), NotAllowedError);
    await as(b, "owner@serv1.demo");
    assert.ok((await b.opportunities.list()).length > 0);
    await assert.rejects(b.opportunities.update("opp-1", { notes: "x" }), NotAllowedError);
  });

  it("winning creates one linked job and repeating returns the same job", async () => {
    await as(b, "office@serv1.demo");
    await b.opportunities.update("opp-6", { customerPoNumber: "PO-1" });
    const job = await winOpportunity("opp-6", "cust-1", "site-1");
    assert.equal(job.opportunityId, "opp-6");
    assert.equal(job.customerId, "cust-1");
    assert.equal(job.status, "New");
    assert.equal(job.workType, "HighVoltage");
    assert.equal(job.poReceived, true);
    assert.match(job.jobNumber ?? "", /^J-\d{6}-[A-Z0-9]{4}$/);
    const opp = await b.opportunities.get("opp-6");
    assert.equal(opp?.stage, "ClosedWon");
    assert.equal(opp?.jobId, job.id);
    assert.ok(opp?.closedAt);
    const again = await winOpportunity("opp-6", "cust-2");
    assert.equal(again.id, job.id);
    assert.equal((await b.jobs.list()).filter((j) => j.opportunityId === "opp-6").length, 1);
  });

  it("a tech sees the won job when assigned, but never the opportunity amounts", async () => {
    await as(b, "office@serv1.demo");
    const job = await winOpportunity("opp-6", "cust-1");
    await b.jobs.update(job.id, { assignedTechId: "local-tech-1", status: "Scheduled" });
    await as(b, "tech1@serv1.demo");
    const seen = await b.jobs.get(job.id);
    assert.ok(seen);
    assert.equal("quotedAmount" in (seen as object), false);
    assert.equal(await b.opportunities.get("opp-6"), null);
  });

  it("needs-attention rules", () => {
    const base = { ...emptyOpportunity(), id: "x", createdAt: "", updatedAt: "" };
    const today = "2026-11-07";
    assert.equal(oppNeedsAttention({ ...base }, "noNextStep", today), true);
    assert.equal(oppNeedsAttention({ ...base, nextStep: "Call" }, "noNextStep", today), false);
    assert.equal(oppNeedsAttention({ ...base, stage: "NoBid" }, "noNextStep", today), false);
    assert.equal(
      oppNeedsAttention({ ...base, expectedClose: "2026-11-06" }, "pastClose", today),
      true,
    );
    assert.equal(
      oppNeedsAttention({ ...base, expectedClose: "2026-11-07" }, "pastClose", today),
      false,
    );
    assert.equal(
      oppNeedsAttention(
        { ...base, stage: "ProposalBidding", quoteDue: "2026-11-01" },
        "quotePastDue",
        today,
      ),
      true,
    );
    assert.equal(
      oppNeedsAttention(
        { ...base, stage: "ProposalSent", quoteDue: "2026-11-01" },
        "quotePastDue",
        today,
      ),
      false,
    );
    assert.equal(
      oppNeedsAttention(
        { ...base, nextStepRemind: true, nextStepDue: "2026-11-07" },
        "reminderDue",
        today,
      ),
      true,
    );
  });

  it("job attention: past end date and finished without photos", async () => {
    await as(b, "office@serv1.demo");
    const jobs = await b.jobs.list();
    const j10 = jobs.find((j) => j.id === "job-10")!; // seeded Behind, end date yesterday-ish
    assert.equal(jobNeedsAttention(j10, "pastEndDate", new Set(), "2999-01-01"), true);
    const j5 = jobs.find((j) => j.id === "job-5")!; // invoiced, photos on file elsewhere
    assert.equal(jobNeedsAttention(j5, "noPhotos", new Set()), false);
    const j19 = jobs.find((j) => j.id === "job-19")!; // invoiced, no photos
    assert.equal(jobNeedsAttention(j19, "noPhotos", new Set()), true);
    assert.equal(jobNeedsAttention(j19, "noPhotos", new Set(["job-19"])), false);
  });
});
