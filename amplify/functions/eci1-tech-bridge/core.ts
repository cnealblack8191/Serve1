/**
 * ECI1 tech bridge: the rules (ECI-1X docs/SERV1-TECH-API.md and docs/SERV1-ECI-LINK-DESIGN.md,
 * approved 2026-11-07). The ECI1 server signs each call and names the tech; this code decides
 * what that tech may see and change. No AWS here: storage is behind BridgeStore, so the rules
 * are tested with an in-memory store (tests/unit/eci1-bridge.test.ts).
 *
 * Every call: linked, active Tech user -> job assigned to that user -> status rules -> actionId
 * repeat check -> save -> audit row. Never creates or deletes jobs, never touches office data.
 *
 * Multi-visit jobs (docs/VISITS.md, additive): a job with Visit rows is worked one visit at a time.
 * Only the tech of the current visit (the first one still open) may change the job; the visit's
 * status follows each change in the same write; "visit_done" ends a visit with a return needed,
 * and "complete" is accepted only on the last open visit. A job with no visits is one visit.
 */

import { createHash } from "node:crypto";

export const ROUTES = [
  "jobs",
  "status",
  "note",
  "photos",
  "materials",
  "receipt",
  "complete",
  "visit_done",
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
  /** The office's reason when it sent the job back. */
  reviewNote: string | null;
  holdReason: string | null;
  holdNote: string | null;
  officeChangedAt: string | null;
  officeNote: string | null;
  noSignatureReason: string | null;
  noSignatureNote: string | null;
  materials: Material[] | null;
  materialsAt: string | null;
  techStatusAt: string | null;
  /** Every tech with a visit on the job (Serv1 keeps it in step with the Visit rows). */
  visitTechIds?: string[] | null;
}

export type VisitStatus = "Scheduled" | "EnRoute" | "InProgress" | "OnHold" | "Done" | "Cancelled";
export interface BVisit {
  id: string;
  jobId: string;
  number: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedTechId: string | null;
  status: VisitStatus;
  startedAt: string | null;
  completedAt: string | null;
  holdReason: string | null;
  note: string | null;
}
/**
 * A visit change saved with a job change: only if the visit's status and tech are still what the
 * rules saw (the office may reassign it meanwhile; Codex review of PR #21).
 */
export interface VisitWrite {
  id: string;
  patch: Partial<BVisit>;
  expectStatus: VisitStatus;
  expectAssignedTechId: string | null;
  /**
   * The action's repeat marker, saved in the same atomic write. A visit change can move the job to
   * another visit, so a retry after a lost marker would be refused; with the marker saved together,
   * the retry is always recognised (Codex review of PR #21). A marker that already exists means
   * this exact action was already applied: the write then changes nothing and succeeds.
   */
  action?: ActionRow;
}

/** The repeat marker of one tech action (saveAction). */
export interface ActionRow {
  id: string;
  jobId: string;
  route: Route;
  serv1UserId: string;
  at: string;
  result: "applied" | "stale_ignored";
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
  /** The tech who sent it: receipts stay theirs alone, even on a shared job. */
  assignedTechId?: string | null;
}
export interface BSignature {
  id: string;
  jobId: string;
  signerName: string;
  signedAt: string;
}

/** Fields a job update is conditional on: the state the rules were checked against. */
export type JobExpect = Partial<
  Pick<BJob, "assignedTechId" | "status" | "techStatusAt" | "materialsAt">
>;

/** The job changed between the check and the save; nothing was saved. */
export class JobChanged extends Error {}

export interface BridgeStore {
  getUser(id: string): Promise<BUser | null>;
  getJob(id: string): Promise<BJob | null>;
  /** Jobs assigned to the tech, or with a visit of theirs (visitTechIds). */
  jobsAssignedTo(identityId: string): Promise<BJob[]>;
  /** The job's Visit rows (any status). */
  visits(jobId: string): Promise<BVisit[]>;
  getCustomer(id: string): Promise<{ name: string; phone: string | null } | null>;
  getSite(
    id: string,
  ): Promise<{ name: string | null; address: string; accessNotes: string | null } | null>;
  notes(jobId: string): Promise<BNote[]>;
  photos(jobId: string): Promise<BPhoto[]>;
  receipts(jobId: string): Promise<BReceipt[]>;
  signature(jobId: string): Promise<BSignature | null>;
  /**
   * Saves fields on the job only if it still matches `expect` (atomically), else throws
   * JobChanged, so an office lock or a newer tech change made meanwhile is never overwritten.
   * With `visit`, that visit is changed in the same atomic write (multi-visit jobs).
   */
  updateJob(id: string, patch: Partial<BJob>, expect: JobExpect, visit?: VisitWrite): Promise<void>;
  /** Creates a row with this id unless it exists (repeats then do nothing). */
  // Each add is atomic with a check that the job still matches `expect` (else JobChanged), so a
  // reassignment or office lock made meanwhile never gets a row tagged for the wrong tech.
  // jobTechIds: the job's visitTechIds, so every tech on the job may read the row (docs/VISITS.md).
  addNote(
    row: BNote & { assignedTechId: string; actionId: string; jobTechIds?: string[] | null },
    expect: JobExpect,
  ): Promise<void>;
  addPhoto(
    row: BPhoto & { assignedTechId: string; uploadedBy: string; jobTechIds?: string[] | null },
    expect: JobExpect,
  ): Promise<void>;
  addReceipt(
    row: BReceipt & { assignedTechId: string; actionId: string },
    expect: JobExpect,
  ): Promise<void>;
  addSignature(
    row: BSignature & { assignedTechId: string; storagePath: string; jobTechIds?: string[] | null },
    expect: JobExpect,
  ): Promise<void>;
  putFile(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  fileUrl(key: string): Promise<string>;
  /** The saved action for this id, if any (the repeat check). */
  getAction(
    actionId: string,
  ): Promise<{ result: string; jobId?: string | null; serv1UserId?: string | null } | null>;
  saveAction(row: ActionRow): Promise<void>;
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

/** Where a tech may end a visit from (visit_done), as in src/data/jobflow.ts. */
const VISIT_DONE_FROM: JobStatus[] = ["EnRoute", "InProgress", "OnHold"];
const OPEN_VISIT: VisitStatus[] = ["Scheduled", "EnRoute", "InProgress", "OnHold"];

/** A job's visits that are not cancelled, in order; [] for a job with no Visit rows. */
const liveVisits = (vs: BVisit[]) =>
  vs.filter((v) => v.status !== "Cancelled").sort((a, b) => a.number - b.number);
/** The id a job with no Visit rows uses for its one visit (never stored). */
const impliedVisitId = (jobId: string) => `${jobId}#1`;

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

/** Safe piece of an S3 key from a database id. */
const keyPart = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
/** File name from a phone-made actionId: a hash, so distinct ids never share a file. */
const actionKey = (actionId: string) =>
  createHash("sha256").update(actionId, "utf8").digest("hex").slice(0, 40);
/**
 * Only files that belong to this job get a link: Serv1 keeps them under jobs/<jobId>/ (office and
 * bridge) or tech-files/<storageId>/<jobId>/ (Serv1's tech screens). A row's own path is not
 * trusted otherwise, since a tech can create attachment rows (Codex review of PR #18).
 */
export function pathBelongsToJob(path: string, jobId: string): boolean {
  if (!path) return false;
  const parts = path.split("/");
  // Plain segments only: no "%" (encoded traversal such as %2e%2e), no "." or "..", no "\\",
  // nothing empty. What is signed is then exactly this path.
  if (!parts.every((p) => /^[A-Za-z0-9._:-]+$/.test(p) && p !== "." && p !== "..")) return false;
  if (parts[0] === "jobs") return parts[1] === keyPart(jobId) && parts.length > 2;
  if (parts[0] === "tech-files") return parts.length > 3 && parts[2] === jobId;
  return false;
}

/** The one visit of a job with no Visit rows, as a status. */
function impliedVisitStatus(j: BJob): VisitStatus {
  if (j.status === "New" || j.status === "Scheduled") return "Scheduled";
  if (j.status === "EnRoute" || j.status === "InProgress") return j.status;
  if (j.status === "OnHold") return j.holdReason === HOLD_REASONS.return_visit ? "Done" : "OnHold";
  return j.status === "Cancelled" ? "Cancelled" : "Done";
}

/** Phone times compared as instants (whole and fractional seconds both allowed). */
const ms = (iso: string) => Date.parse(iso);
const olderThan = (sent: string, saved: string | null) => !!saved && ms(sent) < ms(saved);

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
    const index = route === "photos" ? Number(body.index ?? 0) : 0;
    if (!Number.isInteger(index) || index < 0 || index > 9) return finish(fail("invalid"));
    const repeatKey = route === "photos" ? `${actionId}#${index}` : actionId;
    // A retry of an action this tech already saved on this job is answered first: the save may
    // have moved the job to another tech's visit (Codex review of PR #21).
    const saved = await store.getAction(repeatKey);
    if (saved && saved.jobId === job.id && saved.serv1UserId === user.id)
      return finish({ ok: true });
    // A multi-visit job is the current visit's tech's to change; others only read it.
    const visits = liveVisits(await store.visits(job.id));
    const visit = visits.find((v) => OPEN_VISIT.includes(v.status)) ?? null;
    if (visits.length) {
      if (!visit || visit.assignedTechId !== user.identityId)
        return finish(
          fail(
            "not_assigned",
            (job.visitTechIds ?? []).includes(user.identityId)
              ? "This visit is another tech's. You can act on the job on your own visit."
              : undefined,
          ),
        );
    } else if (job.assignedTechId !== user.identityId) return finish(fail("not_assigned"));
    // The phone may say which visit it means; it must be the current one.
    if (body.visitId !== undefined && body.visitId !== (visit?.id ?? impliedVisitId(job.id)))
      return finish(fail("invalid", "That visit is not the current one. Refresh the job."));
    const moreVisits = visits.some((v) => v.id !== visit?.id && OPEN_VISIT.includes(v.status));

    // 3. Repeat check: a saved actionId changes nothing (photos repeat per position).
    if (await store.getAction(repeatKey)) return finish({ ok: true });

    // 4. Office statuses win.
    if (LOCKED.includes(job.status)) return finish(fail("job_locked"));

    const outcome = await write(route, body, {
      store,
      job,
      user,
      actionId,
      route,
      sentAt,
      index,
      visit,
      moreVisits,
    });
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
  } catch (e) {
    // JobChanged: nothing saved and the action not recorded, so the phone's retry is checked
    // again against the job as it is then (e.g. now locked by the office).
    return finish(
      fail(
        "serv1_unavailable",
        e instanceof JobChanged ? "The job just changed. Try again." : undefined,
      ),
    );
  }
}

type WriteCtx = {
  store: BridgeStore;
  job: BJob;
  user: BUser;
  actionId: string;
  route: Route;
  sentAt: string;
  index: number;
  /** The current visit of a multi-visit job (null for a job with no visits). */
  visit: BVisit | null;
  /** Another visit of the job is still open after this one. */
  moreVisits: boolean;
};
type WriteOutcome = { ok: true; stale?: boolean } | Extract<Reply, { ok: false }>;

async function write(route: Route, b: Record<string, unknown>, c: WriteCtx): Promise<WriteOutcome> {
  const { store, job, user, actionId, sentAt, visit, moreVisits } = c;
  const tech = user.identityId!;
  const jobTechIds = job.visitTechIds ?? null;
  /** The current visit's change, saved atomically with the job's. */
  const visitWrite = (patch: Partial<BVisit>): VisitWrite | undefined =>
    visit
      ? {
          id: visit.id,
          patch,
          expectStatus: visit.status,
          expectAssignedTechId: visit.assignedTechId,
          action: {
            id: actionId,
            jobId: job.id,
            route: c.route,
            serv1UserId: user.id,
            at: sentAt,
            result: "applied",
          },
        }
      : undefined;
  const staleStatus = olderThan(sentAt, job.techStatusAt);
  // Every job write (and every row added to it) is conditional on the state checked here.
  const expectJob: JobExpect = { assignedTechId: job.assignedTechId, status: job.status };
  const expectStatus: JobExpect = {
    assignedTechId: job.assignedTechId,
    status: job.status,
    techStatusAt: job.techStatusAt,
  };

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
      await store.updateJob(
        job.id,
        patch,
        expectStatus,
        visitWrite({
          status: to,
          ...(to === "InProgress" && !visit?.startedAt ? { startedAt: sentAt } : {}),
          holdReason: to === "OnHold" ? (patch.holdReason ?? null) : null,
        }),
      );
      return { ok: true };
    }
    case "visit_done": {
      // End this visit with another trip needed. With a later visit planned the job waits for it
      // (Scheduled); with none it goes On hold "Needs a return visit" for the office to plan one.
      if (!optStr(b.note, 1000)) return fail("invalid") as WriteOutcome;
      if (staleStatus) return { ok: true, stale: true };
      if (!VISIT_DONE_FROM.includes(job.status)) return fail("bad_transition") as WriteOutcome;
      const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
      await store.updateJob(
        job.id,
        moreVisits
          ? { status: "Scheduled", techStatusAt: sentAt, holdReason: null, holdNote: null }
          : {
              status: "OnHold",
              techStatusAt: sentAt,
              holdReason: HOLD_REASONS.return_visit!,
              holdNote: note,
            },
        expectStatus,
        visitWrite({ status: "Done", completedAt: sentAt, note }),
      );
      return { ok: true };
    }
    case "note": {
      if (!str(b.text, 1, 4000)) return fail("invalid") as WriteOutcome;
      await store.addNote(
        {
          id: `eci1-${actionId}`,
          jobId: job.id,
          assignedTechId: tech,
          jobTechIds,
          text: b.text.trim(),
          by: user.name,
          at: sentAt,
          actionId,
        },
        expectJob,
      );
      return { ok: true };
    }
    case "photos": {
      // One photo per call (Lambda payload limit); its position is in `index`.
      const list = b.photos;
      if (!Array.isArray(list) || list.length !== 1) return fail("invalid") as WriteOutcome;
      const bytes = decodeImage(list[0], "jpeg");
      const caption = (list[0] as { caption?: unknown }).caption;
      if (!bytes || !optStr(caption, 500)) return fail("invalid") as WriteOutcome;
      const key = `jobs/${keyPart(job.id)}/tech-photos/${actionKey(actionId)}-${c.index}.jpg`;
      await store.putFile(key, bytes, "image/jpeg");
      await store.addPhoto(
        {
          id: `eci1-${actionId}-${c.index}`,
          jobId: job.id,
          assignedTechId: tech,
          jobTechIds,
          storagePath: key,
          caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
          uploadedBy: user.name,
          createdAt: sentAt,
        },
        expectJob,
      );
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
      if (olderThan(sentAt, job.materialsAt)) return { ok: true, stale: true };
      await store.updateJob(
        job.id,
        { materials, materialsAt: sentAt },
        { assignedTechId: job.assignedTechId, status: job.status, materialsAt: job.materialsAt },
      );
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
      const key = `jobs/${keyPart(job.id)}/receipts/${actionKey(actionId)}.jpg`;
      await store.putFile(key, bytes, "image/jpeg");
      await store.addReceipt(
        {
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
        },
        expectJob,
      );
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
      // Job complete only on the last open visit (owner, 2026-11-09).
      if (moreVisits)
        return fail(
          "bad_transition",
          "Other visits of this job are still planned. Use visit_done to end this visit.",
        ) as WriteOutcome;
      if (png) {
        const key = `jobs/${keyPart(job.id)}/signatures/${actionKey(actionId)}.png`;
        await store.putFile(key, png, "image/png");
        await store.addSignature(
          {
            id: `eci1-${actionId}`,
            jobId: job.id,
            assignedTechId: tech,
            jobTechIds,
            signerName: (signer as string).trim(),
            signedAt: sentAt,
            storagePath: key,
          },
          expectJob,
        );
      }
      // minutesOnJob is information only: pay hours come from TimeX.
      await store.updateJob(
        job.id,
        {
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
        },
        expectStatus,
        visitWrite({ status: "Done", completedAt: sentAt }),
      );
      return { ok: true };
    }
    case "jobs":
      return fail("invalid") as WriteOutcome;
  }
}

/**
 * Contract 3: open jobs, scheduled -7..+14 days, and jobs completed or cancelled today. A
 * multi-visit job is listed while the tech has a visit still open on it, or did one today; its
 * time is the tech's own visit, and `visits`, `currentVisitId`, `myVisitId` and `canAct` say
 * where the job stands (docs/VISITS.md). A job with no visits lists its one implied visit.
 */
async function listJobs(
  store: BridgeStore,
  identityId: string,
  opts: BridgeOptions,
): Promise<Reply> {
  const now = opts.now;
  const today = dayIn(now, opts.timeZone);
  const from = now.getTime() - 7 * 86_400_000;
  const to = now.getTime() + 14 * 86_400_000;
  const candidates = await store.jobsAssignedTo(identityId);
  const visitsOf = new Map<string, BVisit[]>();
  for (const j of candidates) visitsOf.set(j.id, liveVisits(await store.visits(j.id)));
  const jobs = candidates.filter((j) => {
    const vs = visitsOf.get(j.id)!;
    if (vs.length) {
      const mine = vs.filter((v) => v.assignedTechId === identityId);
      if (!mine.length) return false;
      if (mine.some((v) => OPEN_VISIT.includes(v.status))) return OPEN.includes(j.status);
      return (
        (!!j.completedAt && dayIn(j.completedAt, opts.timeZone) === today) ||
        mine.some((v) => !!v.completedAt && dayIn(v.completedAt, opts.timeZone) === today)
      );
    }
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
    const reviewNotes = j.reviewNote?.trim()
      ? [
          {
            id: `review-${j.id}`,
            text: `Sent back: ${j.reviewNote.trim()}`,
            at: j.officeChangedAt ?? j.updatedAt,
            by: "Office",
          },
        ]
      : [];
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
    const vs = visitsOf.get(j.id)!;
    const current = vs.find((v) => OPEN_VISIT.includes(v.status)) ?? null;
    const mineOpen = vs.find(
      (v) => v.assignedTechId === identityId && OPEN_VISIT.includes(v.status),
    );
    const mine = mineOpen ?? [...vs].reverse().find((v) => v.assignedTechId === identityId) ?? null;
    const visitList = vs.length
      ? vs.map((v) => ({
          id: v.id,
          number: v.number,
          scheduledStart: v.scheduledStart,
          scheduledEnd: v.scheduledEnd,
          status: v.status,
          mine: v.assignedTechId === identityId,
          completedAt: v.completedAt,
          note: v.note,
        }))
      : [
          {
            id: impliedVisitId(j.id),
            number: 1,
            scheduledStart: j.scheduledStart,
            scheduledEnd: j.scheduledEnd,
            status: impliedVisitStatus(j),
            mine: true,
            completedAt: j.completedAt,
            note: null,
          },
        ];
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
      // The tech's own visit time on a multi-visit job.
      scheduledStart: mine ? mine.scheduledStart : j.scheduledStart,
      scheduledEnd: mine ? mine.scheduledEnd : j.scheduledEnd,
      visits: visitList,
      currentVisitId: vs.length ? (current?.id ?? null) : impliedVisitId(j.id),
      myVisitId: vs.length ? (mine?.id ?? null) : impliedVisitId(j.id),
      /** The tech may change the job now (its current visit is theirs). */
      canAct: vs.length ? current?.assignedTechId === identityId : true,
      /** Complete is accepted now; otherwise end the visit with visit_done. */
      lastVisit: vs.length
        ? !!current && !vs.some((v) => v.id !== current.id && OPEN_VISIT.includes(v.status))
        : true,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      officeChangedAt: j.officeChangedAt ?? j.createdAt,
      // The office's send-back reason reaches the phone too (Codex review of PR #18).
      officeNote:
        [j.officeNote, j.reviewNote ? `Sent back: ${j.reviewNote}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      holdReason: j.status === "OnHold" ? holdCode(j.holdReason) : null,
      holdNote: j.status === "OnHold" ? j.holdNote : null,
      notes: [
        ...officeNotes,
        ...reviewNotes,
        ...notes
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((n) => ({ id: n.id, text: n.text, at: n.at, by: n.by })),
      ],
      photos: await Promise.all(
        photos
          .filter((p) => pathBelongsToJob(p.storagePath, j.id))
          .map(async (p) => ({
            id: p.id,
            url: await store.fileUrl(p.storagePath),
            caption: p.caption,
            at: p.createdAt,
          })),
      ),
      materials: j.materials ?? [],
      receipts: await Promise.all(
        // Only this tech's own receipts: amounts and personal payments are never shared
        // with the other techs on the job (Codex review of PR #21).
        receipts
          .filter((r) => r.assignedTechId === identityId)
          .map(async (r) => ({
            id: r.id,
            kind: r.kind,
            vendor: r.vendor,
            date: r.date,
            amount: r.amount,
            paidWith: r.paidWith,
            note: r.note,
            url:
              r.storagePath && pathBelongsToJob(r.storagePath, j.id)
                ? await store.fileUrl(r.storagePath)
                : null,
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
