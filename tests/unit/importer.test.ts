/** Smartsheet importer on synthetic exports only. Run: npm run test:unit */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { syntheticExports } from "../fixtures/xlsx.ts";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { readXlsx, readCsv } = await import("../../src/lib/import/xlsx.ts");
const sm = await import("../../src/lib/import/smartsheet.ts");
const { createLocalBackend } = await import("../../src/data/local/index.ts");
const { setBackend } = await import("../../src/data/backend.ts");
const { runImport } = await import("../../src/data/importer.ts");

const { salesFile, serviceFile, taskFile } = syntheticExports();
const files = async () => [
  { file: "sales.xlsx", sheets: await readXlsx(salesFile) },
  { file: "service.xlsx", sheets: await readXlsx(serviceFile) },
  { file: "tasks.xlsx", sheets: await readXlsx(taskFile) },
];

describe("xlsx reader", () => {
  it("reads sheet names, cells and outline levels", async () => {
    const [sheet] = await readXlsx(salesFile);
    assert.equal(sheet!.name, "Sales Pipeline");
    assert.equal(sheet!.rows[0]!.cells[2], "Opportunity");
    assert.equal(sheet!.rows[2]!.level, 1);
    assert.equal(sheet!.rows[2]!.cells[4], 0.25);
  });
  it("reads CSV with quotes", () => {
    const s = readCsv('Opportunity,Notes\n"Big, job","said ""hi"""\n');
    assert.deepEqual(s.rows[1]!.cells, ["Big, job", 'said "hi"']);
  });
  it("rejects a file that is not an .xlsx", async () => {
    await assert.rejects(readXlsx(new TextEncoder().encode("hello")), /Not an Excel/);
  });
});

describe("cleaning", () => {
  it("customer contract spellings", () => {
    for (const s of ["DeKalb Service", "Dekalb Service", "DeKalb Gov Service", "dekalb gov."])
      assert.equal(sm.cleanContract(s), "DeKalbGov");
    assert.equal(sm.cleanContract("DeKalb County Schools"), "DeKalbSchools");
    assert.equal(sm.cleanContract("Gwinnett"), "GwinnettSchools");
    assert.equal(sm.cleanContract("City of Decatur Schools"), "DecaturCitySchools");
    assert.equal(sm.cleanContract("Non-Contract"), "NonContract");
    assert.equal(sm.cleanContract("Low Voltage"), null);
  });
  it("stages, dates, numbers", () => {
    assert.equal(sm.cleanStage("2 - Assessment"), "Assessment");
    assert.equal(sm.cleanStage("4 Proposal/Bid Sent"), "ProposalSent");
    assert.equal(sm.cleanStage("Proposal/Bidding"), "ProposalBidding");
    assert.equal(sm.cleanStage("Customer Follow-up"), "CustomerFollowUp");
    assert.equal(sm.cleanStage("No Bid"), "NoBid");
    assert.equal(sm.date("9/1/26"), "2026-09-01");
    assert.equal(sm.date(46300), "2026-10-05");
    assert.equal(sm.num("$12,500.00"), 12500);
    assert.equal(sm.num(0.25, true), 25);
    assert.equal(sm.num("31%", true), 31);
    assert.equal(sm.cleanHealth("Yellow"), "Watch");
    assert.equal(sm.cleanJobStatus("Not Started"), "New");
    assert.equal(sm.cleanJobStatus("Started"), "InProgress");
  });
});

describe("import plan", () => {
  it("merges service rows into sales rows by name and imports every row", async () => {
    const plan = sm.buildImportPlan(await files());
    assert.equal(plan.opportunities.length, 7); // 6 sales + 1 service-only
    assert.equal(plan.mergedServiceRows, 3);
    const byName = Object.fromEntries(plan.opportunities.map((o) => [o.data.name, o]));
    const lib = byName["Library lighting retrofit"]!;
    assert.equal(lib.data.customerContract, "DeKalbGov");
    assert.equal(lib.data.stage, "Assessment");
    assert.equal(lib.data.eciQuoteNumber, "Q-1001");
    assert.equal(lib.data.quotedAmount, 12500);
    assert.equal(lib.data.quotedMargin, 31);
    assert.equal(lib.data.probability, 25);
    assert.equal(lib.sources.length, 2);
    assert.equal(byName["Annex panel upgrade"]!.data.priority, "High");
    assert.equal(byName["School intercom"]!.data.type, "LowVoltage");

    const gym = byName["Gym high-bays"]!;
    assert.equal(gym.data.stage, "ClosedWon");
    assert.equal(gym.data.customerContract, "BarrowSchools");
    assert.equal(gym.job?.status, "Complete");
    assert.equal(gym.job?.serviceReportApproved, true);
    assert.equal(gym.job?.completionPhotosOnFile, true);
    assert.equal(gym.job?.liftConnex, true); // from the task tracker row
    assert.equal(gym.job?.poReceived, true);
    assert.equal(gym.job?.endDate, "2026-08-20"); // the task's blank End Date keeps the service date

    const fire = byName["Fire station outlet repair"]!;
    assert.equal(fire.data.type, "Service");
    assert.equal(fire.job?.status, "InProgress");

    assert.equal(plan.jobs.length, 2);
    const stadium = plan.jobs.find((j) => j.description === "Stadium light poles")!;
    assert.equal(stadium.contract, "GwinnettSchools");
    assert.equal(stadium.workType, "HighVoltage");
    assert.equal(stadium.health, "Watch");
    assert.equal(stadium.materialOrdered, true);
    assert.equal(stadium.endDate, "2026-10-30");
    assert.match(stadium.notes ?? "", /Assigned to: Crew A/);

    const spell = Object.fromEntries(plan.contractSpellings.map((c) => [c.raw, c.contract]));
    assert.equal(spell["Dekalb Service"], "DeKalbGov");
    assert.equal(spell["DeKalb Gov Service"], "DeKalbGov");
  });

  it("writes through the backend, and a second run adds nothing", async () => {
    mem.clear();
    const b = createLocalBackend();
    setBackend(b);
    await b.auth.signIn("office@serv1.demo", "serv1demo");
    const before = {
      opps: (await b.opportunities.list()).length,
      jobs: (await b.jobs.list()).length,
    };
    const plan = sm.buildImportPlan(await files());
    const r1 = await runImport(plan);
    assert.equal(r1.opportunitiesCreated, 7);
    assert.equal(r1.jobsCreated, 4);
    assert.ok(r1.customersCreated >= 3);
    const gymOpp = (await b.opportunities.list()).find((o) => o.name === "Gym high-bays")!;
    const gymJob = await b.jobs.get(gymOpp.jobId!);
    assert.equal(gymJob?.opportunityId, gymOpp.id);
    assert.equal(gymJob?.status, "Complete");
    const r2 = await runImport(plan);
    assert.equal(r2.opportunitiesCreated, 0);
    assert.equal(r2.jobsCreated, 0);
    assert.equal((await b.opportunities.list()).length, before.opps + 7);
    assert.equal((await b.jobs.list()).length, before.jobs + 4);
  });

  it("keeps name-only records that are not headings", () => {
    const plan = sm.buildImportPlan([
      { file: "x.csv", sheets: [readCsv("Opportunity,Sales Stage\nNew lead,\n")] },
    ]);
    assert.equal(plan.opportunities.length, 1);
    assert.equal(plan.opportunities[0]!.data.name, "New lead");
  });

  it("a task's parent contract fills in a matched sales row with none", () => {
    const sales = readCsv(
      "Opportunity,Opportunity Type,Sales Stage\nPanel upgrade,Low Voltage,Closed Won\n",
    );
    const tasks = {
      name: "Tasks",
      rows: [
        { r: 1, level: 0, cells: ["Task", "Status", "Health"] },
        { r: 2, level: 0, cells: ["Gwinnett Schools", null, null] },
        { r: 3, level: 1, cells: ["Panel upgrade", "Not Started", "Green"] },
      ],
    };
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "t.xlsx", sheets: [tasks] },
    ]);
    const o = plan.opportunities[0]!;
    assert.equal(o.data.customerContract, "GwinnettSchools");
    assert.equal(o.job?.contract, "GwinnettSchools");
    assert.equal(o.job?.status, "New");
  });

  it("a completed task matched to a sales row gets a completion time", () => {
    const sales = readCsv("Opportunity,Sales Stage\nPanel upgrade,Closed Won\n");
    const tasks = readCsv(
      "Task,Status,Health,End Date\nPanel upgrade,Complete,Green,11/6/26\n",
      "Tasks",
    );
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    assert.equal(plan.opportunities[0]!.job?.status, "Complete");
    assert.equal(plan.opportunities[0]!.job?.completedAt, "2026-11-06T17:00:00.000Z");
  });

  it("the same name on the same row of two exports stays two records", async () => {
    const a = readCsv("Opportunity,Sales Stage\nPanel upgrade,1 Prospect\n", "DeKalb");
    const c = readCsv("Opportunity,Sales Stage\nPanel upgrade,1 Prospect\n", "Gwinnett");
    const plan = sm.buildImportPlan([
      { file: "dekalb.csv", sheets: [a] },
      { file: "gwinnett.csv", sheets: [c] },
    ]);
    assert.equal(new Set(plan.opportunities.map((o) => o.key)).size, 2);
  });

  it("a retry after a partial run re-links the job instead of making another", async () => {
    mem.clear();
    const b = createLocalBackend();
    setBackend(b);
    await b.auth.signIn("office@serv1.demo", "serv1demo");
    const plan = sm.buildImportPlan(await files());
    await runImport(plan);
    const gym = (await b.opportunities.list()).find((o) => o.name === "Gym high-bays")!;
    const jobId = gym.jobId!;
    await b.opportunities.update(gym.id, { jobId: null }); // as if the link step had failed
    const r = await runImport(plan);
    assert.equal(r.jobsCreated, 0);
    assert.equal((await b.opportunities.get(gym.id))?.jobId, jobId);
  });

  it("a tech cannot run the import", async () => {
    mem.clear();
    const b = createLocalBackend();
    setBackend(b);
    await b.auth.signIn("tech1@serv1.demo", "serv1demo");
    await assert.rejects(runImport(sm.buildImportPlan(await files())));
  });
});
