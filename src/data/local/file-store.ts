/**
 * Demo-mode file storage. Blobs live in the browser's IndexedDB so a reload or a
 * second tab still shows photos and signatures (Codex review of PR #1). Object
 * URLs are recreated on read. In Node (unit tests) there is no IndexedDB and the
 * store falls back to memory only.
 */
const DB_NAME = "serv1.local.files";
const STORE = "files";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class LocalFileStore {
  private memory = new Map<string, Blob>();
  private urls = new Map<string, string>();

  async put(path: string, blob: Blob): Promise<void> {
    this.memory.set(path, blob);
    const db = await openDb();
    if (!db) return;
    try {
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, path));
    } catch {
      /* quota or private mode: memory copy still serves this session */
    }
  }

  async get(path: string): Promise<Blob | undefined> {
    const inMemory = this.memory.get(path);
    if (inMemory) return inMemory;
    const db = await openDb();
    if (!db) return undefined;
    try {
      const blob = (await request(
        db.transaction(STORE, "readonly").objectStore(STORE).get(path),
      )) as Blob | undefined;
      if (blob) this.memory.set(path, blob);
      return blob;
    } catch {
      return undefined;
    }
  }

  /** A display URL for the file, or "" when the file is unknown. */
  async url(path: string): Promise<string> {
    const cached = this.urls.get(path);
    if (cached) return cached;
    const blob = await this.get(path);
    if (!blob || typeof URL.createObjectURL !== "function") return "";
    const url = URL.createObjectURL(blob);
    this.urls.set(path, url);
    return url;
  }

  async remove(path: string): Promise<void> {
    const url = this.urls.get(path);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(path);
    this.memory.delete(path);
    const db = await openDb();
    if (!db) return;
    try {
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(path));
    } catch {
      /* ignore */
    }
  }
}
