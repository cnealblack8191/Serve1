import type { AuthApi, Backend, ChangeListener, FilesApi, Repo } from "../backend";
import { newId, nowIso } from "../backend";
import type {
  Attachment,
  AuthUser,
  BaseRecord,
  Job,
  Signature,
  SignInResult,
  TableName,
  User,
} from "../types";
import {
  DEMO_ACCOUNTS,
  LOCAL_PASSWORD,
  SEED_CUSTOMERS,
  SEED_JOBS,
  SEED_SITES,
  SEED_USERS,
} from "./seed";
import { LocalFileStore } from "./file-store";

/**
 * Local demo backend: runs entirely in the browser, persisted to localStorage,
 * so screens and Playwright tests work with no AWS account. It mirrors the
 * access rules the Amplify backend enforces: a tech sees, changes and adds only
 * jobs, attachments and signatures carrying their own identity.
 */
const STORAGE_KEY = "serv1.local.v1";
const SESSION_KEY = "serv1.local.session";

type Tables = Record<TableName, BaseRecord[]>;

function load(): Tables {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Tables;
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
    invoices: [],
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

export class NotAllowedError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "NotAllowedError";
  }
}

export function createLocalBackend(): Backend {
  let tables = load();
  const listeners = new Set<ChangeListener>();
  const files = new LocalFileStore(); // blobs persist in IndexedDB; see file-store.ts

  const persist = (table: TableName) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
    } catch {
      /* quota or private mode: keep in memory */
    }
    listeners.forEach((l) => l(table));
  };

  const session = (): AuthUser | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
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
        const me = session();
        return rows().filter((r) => rules.read(r, me));
      },
      async get(id) {
        const me = session();
        const row = rows().find((r) => r.id === id) ?? null;
        return row && rules.read(row, me) ? row : null;
      },
      async create(input) {
        const me = session();
        const row = {
          ...(input as object),
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        } as T;
        mustWrite(row, me, "create");
        tables = { ...tables, [table]: [...rows(), row] };
        persist(table);
        return row;
      },
      async update(id, patch) {
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

  const jobRules: Rules<Job> = {
    read: (job, me) => isOffice(me) || me?.role === "Owner" || techOwns(me, job.assignedTechId),
    // Office creates and edits everything; a tech may update (not create or delete) their own jobs.
    write: (job, me, op) =>
      isOffice(me) || (op === "update" && job !== null && techOwns(me, job.assignedTechId)),
  };

  /** Attachments and signatures: tagged with the job's tech; a tech reads and adds only their own. */
  const fileRowRules = <
    T extends { jobId: string; assignedTechId: string | null },
  >(): Rules<T> => ({
    read: (row, me) => isOffice(me) || me?.role === "Owner" || techOwns(me, row.assignedTechId),
    write: (row, me, op) => {
      if (isOffice(me)) return true;
      if (op !== "create" || row === null || !isTech(me)) return false;
      // A tech may add a row only for a job assigned to them, tagged with their own identity.
      const job = jobOf(row.jobId);
      return !!job && techOwns(me, job.assignedTechId) && row.assignedTechId === me?.identityId;
    },
  });

  /** When the office reassigns a job, its attachments and signatures follow it (Codex review of PR #1). */
  const retagFileRows = (jobId: string, assignedTechId: string | null) => {
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
    };
    persist("attachments");
    persist("signatures");
  };
  const jobsRepo = repo<Job, import("../types").NewJob>("jobs", jobRules);
  const jobsWithRetag: Repo<Job, import("../types").NewJob> = {
    ...jobsRepo,
    async update(id, patch) {
      const before = (tables.jobs as Job[]).find((j) => j.id === id);
      const after = await jobsRepo.update(id, patch);
      if (before && before.assignedTechId !== after.assignedTechId)
        retagFileRows(id, after.assignedTechId);
      return after;
    },
  };

  const filesApi: FilesApi = {
    async upload(path, file) {
      const me = session();
      if (isTech(me) && !path.startsWith(`tech-files/${me?.storageId}/`)) {
        throw new NotAllowedError("Techs may only write under their own tech-files prefix");
      }
      await files.put(path, file);
      return path;
    },
    async getUrl(path) {
      const me = session();
      if (isTech(me) && !path.startsWith(`tech-files/${me?.storageId}/`)) {
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
      read: (_r, me) => isOffice(me) || me?.role === "Owner",
      // Owners may change only the status (approve, mark paid), mirroring the field-level rule in Amplify.
      write: (_r, me, op, patch) =>
        isOffice(me) ||
        (op === "update" &&
          me?.role === "Owner" &&
          !!patch &&
          Object.keys(patch).every((k) => k === "status")),
    }),
    files: filesApi,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
