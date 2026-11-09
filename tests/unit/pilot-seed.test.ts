/** Pilot seed plan: demo data mapped onto the pilot sign-ins. Synthetic only, no network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSeedPlan,
  cognitoIdentity,
  noSignInIdentity,
  PILOT_SIGN_INS,
  type PilotUser,
} from "../../scripts/pilot/seed-plan.ts";
import { SEED_JOBS } from "../../src/data/local/seed.ts";

const pilot: PilotUser[] = PILOT_SIGN_INS.map((p, i) => ({
  demoIdentityId: p.demoIdentityId,
  email: `${p.local}@serv1.ecinc.us`,
  sub: `00000000-0000-4000-8000-00000000000${i}`,
  username: `00000000-0000-4000-8000-00000000000${i}`,
}));

describe("pilot seed plan", () => {
  it("maps every demo identity to its pilot sign-in and leaves no local id behind", () => {
    const plan = buildSeedPlan(pilot);
    const text = JSON.stringify(plan);
    assert.ok(
      !/(?<!no-sign-in:)local-(admin|office|owner|tech-\d)/.test(text),
      "no local identities left",
    );
    assert.ok(!text.includes("@serv1.demo"), "no demo emails left");
    const tara = pilot.find((p) => p.email === "tech@serv1.ecinc.us")!;
    const taraJobs = SEED_JOBS.filter((j) => j.assignedTechId === "local-tech-1").length;
    assert.equal(
      plan.jobs.filter((j) => j.assignedTechId === cognitoIdentity(tara)).length,
      taraJobs,
    );
    assert.ok(plan.users.every((u) => u.email.endsWith("@serv1.ecinc.us")));
  });
  it("exactly four sign-ins; the other demo techs stay on the roster without one", () => {
    assert.deepEqual(
      PILOT_SIGN_INS.map((p) => p.local),
      ["admin", "office", "owner", "tech"],
    );
    const plan = buildSeedPlan(pilot);
    const tom = plan.users.find((u) => u.name === "Tom Tech")!;
    assert.equal(tom.identityId, noSignInIdentity("local-tech-2"));
    assert.match(tom.email, /no-sign-in@serv1\.ecinc\.us$/);
    const tomJobs = SEED_JOBS.filter((j) => j.assignedTechId === "local-tech-2").length;
    assert.equal(plan.jobs.filter((j) => j.assignedTechId === tom.identityId).length, tomJobs);
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
    assert.throws(() => buildSeedPlan(pilot.slice(1)), /No pilot sign-in for: admin/);
  });
});
