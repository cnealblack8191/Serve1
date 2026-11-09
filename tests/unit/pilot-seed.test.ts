/** Pilot seed plan: demo data mapped onto the pilot sign-ins. Synthetic only, no network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSeedPlan,
  cognitoIdentity,
  pilotEmail,
  type PilotUser,
} from "../../scripts/pilot/seed-plan.ts";
import { DEMO_ACCOUNTS, SEED_JOBS } from "../../src/data/local/seed.ts";

const pilot: PilotUser[] = DEMO_ACCOUNTS.map((a, i) => ({
  demoIdentityId: a.identityId,
  email: pilotEmail(a.email, "serv1.ecinc.us"),
  sub: `00000000-0000-4000-8000-00000000000${i}`,
  username: `00000000-0000-4000-8000-00000000000${i}`,
}));

describe("pilot seed plan", () => {
  it("maps every demo identity to its pilot sign-in and leaves no local id behind", () => {
    const plan = buildSeedPlan(pilot);
    const text = JSON.stringify(plan);
    assert.ok(!/local-(admin|office|owner|tech-\d)/.test(text), "no local identities left");
    assert.ok(!text.includes("@serv1.demo"), "no demo emails left");
    const tara = pilot.find((p) => p.demoIdentityId === "local-tech-1")!;
    const taraJobs = SEED_JOBS.filter((j) => j.assignedTechId === "local-tech-1").length;
    assert.equal(
      plan.jobs.filter((j) => j.assignedTechId === cognitoIdentity(tara)).length,
      taraJobs,
    );
    assert.ok(plan.users.every((u) => u.email.endsWith("@serv1.ecinc.us")));
  });
  it("drops timestamps and the invoice id (the backend sets and keys them)", () => {
    const plan = buildSeedPlan(pilot);
    for (const rows of Object.values(plan))
      for (const r of rows as Record<string, unknown>[]) {
        assert.ok(!("createdAt" in r) && !("updatedAt" in r));
      }
    assert.ok(plan.invoices.every((i) => !("id" in i) && typeof i.jobId === "string"));
  });
  it("refuses to run with a demo account missing", () => {
    assert.throws(() => buildSeedPlan(pilot.slice(1)), /No pilot sign-in for: admin@serv1.demo/);
  });
  it("sign-in names are simple: the demo local part at the pilot domain", () => {
    assert.equal(pilotEmail("tech1@serv1.demo", "serv1.ecinc.us"), "tech1@serv1.ecinc.us");
  });
});
