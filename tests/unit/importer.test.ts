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

  it("same-name rows of different contracts go to the right sales row", () => {
    const sales = readCsv(
      "Opportunity,Opportunity Type,Sales Stage\nPanel upgrade,DeKalb Service,1 Prospect\nPanel upgrade,Gwinnett,1 Prospect\n",
    );
    const service = readCsv(
      "Service Opportunity,Opportunity Type,Quoted Amount $\nPanel upgrade,Gwinnett,50000\n",
    );
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "v.csv", sheets: [service] },
    ]);
    const byContract = Object.fromEntries(
      plan.opportunities.map((o) => [o.data.customerContract, o]),
    );
    assert.equal(byContract["GwinnettSchools"]!.data.quotedAmount, 50000);
    assert.equal(byContract["DeKalbGov"]!.data.quotedAmount, null);
  });

  it("an ambiguous same-name match is listed under Check these", () => {
    const sales = readCsv(
      "Opportunity,Sales Stage\nPanel upgrade,1 Prospect\nPanel upgrade,2 Assessment\n",
    );
    const tasks = readCsv("Task,Status,Health\nPanel upgrade,Not Started,Green\n", "Tasks");
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    assert.ok(plan.warnings.some((w) => w.includes("matches 2 sales rows")));
  });

  it("a completed task finishes an in-progress service job; a blank task status changes nothing", () => {
    const service = readCsv(
      "Service Opportunity,Job Stage\nPanel upgrade,In Progress\nLight swap,Complete\n",
    );
    const tasks = readCsv(
      "Task,Status,Health,End Date\nPanel upgrade,Complete,Green,11/6/26\nLight swap,,Green,\n",
      "Tasks",
    );
    const plan = sm.buildImportPlan([
      { file: "v.csv", sheets: [service] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    const by = Object.fromEntries(plan.opportunities.map((o) => [o.data.name, o.job!]));
    assert.equal(by["Panel upgrade"]!.status, "Complete");
    assert.equal(by["Panel upgrade"]!.completedAt, "2026-11-06T17:00:00.000Z");
    assert.equal(by["Light swap"]!.status, "Complete");
  });

  it("a heading row with tasks under it is not imported as a job", () => {
    const tasks = {
      name: "Tasks",
      rows: [
        { r: 1, level: 0, cells: ["Task", "Status", "Health"] },
        { r: 2, level: 0, cells: ["Campus projects", null, null] },
        { r: 3, level: 1, cells: ["Panel upgrade", "Not Started", "Green"] },
      ],
    };
    const plan = sm.buildImportPlan([{ file: "t.xlsx", sheets: [tasks] }]);
    assert.deepEqual(
      plan.jobs.map((j) => j.description),
      ["Panel upgrade"],
    );
  });

  it("close dates come from the sheet or stay unknown, never a made-up year", () => {
    const sales = readCsv(
      "Opportunity,Sales Stage\nPanel upgrade,1 Prospect\nOld loss,Closed Lost\n",
    );
    const tasks = readCsv(
      "Task,Status,Health,End Date\nPanel upgrade,Complete,Green,11/6/26\n",
      "Tasks",
    );
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    const by = Object.fromEntries(plan.opportunities.map((o) => [o.data.name, o.data]));
    assert.equal(by["Panel upgrade"]!.closedAt, "2026-11-06T12:00:00.000Z");
    assert.equal(by["Old loss"]!.closedAt, null);
  });

  it("a task tracker's work type fills in a sales row that had none", () => {
    const sales = readCsv(
      "Opportunity,Sales Stage\nPanel upgrade,Closed Won\nTyped job,Closed Won\n",
    );
    const tasks = readCsv(
      "Task,Status,Health\nPanel upgrade,Not Started,Green\nTyped job,Not Started,Green\n",
      "High Voltage Task Tracker",
    );
    const lowSales = readCsv(
      "Opportunity,Opportunity Type,Sales Stage\nTyped job,Low Voltage,Closed Won\n",
    );
    const plan = sm.buildImportPlan([
      { file: "s.csv", sheets: [sales] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    const panel = plan.opportunities.find((o) => o.data.name === "Panel upgrade")!;
    assert.equal(panel.data.type, "HighVoltage");
    assert.equal(panel.job?.workType, "HighVoltage");
    const plan2 = sm.buildImportPlan([
      { file: "l.csv", sheets: [lowSales] },
      { file: "t.csv", sheets: [tasks] },
    ]);
    // An explicit sales type is never overwritten.
    assert.equal(plan2.opportunities[0]!.data.type, "LowVoltage");
  });

  it("an unmatched invoiced task keeps its completion time", () => {
    const tasks = readCsv("Task,Status,Health,End Date\nOld job,Invoiced,Green,11/6/26\n", "Tasks");
    const plan = sm.buildImportPlan([{ file: "t.csv", sheets: [tasks] }]);
    assert.equal(plan.jobs[0]!.status, "Invoiced");
    assert.equal(plan.jobs[0]!.completedAt, "2026-11-06T17:00:00.000Z");
  });

  it("flat CSV headings apply to the rows below them", () => {
    const tasks = readCsv(
      "Task,Status,Health\nGwinnett Schools,,\nStadium light poles,Complete,Green\nRockdale Gov,,\nPark lights,Complete,Green\n",
      "Tasks",
    );
    const plan = sm.buildImportPlan([{ file: "t.csv", sheets: [tasks] }]);
    const by = Object.fromEntries(plan.jobs.map((j) => [j.description, j.contract]));
    assert.equal(by["Stadium light poles"], "GwinnettSchools");
    assert.equal(by["Park lights"], "RockdaleGov");
  });

  it("a flat work-type heading keeps the contract heading above it", () => {
    const tasks = readCsv(
      "Task,Status,Health\nGwinnett Schools,,\nHigh Voltage,,\nPanel upgrade,Started,Green\n",
      "Tasks",
    );
    const plan = sm.buildImportPlan([{ file: "t.csv", sheets: [tasks] }]);
    assert.equal(plan.jobs[0]!.contract, "GwinnettSchools");
    assert.equal(plan.jobs[0]!.workType, "HighVoltage");
  });

  it("an empty heading in an outlined sheet does not leak into another branch", () => {
    const tasks = {
      name: "Tasks",
      rows: [
        { r: 1, level: 0, cells: ["Task", "Status", "Health"] },
        { r: 2, level: 0, cells: ["Gwinnett Schools", null, null] },
        { r: 3, level: 1, cells: ["Gym lights", "Not Started", "Green"] },
        { r: 4, level: 1, cells: ["High Voltage", null, null] },
        { r: 5, level: 0, cells: ["DeKalb Schools", null, null] },
        { r: 6, level: 1, cells: ["Library outlets", "Not Started", "Green"] },
      ],
    };
    const plan = sm.buildImportPlan([{ file: "t.xlsx", sheets: [tasks] }]);
    const lib = plan.jobs.find((j) => j.description === "Library outlets")!;
    assert.equal(lib.contract, "DeKalbSchools");
    assert.equal(lib.workType, "Service"); // not the empty High Voltage heading from Gwinnett
  });

  it("a lost service row never becomes a won job", () => {
    const service = readCsv("Service Opportunity,Job Stage\nCancelled panel upgrade,Closed Lost\n");
    const plan = sm.buildImportPlan([{ file: "v.csv", sheets: [service] }]);
    assert.equal(plan.opportunities[0]!.data.stage, "ClosedLost");
    assert.equal(plan.opportunities[0]!.job, null);
    assert.equal(sm.cleanJobStatus("Closed Lost"), null);
    assert.equal(sm.cleanJobStatus("Closed"), "Complete");
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
