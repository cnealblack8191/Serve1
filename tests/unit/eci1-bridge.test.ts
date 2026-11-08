/** ECI1 tech bridge rules against an in-memory store. Synthetic data only. */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  handleBridge,
  JobChanged,
  HOLD_REASONS,
  TECH_MOVES,
  type BJob,
  type BridgeStore,
  type BUser,
} from "../../amplify/functions/eci1-tech-bridge/core.ts";
import { techMayMove } from "../../src/data/jobflow.ts";

const NOW = new Date("2026-11-07T15:00:00.000Z");
const T = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]).toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]).toString("base64");

function job(id: string, extra: Partial<BJob> = {}): BJob {
  return {
    id,
    createdAt: T(-6000),
    updatedAt: T(-6000),
    jobNumber: `J-261107-${id}`,
    customerId: "c1",
    siteId: "s1",
    description: `Synthetic job ${id}`,
    jobType: "Panel upgrade",
    priority: "Normal",
    status: "Scheduled",
    assignedTechId: "tech-a",
    scheduledStart: T(60),
    scheduledEnd: T(120),
    startedAt: null,
    completedAt: null,
    notes: null,
    reviewNote: null,
    holdReason: null,
    holdNote: null,
    officeChangedAt: null,
    officeNote: null,
    noSignatureReason: null,
    noSignatureNote: null,
    materials: null,
    materialsAt: null,
    techStatusAt: null,
    ...extra,
  };
}

function memoryStore() {
  const users = new Map<string, BUser>([
    ["u-a", { id: "u-a", name: "Tara Tech", role: "Tech", active: true, identityId: "tech-a" }],
    ["u-b", { id: "u-b", name: "Tom Tech", role: "Tech", active: true, identityId: "tech-b" }],
    ["u-off", { id: "u-off", name: "Old Tech", role: "Tech", active: false, identityId: "tech-c" }],
    [
      "u-office",
      { id: "u-office", name: "Olivia", role: "Office", active: true, identityId: "off" },
    ],
  ]);
  const jobs = new Map<string, BJob>();
  const rows = {
    notes: new Map<
      string,
      { id: string; jobId: string; text: string; by: string | null; at: string }
    >(),
    photos: new Map<
      string,
      { id: string; jobId: string; storagePath: string; caption: string | null; createdAt: string }
    >(),
    receipts: new Map<string, Parameters<BridgeStore["addReceipt"]>[0]>(),
    signatures: new Map<string, Parameters<BridgeStore["addSignature"]>[0]>(),
    files: new Map<string, number>(),
    actions: new Map<string, string>(),
    audit: [] as { route: string; result: string; serv1UserId: string | null }[],
  };
  const store: BridgeStore = {
    getUser: async (id) => users.get(id) ?? null,
    getJob: async (id) => jobs.get(id) ?? null,
    jobsAssignedTo: async (t) => [...jobs.values()].filter((j) => j.assignedTechId === t),
    getCustomer: async () => ({ name: "Synthetic Customer", phone: "555-0100" }),
    getSite: async () => ({ name: "Main", address: "1 Test Way", accessNotes: null }),
    notes: async (j) => [...rows.notes.values()].filter((n) => n.jobId === j),
    photos: async (j) => [...rows.photos.values()].filter((n) => n.jobId === j),
    receipts: async (j) => [...rows.receipts.values()].filter((n) => n.jobId === j),
    signature: async (j) => [...rows.signatures.values()].find((n) => n.jobId === j) ?? null,
    updateJob: async (id, patch, expect) => {
      const cur = jobs.get(id)!;
      for (const [k, v] of Object.entries(expect))
        if ((cur[k as keyof BJob] ?? null) !== (v ?? null)) throw new JobChanged();
      jobs.set(id, { ...cur, ...patch });
    },
    addNote: async (r) => void (rows.notes.has(r.id) || rows.notes.set(r.id, r)),
    addPhoto: async (r) => void (rows.photos.has(r.id) || rows.photos.set(r.id, r)),
    addReceipt: async (r) => void (rows.receipts.has(r.id) || rows.receipts.set(r.id, r)),
    addSignature: async (r) => void (rows.signatures.has(r.id) || rows.signatures.set(r.id, r)),
    putFile: async (k, b) => void rows.files.set(k, b.length),
    fileUrl: async (k) => `https://signed.example/${k}?short`,
    getAction: async (id) => (rows.actions.has(id) ? { result: rows.actions.get(id)! } : null),
    saveAction: async (r) => void rows.actions.set(r.id, r.result),
    audit: async (r) => void rows.audit.push(r),
  };
  return { store, jobs, rows, users };
}

const opts = { enabled: true, now: NOW, timeZone: "America/New_York" };
let m: ReturnType<typeof memoryStore>;
let n = 0;
const send = (route: string, body: Record<string, unknown> = {}, serv1UserId = "u-a") =>
  handleBridge(
    { serv1UserId, eciUserId: 42, route, body: { at: T(0), actionId: `act-${++n}`, ...body } },
    m.store,
    opts,
  );

beforeEach(() => {
  m = memoryStore();
  m.jobs.set("j1", job("j1"));
  m.jobs.set("j2", job("j2", { assignedTechId: "tech-b" }));
});

describe("who may call", () => {
  it("off switch, unknown route, and links that are not an active tech", async () => {
    assert.equal(
      (
        (await handleBridge({ serv1UserId: "u-a", route: "jobs" }, m.store, {
          ...opts,
          enabled: false,
        })) as { code: string }
      ).code,
      "not_enabled",
    );
    assert.equal(((await send("delete-everything")) as { code: string }).code, "invalid");
    for (const id of ["nobody", "u-off", "u-office"])
      assert.equal(((await send("jobs", {}, id)) as { code: string }).code, "not_linked", id);
  });
  it("every write needs a job assigned to this tech", async () => {
    assert.equal(
      ((await send("note", { jobId: "j2", text: "hi" })) as { code: string }).code,
      "not_assigned",
    );
    assert.equal(
      ((await send("note", { jobId: "nope", text: "hi" })) as { code: string }).code,
      "job_not_found",
    );
    assert.equal(((await send("note", { text: "hi" })) as { code: string }).code, "invalid");
    assert.equal(m.rows.notes.size, 0);
  });
  it("audits every call, allowed or refused", async () => {
    await send("jobs");
    await send("note", { jobId: "j2", text: "hi" });
    assert.deepEqual(
      m.rows.audit.map((a) => [a.route, a.result]),
      [
        ["jobs", "ok"],
        ["note", "not_assigned"],
      ],
    );
  });
});

describe("my jobs", () => {
  it("lists only my jobs in the window, with today's done and cancelled", async () => {
    m.jobs.set(
      "old",
      job("old", { status: "Complete", completedAt: T(-3 * 1440), scheduledStart: T(-30 * 1440) }),
    );
    m.jobs.set("doneToday", job("doneToday", { status: "Complete", completedAt: T(-30) }));
    m.jobs.set(
      "cancelled",
      job("cancelled", {
        status: "Cancelled",
        officeChangedAt: T(-10),
        scheduledStart: T(-40 * 1440),
      }),
    );
    m.jobs.set("paid", job("paid", { status: "Paid" }));
    m.jobs.set(
      "held",
      job("held", {
        status: "OnHold",
        holdReason: HOLD_REASONS.parts!,
        holdNote: "Breaker on order",
      }),
    );
    const r = (await send("jobs")) as {
      ok: true;
      jobs: { id: string; holdReason: string | null; officeChangedAt: string }[];
    };
    assert.deepEqual(r.jobs.map((j) => j.id).sort(), ["cancelled", "doneToday", "held", "j1"]);
    assert.equal(r.jobs.find((j) => j.id === "held")!.holdReason, "parts");
    assert.ok(r.jobs.every((j) => j.officeChangedAt));
  });
});

describe("status", () => {
  it("follows the contract's moves; Complete only via /complete", async () => {
    assert.ok((await send("status", { jobId: "j1", status: "EnRoute" })).ok);
    assert.equal(m.jobs.get("j1")!.status, "EnRoute");
    assert.equal(
      ((await send("status", { jobId: "j1", status: "Complete" })) as { code: string }).code,
      "invalid",
    );
    assert.equal(
      ((await send("status", { jobId: "j1", status: "OnHold" })) as { code: string }).code,
      "invalid",
    );
    assert.ok(
      (
        await send("status", {
          jobId: "j1",
          status: "OnHold",
          reason: "access",
          note: "Gate locked",
        })
      ).ok,
    );
    assert.equal(m.jobs.get("j1")!.holdReason, HOLD_REASONS.access);
    assert.ok((await send("status", { jobId: "j1", status: "InProgress", at: T(5) })).ok);
    const j = m.jobs.get("j1")!;
    assert.equal(j.startedAt, T(5));
    assert.equal(j.holdReason, null);
    m.jobs.set("j3", job("j3", { status: "Complete" }));
    assert.equal(
      ((await send("status", { jobId: "j3", status: "EnRoute" })) as { code: string }).code,
      "bad_transition",
    );
  });
  it("office statuses lock the job", async () => {
    for (const status of ["Reviewed", "Invoiced", "Paid", "Cancelled"] as const) {
      m.jobs.set("j1", job("j1", { status }));
      assert.equal(
        ((await send("note", { jobId: "j1", text: "x" })) as { code: string }).code,
        "job_locked",
      );
    }
  });
  it("matches the Serv1 web app's tech moves", () => {
    for (const [from, tos] of Object.entries(TECH_MOVES))
      for (const to of tos) assert.ok(techMayMove(from as never, to as never), `${from} -> ${to}`);
  });
});

describe("repeats, late and out-of-order sends", () => {
  it("a repeated actionId changes nothing", async () => {
    const body = { jobId: "j1", text: "Panel labelled", actionId: "same-1" };
    assert.ok((await send("note", body)).ok);
    assert.ok((await send("note", body)).ok);
    assert.equal(m.rows.notes.size, 1);
  });
  it("an older status or materials list than the saved one is recorded, not applied", async () => {
    assert.ok((await send("status", { jobId: "j1", status: "InProgress", at: T(10) })).ok);
    assert.ok(
      (await send("status", { jobId: "j1", status: "EnRoute", at: T(5), actionId: "late-1" })).ok,
    );
    assert.equal(m.jobs.get("j1")!.status, "InProgress");
    assert.equal(m.rows.actions.get("late-1"), "stale_ignored");

    const list = (name: string) => [{ name, qty: 2, unit: "ea" }];
    assert.ok(
      (await send("materials", { jobId: "j1", materials: list("Breaker 20A"), at: T(30) })).ok,
    );
    assert.ok(
      (await send("materials", { jobId: "j1", materials: list("Old list"), at: T(20) })).ok,
    );
    assert.equal(m.jobs.get("j1")!.materials![0]!.name, "Breaker 20A");
    assert.equal(
      (
        (await send("materials", {
          jobId: "j1",
          materials: [{ name: "x", qty: 0, unit: "ea" }],
        })) as { code: string }
      ).code,
      "invalid",
    );
  });
  it("a change arriving hours late still applies when nothing newer is saved", async () => {
    assert.ok((await send("status", { jobId: "j1", status: "InProgress", at: T(-300) })).ok);
    assert.equal(m.jobs.get("j1")!.status, "InProgress");
  });
});

describe("photos, receipts and completing", () => {
  it("one JPEG per call, repeats per position", async () => {
    assert.equal(
      (
        (await send("photos", { jobId: "j1", photos: [{ base64: JPEG }, { base64: JPEG }] })) as {
          code: string;
        }
      ).code,
      "invalid",
    );
    assert.equal(
      ((await send("photos", { jobId: "j1", photos: [{ base64: PNG }] })) as { code: string }).code,
      "invalid",
    );
    for (const index of [0, 1, 1])
      assert.ok(
        (
          await send("photos", {
            jobId: "j1",
            actionId: "ph-1",
            index,
            photos: [{ base64: JPEG, caption: "Panel" }],
          })
        ).ok,
      );
    assert.equal(m.rows.photos.size, 2);
    const r = (await send("jobs")) as unknown as {
      jobs: { id: string; photos: { url: string }[] }[];
    };
    assert.match(
      r.jobs.find((j) => j.id === "j1")!.photos[0]!.url,
      /^https:\/\/signed\.example\/jobs\/j1\/tech-photos\//,
    );
  });
  it("receipts wait for office review", async () => {
    const ok = await send("receipt", {
      jobId: "j1",
      kind: "materials",
      vendor: "Synthetic Supply",
      date: "2026-11-07",
      amount: 42.5,
      paidWith: "personal",
      photos: [{ base64: JPEG }],
    });
    assert.ok(ok.ok);
    const [rec] = [...m.rows.receipts.values()];
    assert.equal(rec!.amount, 42.5);
    assert.equal(rec!.paidWith, "personal");
    assert.equal(
      (
        (await send("receipt", {
          jobId: "j1",
          kind: "materials",
          amount: -1,
          paidWith: "personal",
          photos: [{ base64: JPEG }],
        })) as { code: string }
      ).code,
      "invalid",
    );
  });
  it("completes with a signature or a reason", async () => {
    m.jobs.set("j1", job("j1", { status: "InProgress" }));
    assert.equal(
      ((await send("complete", { jobId: "j1", noSignatureReason: "other" })) as { code: string })
        .code,
      "invalid",
    );
    assert.ok(
      (
        await send("complete", {
          jobId: "j1",
          signerName: "Pat Customer",
          signaturePng: [{ base64: PNG }],
          summary: { minutesOnJob: 90 },
        })
      ).ok,
    );
    const j = m.jobs.get("j1")!;
    assert.equal(j.status, "Complete");
    assert.equal(j.completedAt, T(0));
    assert.equal(m.rows.signatures.size, 1);
    m.jobs.set("j4", job("j4", { status: "OnHold" }));
    assert.ok((await send("complete", { jobId: "j4", noSignatureReason: "not_on_site" })).ok);
    assert.equal(m.jobs.get("j4")!.noSignatureReason, "not_on_site");
  });
});

describe("Codex review of PR #18", () => {
  it("an office change between check and save is never overwritten", async () => {
    const real = m.store.getJob;
    m.store.getJob = async (id) => {
      const j = await real(id);
      // The office locks the job right after the bridge reads it.
      m.jobs.set(id, { ...m.jobs.get(id)!, status: "Cancelled" });
      return j;
    };
    const r = (await send("status", { jobId: "j1", status: "EnRoute", actionId: "race-1" })) as {
      code: string;
    };
    assert.equal(r.code, "serv1_unavailable");
    assert.equal(m.jobs.get("j1")!.status, "Cancelled");
    assert.equal(
      m.rows.actions.has("race-1"),
      false,
      "not recorded, so the retry is checked again",
    );
    m.store.getJob = real;
    const again = (await send("status", {
      jobId: "j1",
      status: "EnRoute",
      actionId: "race-1",
    })) as { code: string };
    assert.equal(again.code, "job_locked");
  });
  it("compares times as instants, not text", async () => {
    m.jobs.set("j1", job("j1", { status: "EnRoute", techStatusAt: "2026-11-07T15:00:00Z" }));
    assert.ok(
      (await send("status", { jobId: "j1", status: "InProgress", at: "2026-11-07T15:00:00.100Z" }))
        .ok,
    );
    assert.equal(m.jobs.get("j1")!.status, "InProgress");
    m.jobs.set("j1", job("j1", { materialsAt: "2026-11-07T15:00:00.500Z" }));
    assert.ok(
      (
        await send("materials", {
          jobId: "j1",
          materials: [{ name: "x", qty: 1, unit: "ea" }],
          at: "2026-11-07T15:00:01Z",
        })
      ).ok,
    );
    assert.equal(m.jobs.get("j1")!.materials![0]!.name, "x");
  });
  it("the office's send-back reason reaches the phone", async () => {
    m.jobs.set("j1", job("j1", { status: "InProgress", reviewNote: "Label the panel" }));
    const r = (await send("jobs")) as unknown as {
      jobs: { id: string; officeNote: string; notes: { text: string }[] }[];
    };
    const j = r.jobs.find((x) => x.id === "j1")!;
    assert.match(j.officeNote, /Sent back: Label the panel/);
    assert.ok(j.notes.some((n) => n.text === "Sent back: Label the panel"));
  });
  it("different action ids never share an image file", async () => {
    for (const actionId of ["a:b", "a_b"])
      assert.ok(
        (
          await send("receipt", {
            jobId: "j1",
            actionId,
            kind: "other",
            amount: 1,
            paidWith: "company_card",
            photos: [{ base64: JPEG }],
          })
        ).ok,
      );
    assert.equal(m.rows.files.size, 2);
  });
});

describe("failures", () => {
  it("a store failure answers serv1_unavailable (the phone keeps it queued)", async () => {
    m.store.getJob = async () => {
      throw new Error("DynamoDB down");
    };
    assert.equal(
      ((await send("note", { jobId: "j1", text: "x" })) as { code: string }).code,
      "serv1_unavailable",
    );
  });
});
