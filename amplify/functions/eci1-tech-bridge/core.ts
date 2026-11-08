/**
 * ECI1 tech bridge: the rules (ECI-1X docs/SERV1-TECH-API.md and docs/SERV1-ECI-LINK-DESIGN.md,
 * approved 2026-11-07). The ECI1 server signs each call and names the tech; this code decides
 * what that tech may see and change. No AWS here: storage is behind BridgeStore, so the rules
 * are tested with an in-memory store (tests/unit/eci1-bridge.test.ts).
 *
 * Every call: linked, active Tech user -> job assigned to that user -> status rules -> actionId
 * repeat check -> save -> audit row. Never creates or deletes jobs, never touches office data.
 */

export const ROUTES = [
  "jobs",
  "status",
  "note",
  "photos",
  "materials",
  "receipt",
  "complete",
] as const;
export type Route = (typeof ROUTES)[number];

export type ErrorCode =
  | "not_linked"
  | "not_assigned"
  | "job_not_found"
  | "bad_transition"
  | "job_locked"
  | "invalid"
  | "not_enabled"
  | "serv1_unavailable";

export type Reply =
  ({ ok: true } & Record<string, unknown>) | { ok: false; code: ErrorCode; message: string };

const MESSAGES: Record<ErrorCode, string> = {
  not_linked: "Your ECI1 login is not linked to an active Serv1 technician.",
  not_assigned: "This job is not assigned to you.",
  job_not_found: "This job is not in Serv1.",
  bad_transition: "The job can't move to that status from where it is.",
  job_locked: "The office has closed this job.",
  invalid: "Something in the request is missing or wrong.",
  not_enabled: "The Serv1 tech module is turned off.",
  serv1_unavailable: "Serv1 is not available. Try again later.",
};
export const fail = (code: ErrorCode, message = MESSAGES[code]): Reply => ({
  ok: false,
  code,
  message,
});

// ---- what the store holds (a subset of Serv1's records) ------------------------------------

export type JobStatus =
  | "New"
  | "Scheduled"
  | "EnRoute"
  | "InProgress"
  | "OnHold"
  | "Complete"
  | "Reviewed"
  | "Invoiced"
  | "Paid"
  | "Cancelled";

export interface BUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
  identityId: string | null;
}

export interface BJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  jobNumber: string | null;
  customerId: string;
  siteId: string | null;
  description: string;
  jobType: string | null;
  priority: string;
  status: JobStatus;
  assignedTechId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  holdReason: string | null;
  holdNote: string | null;
  officeChangedAt: string | null;
  officeNote: string | null;
  noSignatureReason: string | null;
  noSignatureNote: string | null;
  materials: Material[] | null;
  materialsAt: string | null;
  techStatusAt: string | null;
}

export interface Material {
  name: string;
  qty: number;
  unit: string;
}

export interface BNote {
  id: string;
  jobId: string;
  text: string;
  by: string | null;
  at: string;
}
export interface BPhoto {
  id: string;
  jobId: string;
  storagePath: string;
  caption: string | null;
  createdAt: string;
}
export interface BReceipt {
  id: string;
  jobId: string;
  kind: string;
  vendor: string | null;
  date: string | null;
  amount: number;
  paidWith: string;
  note: string | null;
  storagePath: string | null;
  at: string;
}
export interface BSignature {
  id: string;
  jobId: string;
  signerName: string;
  signedAt: string;
}

export interface BridgeStore {
  getUser(id: string): Promise<BUser | null>;
  getJob(id: string): Promise<BJob | null>;
  jobsAssignedTo(identityId: string): Promise<BJob[]>;
  getCustomer(id: string): Promise<{ name: string; phone: string | null } | null>;
  getSite(
    id: string,
  ): Promise<{ name: string | null; address: string; accessNotes: string | null } | null>;
  notes(jobId: string): Promise<BNote[]>;
  photos(jobId: string): Promise<BPhoto[]>;
  receipts(jobId: string): Promise<BReceipt[]>;
  signature(jobId: string): Promise<BSignature | null>;
  /** Saves fields on the job (never status-unrelated office fields). */
  updateJob(id: string, patch: Partial<BJob>): Promise<void>;
  /** Creates a row with this id unless it exists (repeats then do nothing). */
  addNote(row: BNote & { assignedTechId: string; actionId: string }): Promise<void>;
  addPhoto(row: BPhoto & { assignedTechId: string; uploadedBy: string }): Promise<void>;
  addReceipt(row: BReceipt & { assignedTechId: string; actionId: string }): Promise<void>;
  addSignature(row: BSignature & { assignedTechId: string; storagePath: string }): Promise<void>;
  putFile(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  fileUrl(key: string): Promise<string>;
  /** The saved action for this id, if any (the repeat check). */
  getAction(actionId: string): Promise<{ result: string } | null>;
  saveAction(row: {
    id: string;
    jobId: string;
    route: Route;
    serv1UserId: string;
    at: string;
    result: "applied" | "stale_ignored";
  }): Promise<void>;
  audit(row: {
    eciUserId: string | null;
    serv1UserId: string | null;
    route: string;
    actionId: string | null;
    jobId: string | null;
    result: string;
    at: string;
  }): Promise<void>;
}

// ---- rules -------------------------------------------------------------------------------

/** Office statuses: the tech can change nothing once a job is here (contract 3.4). */
export const LOCKED: JobStatus[] = ["Reviewed", "Invoiced", "Paid", "Cancelled"];
const OPEN: JobStatus[] = ["New", "Scheduled", "EnRoute", "InProgress", "OnHold"];

/** Contract section 5. Complete is set only by /complete. */
export const TECH_MOVES: Record<string, JobStatus[]> = {
  New: ["EnRoute", "InProgress"],
  Scheduled: ["EnRoute", "InProgress"],
  EnRoute: ["InProgress", "OnHold"],
  InProgress: ["OnHold", "Complete"],
  OnHold: ["EnRoute", "InProgress"],
};

/** Hold reasons: the phone sends a code; the office reads words. */
export const HOLD_REASONS: Record<string, string> = {
  parts: "Waiting on parts",
  access: "No access to the site",
  return_visit: "Needs a return visit",
};
const holdCode = (stored: string | null) =>
  stored === null
    ? null
    : (Object.entries(HOLD_REASONS).find(([, label]) => label === stored)?.[0] ?? stored);

const NO_SIGNATURE = ["not_on_site", "unable_to_sign", "other"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || v === null || str(v, 0, max);
const ACTION = /^[A-Za-z0-9._:-]{1,100}$/;
/** About 4.5 MB of image, inside Lambda's 6 MB request with base64 and the rest. */
export const MAX_IMAGE_BYTES = 4_500_000;

function decodeImage(v: unknown, kind: "jpeg" | "png"): Uint8Array | null {
  if (!v || typeof v !== "object" || typeof (v as { base64?: unknown }).base64 !== "string")
    return null;
  const b64 = (v as { base64: string }).base64.replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES) return null;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return (kind === "jpeg" ? jpeg : png) ? bytes : null;
}

/** Safe piece of an S3 key from a phone-made id. */
const keyPart = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

export interface BridgeRequest {
  serv1UserId?: unknown;
  eciUserId?: unknown;
  route?: unknown;
  body?: unknown;
}

export interface BridgeOptions {
  /** Off switch: anything but true answers not_enabled. */
  enabled: boolean;
  now: Date;
  /** The company's time zone, for "today" (America/New_York). */
  timeZone: string;
}

const dayIn = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

export async function handleBridge(
  req: BridgeRequest,
  store: BridgeStore,
  opts: BridgeOptions,
): Promise<Reply> {
  const at = opts.now.toISOString();
  const rawRoute = typeof req.route === "string" ? req.route.replace(/^\/?serv1\/tech\//, "") : "";
  const route = (ROUTES as readonly string[]).includes(rawRoute) ? (rawRoute as Route) : null;
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
    string,
    unknown
  >;
  const eciUserId =
    typeof req.eciUserId === "string" || typeof req.eciUserId === "number"
      ? String(req.eciUserId).slice(0, 100)
      : null;
  const serv1UserId = typeof req.serv1UserId === "string" ? req.serv1UserId.slice(0, 200) : null;
  const actionId = typeof body.actionId === "string" ? body.actionId.slice(0, 100) : null;
  const jobId = typeof body.jobId === "string" ? body.jobId.slice(0, 200) : null;

  const finish = async (reply: Reply) => {
    try {
      await store.audit({
        eciUserId,
        serv1UserId,
        route: route ?? String(req.route ?? "").slice(0, 60),
        actionId,
        jobId,
        result: reply.ok ? "ok" : reply.code,
        at,
      });
    } catch {
      return fail("serv1_unavailable");
    }
    return reply;
  };

  try {
    if (!opts.enabled) return finish(fail("not_enabled"));
    if (!route) return finish(fail("invalid"));

    // 1. The explicit link must name an active Serv1 tech (a link to an office account does nothing).
    const user = serv1UserId ? await store.getUser(serv1UserId) : null;
    if (!user || !user.active || user.role !== "Tech" || !user.identityId)
      return finish(fail("not_linked"));

    if (route === "jobs") return finish(await listJobs(store, user.identityId, opts));

    // 2. Every write names a job assigned to this tech.
    if (!jobId || !actionId || !ACTION.test(actionId)) return finish(fail("invalid"));
    const sentAt = typeof body.at === "string" && ISO.test(body.at) ? body.at : null;
    if (!sentAt) return finish(fail("invalid"));
    const job = await store.getJob(jobId);
    if (!job) return finish(fail("job_not_found"));
    if (job.assignedTechId !== user.identityId) return finish(fail("not_assigned"));

    // 3. Repeat check: a saved actionId changes nothing (photos repeat per position).
    const index = route === "photos" ? Number(body.index ?? 0) : 0;
    if (!Number.isInteger(index) || index < 0 || index > 9) return finish(fail("invalid"));
    const repeatKey = route === "photos" ? `${actionId}#${index}` : actionId;
    if (await store.getAction(repeatKey)) return finish({ ok: true });

    // 4. Office statuses win.
    if (LOCKED.includes(job.status)) return finish(fail("job_locked"));

    const outcome = await write(route, body, { store, job, user, actionId, sentAt, index });
    if (!outcome.ok) return finish(outcome);
    await store.saveAction({
      id: repeatKey,
      jobId: job.id,
      route,
      serv1UserId: user.id,
      at: sentAt,
      result: outcome.stale ? "stale_ignored" : "applied",
    });
    return finish({ ok: true });
  } catch {
    return finish(fail("serv1_unavailable"));
  }
}

type WriteCtx = {
  store: BridgeStore;
  job: BJob;
  user: BUser;
  actionId: string;
  sentAt: string;
  index: number;
};
type WriteOutcome = { ok: true; stale?: boolean } | Extract<Reply, { ok: false }>;

async function write(route: Route, b: Record<string, unknown>, c: WriteCtx): Promise<WriteOutcome> {
  const { store, job, user, actionId, sentAt } = c;
  const tech = user.identityId!;
  const staleStatus = !!job.techStatusAt && sentAt < job.techStatusAt;

  switch (route) {
    case "status": {
      const to = b.status;
      if (to !== "EnRoute" && to !== "InProgress" && to !== "OnHold")
        return fail("invalid", "Use Complete to finish a job.") as WriteOutcome;
      if (to === "OnHold" && !(typeof b.reason === "string" && b.reason in HOLD_REASONS))
        return fail("invalid") as WriteOutcome;
      if (!optStr(b.note, 1000)) return fail("invalid") as WriteOutcome;
      // Out of order: an older change than the last one applied is recorded, not applied.
      if (staleStatus) return { ok: true, stale: true };
      if (job.status !== to && !(TECH_MOVES[job.status] ?? []).includes(to))
        return fail("bad_transition") as WriteOutcome;
      const patch: Partial<BJob> = { status: to, techStatusAt: sentAt };
      if (to === "InProgress" && !job.startedAt) patch.startedAt = sentAt;
      if (to === "OnHold") {
        patch.holdReason = HOLD_REASONS[b.reason as string]!;
        patch.holdNote = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
      } else {
        patch.holdReason = null;
        patch.holdNote = null;
      }
      await store.updateJob(job.id, patch);
      return { ok: true };
    }
    case "note": {
      if (!str(b.text, 1, 4000)) return fail("invalid") as WriteOutcome;
      await store.addNote({
        id: `eci1-${actionId}`,
        jobId: job.id,
        assignedTechId: tech,
        text: b.text.trim(),
        by: user.name,
        at: sentAt,
        actionId,
      });
      return { ok: true };
    }
    case "photos": {
      // One photo per call (Lambda payload limit); its position is in `index`.
      const list = b.photos;
      if (!Array.isArray(list) || list.length !== 1) return fail("invalid") as WriteOutcome;
      const bytes = decodeImage(list[0], "jpeg");
      const caption = (list[0] as { caption?: unknown }).caption;
      if (!bytes || !optStr(caption, 500)) return fail("invalid") as WriteOutcome;
      const key = `jobs/${keyPart(job.id)}/tech-photos/${keyPart(actionId)}-${c.index}.jpg`;
      await store.putFile(key, bytes, "image/jpeg");
      await store.addPhoto({
        id: `eci1-${actionId}-${c.index}`,
        jobId: job.id,
        assignedTechId: tech,
        storagePath: key,
        caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
        uploadedBy: user.name,
        createdAt: sentAt,
      });
      return { ok: true };
    }
    case "materials": {
      const list = b.materials;
      if (!Array.isArray(list) || list.length > 200) return fail("invalid") as WriteOutcome;
      const materials: Material[] = [];
      for (const m of list) {
        const x = (m ?? {}) as Record<string, unknown>;
        if (!str(x.name, 1, 200) || !str(x.unit, 0, 30)) return fail("invalid") as WriteOutcome;
        if (typeof x.qty !== "number" || !Number.isFinite(x.qty) || x.qty <= 0 || x.qty > 1e6)
          return fail("invalid") as WriteOutcome;
        materials.push({ name: x.name.trim(), qty: x.qty, unit: x.unit.trim() });
      }
      if (job.materialsAt && sentAt < job.materialsAt) return { ok: true, stale: true };
      await store.updateJob(job.id, { materials, materialsAt: sentAt });
      return { ok: true };
    }
    case "receipt": {
      if (b.kind !== "materials" && b.kind !== "other") return fail("invalid") as WriteOutcome;
      if (b.paidWith !== "company_card" && b.paidWith !== "personal")
        return fail("invalid") as WriteOutcome;
      if (
        typeof b.amount !== "number" ||
        !Number.isFinite(b.amount) ||
        b.amount < 0 ||
        b.amount > 100000
      )
        return fail("invalid") as WriteOutcome;
      if (!optStr(b.vendor, 200) || !optStr(b.note, 2000)) return fail("invalid") as WriteOutcome;
      if (
        b.date !== undefined &&
        b.date !== null &&
        !(typeof b.date === "string" && DAY.test(b.date))
      )
        return fail("invalid") as WriteOutcome;
      const list = b.photos;
      if (!Array.isArray(list) || list.length !== 1) return fail("invalid") as WriteOutcome;
      const bytes = decodeImage(list[0], "jpeg");
      if (!bytes) return fail("invalid") as WriteOutcome;
      const key = `jobs/${keyPart(job.id)}/receipts/${keyPart(actionId)}.jpg`;
      await store.putFile(key, bytes, "image/jpeg");
      await store.addReceipt({
        id: `eci1-${actionId}`,
        jobId: job.id,
        assignedTechId: tech,
        actionId,
        kind: b.kind,
        vendor: typeof b.vendor === "string" && b.vendor.trim() ? b.vendor.trim() : null,
        date: typeof b.date === "string" ? b.date : null,
        amount: Math.round(b.amount * 100) / 100,
        paidWith: b.paidWith,
        note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
        storagePath: key,
        at: sentAt,
      });
      return { ok: true };
    }
    case "complete": {
      const signer = b.signerName;
      const hasSignature = signer !== undefined || b.signaturePng !== undefined;
      let png: Uint8Array | null = null;
      if (hasSignature) {
        const list = b.signaturePng;
        if (!str(signer, 1, 200) || !Array.isArray(list) || list.length !== 1)
          return fail("invalid") as WriteOutcome;
        png = decodeImage(list[0], "png");
        if (!png) return fail("invalid") as WriteOutcome;
      } else {
        const why = b.noSignatureReason;
        if (typeof why !== "string" || !NO_SIGNATURE.includes(why))
          return fail("invalid") as WriteOutcome;
        if (why === "other" && !str(b.noSignatureNote, 1, 1000))
          return fail("invalid") as WriteOutcome;
        if (!optStr(b.noSignatureNote, 1000)) return fail("invalid") as WriteOutcome;
      }
      if (staleStatus) return { ok: true, stale: true };
      if (job.status !== "Complete" && !OPEN.includes(job.status))
        return fail("bad_transition") as WriteOutcome;
      if (png) {
        const key = `jobs/${keyPart(job.id)}/signatures/${keyPart(actionId)}.png`;
        await store.putFile(key, png, "image/png");
        await store.addSignature({
          id: `eci1-${actionId}`,
          jobId: job.id,
          assignedTechId: tech,
          signerName: (signer as string).trim(),
          signedAt: sentAt,
          storagePath: key,
        });
      }
      // minutesOnJob is information only: pay hours come from TimeX.
      await store.updateJob(job.id, {
        status: "Complete",
        completedAt: sentAt,
        techStatusAt: sentAt,
        holdReason: null,
        holdNote: null,
        noSignatureReason: png ? null : (b.noSignatureReason as string),
        noSignatureNote:
          !png && typeof b.noSignatureNote === "string" && b.noSignatureNote.trim()
            ? b.noSignatureNote.trim()
            : null,
      });
      return { ok: true };
    }
    case "jobs":
      return fail("invalid") as WriteOutcome;
  }
}

/** Contract 3: open jobs, scheduled -7..+14 days, and jobs completed or cancelled today. */
async function listJobs(
  store: BridgeStore,
  identityId: string,
  opts: BridgeOptions,
): Promise<Reply> {
  const now = opts.now;
  const today = dayIn(now, opts.timeZone);
  const from = now.getTime() - 7 * 86_400_000;
  const to = now.getTime() + 14 * 86_400_000;
  const jobs = (await store.jobsAssignedTo(identityId)).filter((j) => {
    if (j.assignedTechId !== identityId) return false;
    if (OPEN.includes(j.status)) return true;
    if (j.status === "Complete" && j.completedAt && dayIn(j.completedAt, opts.timeZone) === today)
      return true;
    if (j.status === "Cancelled")
      return !!j.officeChangedAt && dayIn(j.officeChangedAt, opts.timeZone) === today;
    if (j.status === "Complete" && j.scheduledStart) {
      const t = Date.parse(j.scheduledStart);
      return t >= from && t <= to;
    }
    return false;
  });

  const out = [];
  for (const j of jobs) {
    const [customer, site, notes, photos, receipts, signature] = await Promise.all([
      store.getCustomer(j.customerId),
      j.siteId ? store.getSite(j.siteId) : Promise.resolve(null),
      store.notes(j.id),
      store.photos(j.id),
      store.receipts(j.id),
      store.signature(j.id),
    ]);
    const officeNotes = j.notes?.trim()
      ? [
          {
            id: `office-${j.id}`,
            text: j.notes.trim(),
            at: j.officeChangedAt ?? j.createdAt,
            by: "Office",
          },
        ]
      : [];
    out.push({
      id: j.id,
      jobNumber: j.jobNumber,
      description: j.description,
      jobType: j.jobType,
      status: j.status,
      priority: j.priority,
      customer: { name: customer?.name ?? null, phone: customer?.phone ?? null },
      site: {
        name: site?.name ?? null,
        address: site?.address ?? null,
        accessNotes: site?.accessNotes ?? null,
        contactName: null,
        contactPhone: null,
      },
      scheduledStart: j.scheduledStart,
      scheduledEnd: j.scheduledEnd,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      officeChangedAt: j.officeChangedAt ?? j.createdAt,
      officeNote: j.officeNote,
      holdReason: j.status === "OnHold" ? holdCode(j.holdReason) : null,
      holdNote: j.status === "OnHold" ? j.holdNote : null,
      notes: [
        ...officeNotes,
        ...notes
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((n) => ({ id: n.id, text: n.text, at: n.at, by: n.by })),
      ],
      photos: await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          url: await store.fileUrl(p.storagePath),
          caption: p.caption,
          at: p.createdAt,
        })),
      ),
      materials: j.materials ?? [],
      receipts: await Promise.all(
        receipts.map(async (r) => ({
          id: r.id,
          kind: r.kind,
          vendor: r.vendor,
          date: r.date,
          amount: r.amount,
          paidWith: r.paidWith,
          note: r.note,
          url: r.storagePath ? await store.fileUrl(r.storagePath) : null,
          at: r.at,
        })),
      ),
      signature: signature ? { signerName: signature.signerName, at: signature.signedAt } : null,
      noSignatureReason: j.noSignatureReason,
      noSignatureNote: j.noSignatureNote,
    });
  }
  return { ok: true, jobs: out, serverTime: now.toISOString() };
}
