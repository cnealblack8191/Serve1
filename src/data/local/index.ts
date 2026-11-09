import type { AuthApi, Backend, ChangeListener, FilesApi, Repo } from "../backend";
import { newId, nowIso } from "../backend";
import type {
  Attachment,
  AuthUser,
  BaseRecord,
  Job,
  Visit,
  Signature,
  SignInResult,
  TableName,
  User,
} from "../types";
import { TABLES } from "../types";
import {
  DEMO_ACCOUNTS,
  LOCAL_PASSWORD,
  SEED_CUSTOMERS,
  SEED_INVOICES,
  SEED_JOBS,
  SEED_OPPORTUNITIES,
  SEED_SITES,
  SEED_TECH_NOTES,
  SEED_TECH_RECEIPTS,
  SEED_USERS,
  SEED_VISITS,
} from "./seed";
import { LocalFileStore } from "./file-store";
import { TECH_SETTABLE, techMayMove } from "../jobflow";
import { createFakeSpectrum } from "./spectrum-fake";

/**
 * Local demo backend: runs entirely in the browser, persisted to localStorage,
 * so screens and Playwright tests work with no AWS account. It mirrors the
 * access rules the Amplify backend enforces: a tech sees, changes and adds only
 * jobs, attachments and signatures carrying their own identity.
 */
// v3: Phase 2 adds opportunities and job tracking fields, so older demo data is re-seeded.
const STORAGE_KEY = "serv1.local.v3";
const SESSION_KEY = "serv1.local.session";

type Tables = Record<TableName, BaseRecord[]>;

function load(): Tables {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // A table missing from older demo data (e.g. Phase 4's spectrumChecks) starts empty.
    if (raw) {
      const empty = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tables;
      return { ...empty, ...(JSON.parse(raw) as Partial<Tables>) };
    }
  } catch {
    /* fall through to seed */
  }
  return {
    users: [...SEED_USERS],
    customers: [...SEED_CUSTOMERS],
    sites: [...SEED_SITES],
    jobs: [...SEED_JOBS],
    attachments: [],
    signatures: [],
    invoices: [...SEED_INVOICES],
    opportunities: [...SEED_OPPORTUNITIES],
    spectrumChecks: [],
    techNotes: [...SEED_TECH_NOTES],
    techReceipts: [...SEED_TECH_RECEIPTS],
    visits: [...SEED_VISITS],
  };
}

export function resetLocalData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export class DuplicateError extends Error {
  constructor(message = "Duplicate") {
    super(message);
    this.name = "DuplicateError";
  }
}

export class NotAllowedError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "NotAllowedError";
  }
}

export function createLocalBackend(): Backend {
  let tables = load();
  const listeners = new Set<ChangeListener>();
  /** Re-read the persisted store so a write never overwrites another tab's changes. */
  const refresh = () => {
    tables = load();
  };
  // Another tab wrote the store: pick it up and refresh open screens.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        refresh();
        listeners.forEach((l) => l("jobs"));
        listeners.forEach((l) => l("attachments"));
        listeners.forEach((l) => l("signatures"));
        listeners.forEach((l) => l("invoices"));
        listeners.forEach((l) => l("customers"));
        listeners.forEach((l) => l("sites"));
        listeners.forEach((l) => l("users"));
        listeners.forEach((l) => l("opportunities"));
        listeners.forEach((l) => l("spectrumChecks"));
        listeners.forEach((l) => l("techNotes"));
        listeners.forEach((l) => l("techReceipts"));
        listeners.forEach((l) => l("visits"));
      }
    });
  }
  const files = new LocalFileStore(); // blobs persist in IndexedDB; see file-store.ts

  /** Writes the store. A failed write (quota, blocked storage) rejects the mutation and
   *  drops the unsaved change so the screen never reports unsaved work as saved. */
  const persist = (table: TableName) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
    } catch {
      tables = load();
      throw new Error("Could not save: this browser's storage is full or blocked.");
    }
    listeners.forEach((l) => l(table));
  };

  /** The demo account's User record decides its role and whether it may sign in at all. */
  const applyRoster = (u: AuthUser): AuthUser | null => {
    const record = (tables.users as User[]).find((r) => r.identityId === u.identityId);
    if (!record) return u;
    if (!record.active) return null;
    return { ...u, name: record.name, role: record.role, roles: [record.role] };
  };
  const session = (): AuthUser | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? applyRoster(JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  };

  const auth: AuthApi = {
    async signIn(email, password): Promise<SignInResult> {
      const account = DEMO_ACCOUNTS.find(
        (a) => a.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!account || password !== LOCAL_PASSWORD) {
        return { kind: "error", message: "Incorrect email or password." };
      }
      const user: AuthUser = {
        identityId: account.identityId,
        storageId: account.identityId,
        email: account.email,
        name: account.name,
        roles: [account.role],
        role: account.role,
      };
      refresh();
      if (!applyRoster(user)) return { kind: "error", message: "This account is turned off." };
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      return { kind: "done" };
    },
    async completeNewPassword() {
      return { kind: "done" };
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
    },
    async currentUser() {
      return session();
    },
  };

  const isTech = (me: AuthUser | null) => me?.role === "Tech";
  const isOffice = (me: AuthUser | null) => me?.role === "Admin" || me?.role === "Office";

  /** Who may read a row, and who may write it. Writers must also be able to read it. */
  type Rules<T> = {
    /** Optional uniqueness check run on create against the existing rows. */
    unique?: (row: T, rows: T[]) => boolean;
    read: (row: T, me: AuthUser | null) => boolean;
    write: (
      row: T | null,
      me: AuthUser | null,
      op: "create" | "update" | "remove",
      patch?: object,
    ) => boolean;
  };

  function repo<T extends BaseRecord, N>(table: TableName, rules: Rules<T>): Repo<T, N> {
    const rows = () => tables[table] as T[];
    const mustRead = (row: T, me: AuthUser | null) => {
      if (!rules.read(row, me)) throw new NotAllowedError(`${table}: not visible to this account`);
    };
    const mustWrite = (
      row: T | null,
      me: AuthUser | null,
      op: "create" | "update" | "remove",
      patch?: object,
    ) => {
      if (!rules.write(row, me, op, patch))
        throw new NotAllowedError(`${table}: ${op} not allowed for this account`);
    };
    return {
      async list() {
        refresh();
        const me = session();
        return rows().filter((r) => rules.read(r, me));
      },
      async get(id) {
        refresh();
        const me = session();
        const row = rows().find((r) => r.id === id) ?? null;
        return row && rules.read(row, me) ? row : null;
      },
      async create(input, opts) {
        refresh();
        const me = session();
        if (opts?.id && rows().some((r) => r.id === opts.id))
          throw new DuplicateError(`${table}: ${opts.id} already exists`);
        const row = {
          ...(input as object),
          id: opts?.id ?? newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        } as T;
        mustWrite(row, me, "create");
        if (rules.unique && !rules.unique(row, rows())) {
          throw new DuplicateError(`${table}: a row with this key already exists`);
        }
        tables = { ...tables, [table]: [...rows(), row] };
        persist(table);
        return row;
      },
      async update(id, patch) {
        refresh();
        const me = session();
        const idx = rows().findIndex((r) => r.id === id);
        const existing = rows()[idx];
        if (idx < 0 || !existing) throw new Error(`${table}: ${id} not found`);
        mustRead(existing, me);
        mustWrite(existing, me, "update", patch as object);
        const row = { ...existing, ...(patch as object), updatedAt: nowIso() } as T;
        // The changed row must still be one this account may write (a tech cannot hand a job to someone else).
        mustWrite(row, me, "update", patch as object);
        const next = [...rows()];
        next[idx] = row;
        tables = { ...tables, [table]: next };
        persist(table);
        return row;
      },
      async remove(id) {
        refresh();
        const me = session();
        const existing = rows().find((r) => r.id === id);
        if (!existing) return;
        mustRead(existing, me);
        mustWrite(existing, me, "remove");
        tables = { ...tables, [table]: rows().filter((r) => r.id !== id) };
        persist(table);
      },
    };
  }

  const signedIn = (me: AuthUser | null) => me !== null;
  /** Office-managed tables: anyone signed in reads; Admin/Office write (SPEC.md section 2). */
  const officeOwned = <T>(): Rules<T> => ({
    read: (_r, me) => signedIn(me),
    write: (_r, me) => isOffice(me),
  });
  /** Users: everyone reads the roster (names for dispatch and dashboards); only Admin writes. */
  const userRules: Rules<User> = {
    read: (_r, me) => signedIn(me),
    write: (_r, me) => me?.role === "Admin",
  };

  const jobOf = (id: string) => (tables.jobs as Job[]).find((j) => j.id === id) ?? null;
  const techOwns = (me: AuthUser | null, techId: string | null) =>
    isTech(me) && techId !== null && techId === me?.identityId;
  /** A tech with a visit on the job (docs/VISITS.md): listed in the row's visit-tech ids. */
  const techListed = (me: AuthUser | null, ids: string[] | null | undefined) =>
    isTech(me) && !!me && (ids ?? []).includes(me.identityId);
  /** The assigned tech, or any tech with a visit on the job. */
  const techOnJob = (me: AuthUser | null, job: Job | null) =>
    !!job && (techOwns(me, job.assignedTechId) || techListed(me, job.visitTechIds));

  /** Fields a tech may change on their own job: the work itself, never the schedule or billing. */
  const TECH_FIELDS = new Set([
    "status",
    "startedAt",
    "completedAt",
    "notes",
    "laborHours",
    "holdReason",
    "holdNote",
    "techStatusAt",
  ]);
  const jobRules: Rules<Job> = {
    read: (job, me) => isOffice(me) || me?.role === "Owner" || techOnJob(me, job),
    // Office creates and edits everything; a tech may update (not create or delete) their own
    // jobs, only the work fields, and only to a status a tech may set (src/data/jobflow.ts).
    write: (job, me, op, patch) => {
      if (isOffice(me)) return true;
      // Only the assigned tech (the current visit's) updates the job; other visit techs read it.
      if (op !== "update" || job === null || !techOwns(me, job.assignedTechId)) return false;
      const p = (patch ?? {}) as Partial<Job>;
      if (
        !Object.keys(p).every(
          (k) => TECH_FIELDS.has(k) || k === "assignedTechId" || k === "visitTechIds",
        )
      )
        return false;
      if ("assignedTechId" in p && p.assignedTechId !== job.assignedTechId) return false;
      if ("visitTechIds" in p && String(p.visitTechIds) !== String(job.visitTechIds)) return false;
      return (
        p.status === undefined ||
        (TECH_SETTABLE.concat(job.status).includes(p.status) && techMayMove(job.status, p.status))
      );
    },
  };

  /** Attachments and signatures: tagged with the job's tech; a tech reads and adds only their own. */
  const fileRowRules = <
    T extends { jobId: string; assignedTechId: string | null; jobTechIds?: string[] | null },
  >(): Rules<T> => ({
    read: (row, me) =>
      isOffice(me) ||
      me?.role === "Owner" ||
      techOwns(me, row.assignedTechId) ||
      techListed(me, row.jobTechIds),
    write: (row, me, op) => {
      if (isOffice(me)) return true;
      if (op !== "create" || row === null || !isTech(me)) return false;
      // A tech may add a row only for a job they are on, tagged with their own identity.
      return techOnJob(me, jobOf(row.jobId)) && row.assignedTechId === me?.identityId;
    },
  });

  const techRowRules = <
    T extends { assignedTechId: string | null; jobTechIds?: string[] | null },
  >(): Rules<T> => ({
    read: (row, me) =>
      isOffice(me) ||
      me?.role === "Owner" ||
      techOwns(me, row.assignedTechId) ||
      techListed(me, row.jobTechIds),
    write: (_r, me) => isOffice(me),
  });

  /** Fields the visit's own tech may change: its progress, never its plan (mirrors Amplify). */
  const VISIT_TECH_FIELDS = new Set(["status", "startedAt", "completedAt", "holdReason", "note"]);
  const visitRules: Rules<Visit> = {
    read: (v, me) =>
      isOffice(me) ||
      me?.role === "Owner" ||
      techOwns(me, v.assignedTechId) ||
      techListed(me, v.jobTechIds),
    write: (v, me, op, patch) => {
      if (isOffice(me)) return true;
      if (op !== "update" || v === null || !techOwns(me, v.assignedTechId)) return false;
      return Object.keys(patch ?? {}).every((k) => VISIT_TECH_FIELDS.has(k));
    },
  };

  /** When the office reassigns a job, its attachments, signatures, tech notes and receipts follow
   *  it (Codex reviews of PRs #1 and #18). */
  const retagFileRows = (jobId: string, assignedTechId: string | null) => {
    refresh();
    const retag = <T extends { jobId: string; assignedTechId: string | null }>(rows: T[]) =>
      rows.map((r) =>
        r.jobId === jobId && r.assignedTechId !== assignedTechId
          ? { ...r, assignedTechId, updatedAt: nowIso() }
          : r,
      );
    tables = {
      ...tables,
      attachments: retag(tables.attachments as Attachment[]),
      signatures: retag(tables.signatures as Signature[]),
      techNotes: retag(tables.techNotes as import("../types").TechNote[]),
      techReceipts: retag(tables.techReceipts as import("../types").TechReceipt[]),
    };
    persist("attachments");
    persist("signatures");
    persist("techNotes");
    persist("techReceipts");
  };
  const jobsRepo = repo<Job, import("../types").NewJob>("jobs", jobRules);
  const jobsWithRetag: Repo<Job, import("../types").NewJob> = {
    ...jobsRepo,
    // The office's own changes stamp officeChangedAt ("New to you / Changed" on the tech's phone).
    async create(input, opts) {
      const stamp = isOffice(session()) ? { officeChangedAt: nowIso() } : {};
      return jobsRepo.create({ ...input, ...stamp }, opts);
    },
    async update(id, patch) {
      const before = (tables.jobs as Job[]).find((j) => j.id === id);
      if (isOffice(session())) patch = { ...patch, officeChangedAt: nowIso() };
      // A tech's own status change advances techStatusAt (late ECI1 sends can't undo it).
      else if (isTech(session()) && patch.status !== undefined)
        patch = { ...patch, techStatusAt: nowIso() };
      const after = await jobsRepo.update(id, patch);
      // A multi-visit job's rows keep their own tech (the others read them through jobTechIds);
      // re-tagging would hand one tech's receipts to the next (Codex review of PR #21).
      if (
        before &&
        before.assignedTechId !== after.assignedTechId &&
        !(after.visitTechIds ?? []).length
      )
        retagFileRows(id, after.assignedTechId);
      return after;
    },
  };

  const filesApi: FilesApi = {
    async upload(path, file) {
      const me = session();
      if (!me) throw new NotAllowedError("Sign in to upload files");
      if (isTech(me) && !path.startsWith(`tech-files/${me.storageId}/`)) {
        throw new NotAllowedError("Techs may only write under their own tech-files prefix");
      }
      if (!isTech(me) && !isOffice(me))
        throw new NotAllowedError("Owners can view files but not upload them");
      await files.put(path, file);
      return path;
    },
    async getUrl(path) {
      const me = session();
      if (!me) throw new NotAllowedError("Sign in to view files");
      if (isTech(me) && !path.startsWith(`tech-files/${me.storageId}/`)) {
        throw new NotAllowedError("Techs may only read their own files");
      }
      return files.url(path);
    },
    async remove(path) {
      const me = session();
      if (!isOffice(me)) throw new NotAllowedError("Only office accounts delete files");
      await files.remove(path);
    },
  };

  return {
    kind: "local",
    auth,
    users: repo<User, import("../types").NewUser>("users", userRules),
    customers: repo("customers", officeOwned()),
    sites: repo("sites", officeOwned()),
    jobs: jobsWithRetag,
    attachments: repo<Attachment, import("../types").NewAttachment>(
      "attachments",
      fileRowRules<Attachment>(),
    ),
    signatures: repo<Signature, import("../types").NewSignature>(
      "signatures",
      fileRowRules<Signature>(),
    ),
    invoices: repo("invoices", {
      // One invoice per job (mirrors the Amplify primary key on jobId).
      unique: (row, rows) =>
        !rows.some((r) => (r as { jobId: string }).jobId === (row as { jobId: string }).jobId),
      read: (_r, me) => isOffice(me) || me?.role === "Owner",
      // Owners may change only the status (approve, mark paid), mirroring the field-level rule in Amplify.
      write: (_r, me, op, patch) =>
        isOffice(me) ||
        (op === "update" &&
          me?.role === "Owner" &&
          !!patch &&
          Object.keys(patch).every((k) => k === "status")),
    }),
    // Sales pipeline: office edits, owner reads, techs see nothing (amounts live here).
    opportunities: repo("opportunities", {
      read: (_r, me) => isOffice(me) || me?.role === "Owner",
      write: (_r, me) => isOffice(me),
    }),
    // Spectrum connection tests: Admin only, add and remove (mirrors the Amplify rule).
    spectrumChecks: repo("spectrumChecks", {
      read: (_r, me) => me?.role === "Admin",
      write: (_r, me, op) => me?.role === "Admin" && op !== "update",
    }),
    spectrum: createFakeSpectrum(session),
    // Tech notes and receipts (ECI1 tech module): written by the bridge for the tech; office
    // reviews; a tech reads only rows on their own jobs.
    techNotes: repo("techNotes", techRowRules()),
    techReceipts: repo("techReceipts", techRowRules()),
    visits: repo<Visit, import("../types").NewVisit>("visits", visitRules),
    files: filesApi,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
