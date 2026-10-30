import type { AuthApi, Backend, ChangeListener, FilesApi, Repo } from "../backend";
import { newId, nowIso } from "../backend";
import type { AuthUser, BaseRecord, Role, SignInResult, TableName } from "../types";
import {
  DEMO_ACCOUNTS,
  LOCAL_PASSWORD,
  SEED_CUSTOMERS,
  SEED_JOBS,
  SEED_SITES,
  SEED_USERS,
} from "./seed";

/**
 * Local demo backend: runs entirely in the browser, persisted to localStorage,
 * so screens and Playwright tests work with no AWS account. Mirrors the access
 * rules the Amplify backend enforces (a tech sees only their own jobs).
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
  } catch {
    /* ignore */
  }
}

export function createLocalBackend(): Backend {
  let tables = load();
  const listeners = new Set<ChangeListener>();
  const files = new Map<string, string>(); // path -> object URL (session only)

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

  function repo<T extends BaseRecord, N>(
    table: TableName,
    visible?: (row: T, me: AuthUser | null) => boolean,
  ): Repo<T, N> {
    const rows = () => tables[table] as T[];
    return {
      async list() {
        const me = session();
        const all = rows();
        return visible ? all.filter((r) => visible(r, me)) : [...all];
      },
      async get(id) {
        const me = session();
        const row = rows().find((r) => r.id === id) ?? null;
        if (row && visible && !visible(row, me)) return null;
        return row;
      },
      async create(input) {
        const row = {
          ...(input as object),
          id: newId(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        } as T;
        tables = { ...tables, [table]: [...rows(), row] };
        persist(table);
        return row;
      },
      async update(id, patch) {
        const idx = rows().findIndex((r) => r.id === id);
        if (idx < 0) throw new Error(`${table}: ${id} not found`);
        const row = { ...rows()[idx]!, ...(patch as object), updatedAt: nowIso() } as T;
        const next = [...rows()];
        next[idx] = row;
        tables = { ...tables, [table]: next };
        persist(table);
        return row;
      },
      async remove(id) {
        tables = { ...tables, [table]: rows().filter((r) => r.id !== id) };
        persist(table);
      },
    };
  }

  const isTech = (me: AuthUser | null) => me?.role === "Tech";
  const techOnlyOwn = <T extends { assignedTechId: string | null }>(row: T, me: AuthUser | null) =>
    !isTech(me) || row.assignedTechId === me?.identityId;

  const jobs = repo<import("../types").Job, import("../types").NewJob>("jobs", techOnlyOwn);
  const ownsJob = async (jobId: string, me: AuthUser | null) => {
    if (!isTech(me)) return true;
    const job = (tables.jobs as import("../types").Job[]).find((j) => j.id === jobId);
    return !!job && job.assignedTechId === me?.identityId;
  };

  const filesApi: FilesApi = {
    async upload(path, file) {
      const url = URL.createObjectURL(file);
      files.set(path, url);
      return path;
    },
    async getUrl(path) {
      return files.get(path) ?? "";
    },
    async remove(path) {
      const url = files.get(path);
      if (url) URL.revokeObjectURL(url);
      files.delete(path);
    },
  };

  const b: Backend = {
    kind: "local",
    auth,
    users: repo("users"),
    customers: repo("customers"),
    sites: repo("sites"),
    jobs,
    attachments: repo("attachments"),
    signatures: repo("signatures"),
    invoices: repo("invoices"),
    files: filesApi,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Techs may only attach files to their own jobs (same rule as the S3 policy intent).
  const guardJob = <T extends { jobId: string }, N extends { jobId: string }>(
    r: Repo<T, N>,
  ): Repo<T, N> => ({
    ...r,
    async list() {
      const me = session();
      const all = await r.list();
      if (!isTech(me)) return all;
      const own = new Set(
        (tables.jobs as import("../types").Job[])
          .filter((j) => j.assignedTechId === me?.identityId)
          .map((j) => j.id),
      );
      return all.filter((a) => own.has(a.jobId));
    },
    async create(input) {
      if (!(await ownsJob(input.jobId, session())))
        throw new Error("Not allowed: job is not assigned to you");
      return r.create(input);
    },
  });
  b.attachments = guardJob(b.attachments);
  b.signatures = guardJob(b.signatures);

  void (null as Role | null);
  return b;
}
