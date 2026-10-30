import type {
  Attachment,
  AuthUser,
  Customer,
  Invoice,
  Job,
  NewAttachment,
  NewCustomer,
  NewInvoice,
  NewJob,
  NewSignature,
  NewSite,
  NewUser,
  Signature,
  SignInResult,
  Site,
  TableName,
  User,
} from "./types";

/**
 * The one contract between screens and the backend. Two implementations:
 *  - src/data/amplify  (Cognito + AppSync + S3) when amplify_outputs.json exists
 *  - src/data/local    (in-browser demo store) otherwise
 * Screens never import either implementation; they use the functions in index.ts.
 */
export interface Repo<T, N> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: N): Promise<T>;
  update(id: string, patch: Partial<N>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface AuthApi {
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Second step for accounts created by an admin with a temporary password. */
  completeNewPassword(newPassword: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  currentUser(): Promise<AuthUser | null>;
}

export interface FilesApi {
  /** Stores the file privately and returns its storage path (never a public URL). */
  upload(path: string, file: Blob, contentType: string): Promise<string>;
  /** Short-lived signed link for display. */
  getUrl(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}

export type ChangeListener = (table: TableName) => void;

export interface Backend {
  readonly kind: "amplify" | "local";
  auth: AuthApi;
  users: Repo<User, NewUser>;
  customers: Repo<Customer, NewCustomer>;
  sites: Repo<Site, NewSite>;
  jobs: Repo<Job, NewJob>;
  attachments: Repo<Attachment, NewAttachment>;
  signatures: Repo<Signature, NewSignature>;
  invoices: Repo<Invoice, NewInvoice>;
  files: FilesApi;
  /** Fires when any table changes (own writes and, on Amplify, other users' writes). */
  onChange(listener: ChangeListener): () => void;
}

let current: Backend | null = null;

export function setBackend(b: Backend) {
  current = b;
}

export function backend(): Backend {
  if (!current) throw new Error("src/data not configured: call configureBackend() first");
  return current;
}

export const nowIso = () => new Date().toISOString();
export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
