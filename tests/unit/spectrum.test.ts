/** Spectrum (Phase 4): contract rules, signer, server function, fake, import, removal. Synthetic only. */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const c = await import("../../amplify/functions/spectrum/contract.ts");
const { signRequest } = await import("../../amplify/functions/spectrum/sigv4.ts");
const { callConnector } = await import("../../amplify/functions/spectrum/handler.ts");
const { createLocalBackend } = await import("../../src/data/local/index.ts");
const { FAKE_FAIL_KEY, FAKE_LIST_CAP } = await import("../../src/data/local/spectrum-fake.ts");
const { setBackend } = await import("../../src/data/backend.ts");
const sp = await import("../../src/data/spectrum.ts");

// Synthetic, obviously fake values (AWS's own documentation example key).
const KEYS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const GOOD_SAVE = {
  address: "https://spectrum.example.com/ws",
  companyCode: "TST",
  authorizationId: "synthetic-0000-1111",
  authMode: "basic" as const,
};

describe("contract value rules", () => {
  it("record numbers, status, company code", () => {
    for (const ok of ["2401", "A-1", "J 12.3/4_5", "x".repeat(30)])
      assert.ok(c.isRecordNumber(ok), ok);
    for (const bad of ["", "-1", " 1", "x".repeat(31), "a;b"])
      assert.ok(!c.isRecordNumber(bad), bad);
    assert.ok(c.isStatusCode("A") && c.isStatusCode("AB1") && !c.isStatusCode("ABCD"));
    assert.ok(c.isCompanyCode("TST1") && !c.isCompanyCode("TOOLONG") && !c.isCompanyCode("T-1"));
  });
  it("addresses: https DNS names only", () => {
    assert.ok(c.isSpectrumAddress("https://spectrum.example.com"));
    assert.ok(c.isSpectrumAddress("https://spectrum.example.com/ws/"));
    for (const bad of [
      "http://spectrum.example.com",
      "https://10.0.0.1",
      "https://localhost",
      "https://user:pw@spectrum.example.com",
      "https://spectrum.example.com?x=1",
      "https://spectrum.example.com#a",
      "https://spectrum",
      "https://spectrum.example.com:8443",
      `https://${"a".repeat(300)}.com`,
    ])
      assert.ok(!c.isSpectrumAddress(bad), bad);
  });
  it("unknown fields and bad values are refused", () => {
    assert.ok(c.validParams("jobs.list", {}));
    assert.ok(!c.validParams("jobs.list", { status: "A", extra: 1 }));
    assert.ok(!c.validParams("jobs.list", []));
    assert.ok(!c.validParams("jobs.get", {}));
    assert.ok(c.validParams("workOrders.list", { jobNumber: "2401" }));
    assert.ok(c.validParams("credentials.save", { ...GOOD_SAVE, savedBy: "Alex" }));
    assert.ok(!c.validParams("credentials.save", { ...GOOD_SAVE, savedBy: "" }));
    assert.ok(
      !c.validParams("credentials.save", { ...GOOD_SAVE, authMode: "enhanced", savedBy: "A" }),
    );
    assert.ok(
      c.validParams("credentials.save", {
        ...GOOD_SAVE,
        authMode: "enhanced",
        operatorCode: "OP1",
        savedBy: "A",
      }),
    );
    assert.ok(
      !c.validParams("credentials.save", { ...GOOD_SAVE, authorizationId: "short", savedBy: "A" }),
    );
  });
  it("credentials are Admin only; Office reads jobs and work orders", () => {
    assert.ok(c.roleMayRun("credentials.save", ["Admin"]));
    assert.ok(!c.roleMayRun("credentials.status", ["Office"]));
    assert.ok(c.roleMayRun("jobs.list", ["Office"]));
    assert.ok(!c.roleMayRun("jobs.list", ["Owner"]));
    assert.ok(!c.roleMayRun("workOrders.get", ["Tech"]));
  });
  it("outage codes all say 'Spectrum unavailable, try again later'", () => {
    for (const code of ["spectrum_unavailable", "timeout", "spectrum_error"] as const)
      assert.equal(c.SPECTRUM_ERROR_TEXT[code], "Spectrum unavailable, try again later");
    for (const code of c.SPECTRUM_ERROR_CODES) assert.ok(sp.spectrumErrorText(code).length > 0);
  });
});

describe("SigV4 signer", () => {
  it("matches the AWS SDK signer exactly", async () => {
    const now = new Date("2026-11-07T15:04:05Z");
    const url = new URL("https://abc123.execute-api.us-east-2.amazonaws.com/prod/v1/jobs.list");
    const body = JSON.stringify({ status: "A" });
    for (const sessionToken of [undefined, "synthetic-session-token"]) {
      const credentials = { ...KEYS, sessionToken };
      const mine = signRequest({
        method: "POST",
        url,
        body,
        region: "us-east-2",
        service: "execute-api",
        credentials,
        now,
      });
      const sdk = await new SignatureV4({
        service: "execute-api",
        region: "us-east-2",
        credentials,
        sha256: Sha256,
        applyChecksum: true,
      }).sign(
        {
          method: "POST",
          protocol: "https:",
          hostname: url.hostname,
          path: url.pathname,
          headers: {
            host: url.hostname,
            "content-type": "application/json",
            "x-amz-content-sha256": mine["x-amz-content-sha256"]!,
          },
          body,
        },
        { signingDate: now },
      );
      assert.equal(mine.authorization, sdk.headers.authorization);
      assert.equal(mine["x-amz-date"], sdk.headers["x-amz-date"]);
    }
  });
});

describe("server function", () => {
  type Sent = { url: string; init: RequestInit };
  const env = {
    SPECTRUM_CONNECTOR_URL: "https://abc123.execute-api.us-east-2.amazonaws.com/prod/",
    AWS_ACCESS_KEY_ID: KEYS.accessKeyId,
    AWS_SECRET_ACCESS_KEY: KEYS.secretAccessKey,
    AWS_SESSION_TOKEN: "synthetic-session-token",
  };
  const admin = {
    groups: ["Admin"],
    username: "u1",
    claims: { email: "admin@example.com", name: "Alex Admin" },
  };
  const reply = (status: number, body: unknown) =>
    ({ status, json: async () => body }) as unknown as Response;
  const run = async (
    operation: string,
    params: unknown,
    identity: object = admin,
    respond = reply(200, { ok: true, operation, data: {} }),
  ) => {
    const sent: Sent[] = [];
    const out = await callConnector(
      { arguments: { operation, params }, identity },
      env,
      async (url, init) => {
        sent.push({ url, init });
        return respond;
      },
    );
    return { out, sent };
  };

  it("signs a POST to <endpoint>/v1/<operation> with no Origin header", async () => {
    const { out, sent } = await run("jobs.list", JSON.stringify({ status: "A" }));
    assert.equal(out.ok, true);
    assert.equal(
      sent[0]!.url,
      "https://abc123.execute-api.us-east-2.amazonaws.com/prod/v1/jobs.list",
    );
    const h = sent[0]!.init.headers as Record<string, string>;
    assert.match(
      h.authorization!,
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-2\/execute-api\/aws4_request/,
    );
    assert.equal(h["x-amz-security-token"], "synthetic-session-token");
    assert.ok(!Object.keys(h).some((k) => k.toLowerCase() === "origin"));
    assert.equal(sent[0]!.init.body, '{"status":"A"}');
  });
  it("sets savedBy from the session, not the form", async () => {
    const { sent } = await run("credentials.save", { ...GOOD_SAVE, savedBy: "Someone Else" });
    assert.equal(JSON.parse(String(sent[0]!.init.body)).savedBy, "Alex Admin");
  });
  it("refuses before calling: wrong role, unknown op, bad values", async () => {
    for (const [op, params, identity] of [
      ["credentials.status", {}, { groups: ["Office"] }],
      ["jobs.list", {}, { groups: ["Tech"] }],
      ["imports.removeByCompany", {}, admin],
      ["jobs.get", { jobNumber: "-bad" }, admin],
      ["jobs.list", "{not json", admin],
    ] as const) {
      const { out, sent } = await run(op, params, identity);
      assert.equal(sent.length, 0, op);
      assert.equal(out.ok, false);
    }
  });
  it("passes connector refusals through and maps the rest", async () => {
    const refused = {
      ok: false,
      error: { code: "not_configured", message: "Spectrum credentials have not been saved." },
    };
    assert.deepEqual((await run("jobs.list", {}, admin, reply(503, refused))).out, refused);
    const gw = (await run("jobs.list", {}, admin, reply(403, { message: "Forbidden" }))).out;
    assert.equal(!gw.ok && gw.error.code, "caller_refused");
    const odd = (await run("jobs.list", {}, admin, reply(200, { hello: 1 }))).out;
    assert.equal(!odd.ok && odd.error.code, "internal");
  });
  it("network failure is 'unavailable'; no endpoint configured is a clear refusal", async () => {
    const out = await callConnector(
      { arguments: { operation: "jobs.list" }, identity: admin },
      env,
      async () => {
        throw new Error("ECONNRESET");
      },
    );
    assert.equal(!out.ok && out.error.code, "spectrum_unavailable");
    const none = await callConnector(
      { arguments: { operation: "jobs.list" }, identity: admin },
      {},
      async () => {
        throw new Error("must not be called");
      },
    );
    assert.equal(!none.ok && none.error.code, "internal");
  });
});

describe("local fake connector, import and removal", () => {
  let b: ReturnType<typeof createLocalBackend>;
  beforeEach(async () => {
    mem.clear();
    b = createLocalBackend();
    setBackend(b);
  });
  const as = (who: string) => b.auth.signIn(`${who}@serv1.demo`, "serv1demo");
  const saveTst = async () => {
    await as("admin");
    await sp.saveSpectrumCredentials(GOOD_SAVE);
  };

  it("status shows who saved and never the values", async () => {
    await as("admin");
    const before = await b.spectrum.call("credentials.status", {});
    assert.deepEqual(before.ok && before.data, { configured: false });
    await sp.saveSpectrumCredentials(GOOD_SAVE);
    const after = await b.spectrum.call("credentials.status", {});
    assert.ok(after.ok && after.data.configured);
    const all = JSON.stringify(after) + [...mem.values()].join("");
    assert.ok(!all.includes(GOOD_SAVE.authorizationId), "authorization ID is never kept");
    assert.ok(!all.includes("spectrum.example.com"), "address is never kept");
  });
  it("office cannot touch credentials; owner cannot import", async () => {
    await saveTst();
    await as("office");
    const s = await b.spectrum.call("credentials.status", {});
    assert.equal(!s.ok && s.error.code, "operation_refused");
    assert.ok((await b.spectrum.call("jobs.list", {})).ok);
    await as("owner");
    await assert.rejects(sp.listSpectrumJobs(), /not allowed/);
  });
  it("not configured, bad credentials and outages surface as Spectrum errors", async () => {
    await as("admin");
    await assert.rejects(
      sp.listSpectrumJobs(),
      (e: unknown) => e instanceof sp.SpectrumError && e.code === "not_configured",
    );
    const t = await sp.testSpectrumConnection();
    assert.equal(t.result, "failed");
    assert.equal(t.reason, "not_configured");
    await sp.saveSpectrumCredentials({ ...GOOD_SAVE, authorizationId: "BAD-synthetic-1" });
    const bad = await sp.testSpectrumConnection();
    assert.equal(bad.reason, "bad_credentials");
    await sp.saveSpectrumCredentials(GOOD_SAVE);
    assert.equal((await sp.testSpectrumConnection()).result, "connected");
    mem.set(FAKE_FAIL_KEY, "timeout");
    await assert.rejects(sp.listSpectrumJobs(), /Spectrum unavailable, try again later/);
    const checks = await b.spectrumChecks.list();
    assert.equal(checks.length, 3);
  });
  it("lists are capped with truncated, and narrow with a status", async () => {
    await saveTst();
    const all = await sp.listSpectrumJobs();
    assert.equal(all.records.length, FAKE_LIST_CAP);
    assert.equal(all.truncated, true);
    const active = await sp.listSpectrumJobs("A");
    assert.equal(active.truncated, false);
    assert.ok(active.records.every((j) => j.status === "A" && j.companyCode === "TST"));
  });
  it("imports jobs and work orders once, keeping company code and numbers", async () => {
    await saveTst();
    await as("office");
    const jobs = (await sp.listSpectrumJobs("A")).records.slice(0, 3);
    const r1 = await sp.importFromSpectrum(jobs);
    assert.equal(r1.jobsCreated, 3);
    assert.ok(r1.customersCreated >= 1 && r1.sitesCreated === 3);
    const r2 = await sp.importFromSpectrum(jobs);
    assert.equal(r2.jobsCreated, 0);
    assert.equal(r2.alreadyImported, 3);
    const created = (await b.jobs.list()).filter((j) => j.spectrumCompanyCode === "TST");
    assert.deepEqual(
      created.map((j) => j.spectrumJobNumber).sort(),
      jobs.map((j) => j.jobNumber).sort(),
    );
    assert.ok(created.every((j) => j.status === "New" && /^J-\d{6}-/.test(j.jobNumber ?? "")));

    // A work order belongs to its Spectrum job's customer, even when that job is not imported.
    const wos = (await sp.listSpectrumWorkOrders({ jobNumber: "2402" })).records;
    assert.equal(wos.length, 2);
    const r3 = await sp.importFromSpectrum(wos);
    assert.equal(r3.jobsCreated, 2);
    const woJobs = (await b.jobs.list()).filter((j) => j.spectrumWorkOrderNumber);
    assert.ok(woJobs.every((j) => j.spectrumJobNumber === "2402"));
    const customers = await b.customers.list();
    const owner = customers.find((x) => x.id === woJobs[0]!.customerId)!;
    assert.equal(owner.spectrumCompanyCode, "TST");
    assert.equal(
      sp.recordMatch(await b.jobs.list(), wos[0]!)?.spectrumWorkOrderNumber,
      wos[0]!.workOrderNumber,
    );
  });
  it("remove test imports: counts first, keeps work done in Serv1, deletes the rest", async () => {
    await saveTst();
    const jobs = (await sp.listSpectrumJobs("A")).records.slice(0, 3);
    await sp.importFromSpectrum(jobs);
    const before = await b.jobs.list();
    const imported = before.filter((j) => j.spectrumCompanyCode === "TST");
    // Work added in Serv1 to one imported job: it must stay, with its customer and site.
    await b.attachments.create({
      jobId: imported[0]!.id,
      assignedTechId: null,
      storagePath: "jobs/x/photo.jpg",
      type: "Photo",
      caption: null,
      uploadedBy: null,
    });
    const plan = await sp.loadRemovalPlan("TST");
    assert.equal(plan.jobs.length, 2);
    assert.ok(plan.kept.some((k) => k.reason === "it has photos or files"));
    assert.equal(plan.sites.length, 2);
    assert.equal((await sp.loadRemovalPlan("OTHER")).jobs.length, 0);

    const done = await sp.removeTestImports(plan);
    assert.equal(done.changed, false);
    assert.equal(done.removed, plan.jobs.length + plan.sites.length + plan.customers.length);
    const after = await b.jobs.list();
    assert.equal(after.length, before.length - 2);
    assert.ok(after.some((j) => j.id === imported[0]!.id));
    const keptJob = after.find((j) => j.id === imported[0]!.id)!;
    assert.ok((await b.customers.list()).some((x) => x.id === keptJob.customerId));
    assert.ok((await b.sites.list()).some((s) => s.id === keptJob.siteId));
    // Seed (non-Spectrum) records are untouched.
    assert.equal(
      after.filter((j) => !j.spectrumCompanyCode).length,
      before.filter((j) => !j.spectrumCompanyCode).length,
    );
  });
  it("removal refuses when records changed since the count", async () => {
    await saveTst();
    await sp.importFromSpectrum((await sp.listSpectrumJobs("A")).records.slice(0, 2));
    const plan = await sp.loadRemovalPlan("TST");
    await sp.importFromSpectrum((await sp.listSpectrumJobs("A")).records.slice(2, 3));
    const r = await sp.removeTestImports(plan);
    assert.deepEqual(r, { removed: 0, changed: true });
  });
  it("two people importing the same records at once get one copy (fixed ids)", async () => {
    await saveTst();
    const recs = (await sp.listSpectrumJobs("A")).records.slice(0, 3);
    const [r1, r2] = await Promise.all([sp.importFromSpectrum(recs), sp.importFromSpectrum(recs)]);
    assert.equal(r1.jobsCreated + r2.jobsCreated, 3);
    assert.equal(r1.alreadyImported + r2.alreadyImported, 3);
    const tst = (await b.jobs.list()).filter((j) => j.spectrumCompanyCode === "TST");
    assert.equal(tst.length, 3);
    assert.equal(
      tst.find((j) => j.spectrumJobNumber === recs[0]!.jobNumber)?.id,
      sp.spectrumIds.job("TST", recs[0]!.jobNumber),
    );
    const custs = (await b.customers.list()).filter((c) => c.spectrumCompanyCode === "TST");
    assert.equal(new Set(custs.map((c) => c.spectrumCustomerCode)).size, custs.length);
    const sites = (await b.sites.list()).filter((x) => x.spectrumCompanyCode === "TST");
    assert.equal(sites.length, 3);
  });
  it("removal refuses when a counted record was edited since the count", async () => {
    await saveTst();
    await sp.importFromSpectrum((await sp.listSpectrumJobs("A")).records.slice(0, 2));
    const plan = await sp.loadRemovalPlan("TST");
    await new Promise((r) => setTimeout(r, 5)); // a later updatedAt
    await b.jobs.update(plan.jobs[0]!.id, { notes: "Tech left a note" });
    assert.deepEqual(await sp.removeTestImports(plan), { removed: 0, changed: true });
    assert.equal((await b.jobs.list()).filter((j) => j.spectrumCompanyCode === "TST").length, 2);
  });
  it("a work order is not attached to another company's job after Spectrum is switched", async () => {
    await saveTst();
    const wos = (await sp.listSpectrumWorkOrders({ jobNumber: "2401" })).records;
    await sp.saveSpectrumCredentials({ ...GOOD_SAVE, companyCode: "AAA" });
    const r = await sp.importFromSpectrum(wos);
    assert.equal(r.jobsCreated, 0);
    assert.equal(r.skipped.length, 2);
    assert.match(r.skipped[0]!.reason, /now set to company AAA/);
    assert.equal((await b.customers.list()).filter((c) => c.spectrumCompanyCode).length, 0);
  });
  it("spectrum checks are Admin only", async () => {
    await saveTst();
    await sp.testSpectrumConnection();
    await as("office");
    assert.equal((await b.spectrumChecks.list()).length, 0);
  });
});
