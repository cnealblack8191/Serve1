import { Amplify } from "aws-amplify";
import {
  confirmSignIn,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import { getUrl, remove as removeObject, uploadData } from "aws-amplify/storage";

import type { Schema } from "../../../amplify/data/resource";
import type { AuthApi, Backend, ChangeListener, FilesApi, Repo } from "../backend";
import type {
  Attachment,
  AuthUser,
  Customer,
  Invoice,
  InvoiceLineItem,
  Job,
  NewAttachment,
  NewCustomer,
  NewInvoice,
  NewJob,
  NewSignature,
  NewSite,
  NewUser,
  Role,
  Signature,
  SignInResult,
  Site,
  TableName,
  User,
} from "../types";

/**
 * Real backend: Cognito (login + groups), AppSync/DynamoDB (tables), S3 (files).
 * This is the only file in the app that imports aws-amplify runtime APIs for
 * data and storage; src/data/index.ts picks it when amplify_outputs.json exists.
 */
type Client = ReturnType<typeof generateClient<Schema>>;

const ROLE_ORDER: Role[] = ["Admin", "Owner", "Office", "Tech"];

export function createAmplifyBackend(outputs: object): Backend {
  Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
  const client: Client = generateClient<Schema>({ authMode: "userPool" });
  const listeners = new Set<ChangeListener>();
  const notify = (t: TableName) => listeners.forEach((l) => l(t));

  const auth: AuthApi = {
    async signIn(email, password): Promise<SignInResult> {
      try {
        const out = await amplifySignIn({ username: email.trim(), password });
        if (out.isSignedIn) return { kind: "done" };
        if (out.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
          return { kind: "newPasswordRequired" };
        }
        return {
          kind: "error",
          message: `Sign-in needs a step this app does not support yet (${out.nextStep.signInStep}).`,
        };
      } catch (e) {
        return { kind: "error", message: e instanceof Error ? e.message : "Could not sign in." };
      }
    },
    async completeNewPassword(newPassword): Promise<SignInResult> {
      try {
        const out = await confirmSignIn({ challengeResponse: newPassword });
        return out.isSignedIn
          ? { kind: "done" }
          : { kind: "error", message: "Password was not accepted." };
      } catch (e) {
        return {
          kind: "error",
          message: e instanceof Error ? e.message : "Could not set the password.",
        };
      }
    },
    async signOut() {
      await amplifySignOut();
    },
    async currentUser(): Promise<AuthUser | null> {
      try {
        const u = await getCurrentUser();
        const session = await fetchAuthSession();
        const groups =
          (session.tokens?.accessToken.payload["cognito:groups"] as string[] | undefined) ?? [];
        const roles = ROLE_ORDER.filter((r) => groups.includes(r));
        const attrs = await fetchUserAttributes().catch(
          () => ({}) as Record<string, string | undefined>,
        );
        const email = attrs.email ?? u.signInDetails?.loginId ?? "";
        return {
          identityId: `${u.userId}::${u.username}`,
          storageId: session.identityId ?? "",
          email,
          name: attrs.preferred_username ?? attrs.name ?? email,
          roles,
          role: roles[0] ?? "Tech",
        };
      } catch {
        return null;
      }
    },
  };

  const text = (v: string | null | undefined) => v ?? null;
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);

  type M = Client["models"];
  type Row<K extends keyof Schema> = Schema[K]["type"];

  const mapUser = (r: Row<"User">): User => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.name,
    email: r.email,
    role: (r.role ?? "Tech") as Role,
    phone: text(r.phone),
    active: r.active ?? true,
    identityId: text(r.identityId),
  });
  const mapCustomer = (r: Row<"Customer">): Customer => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.name,
    billingAddress: text(r.billingAddress),
    phone: text(r.phone),
    email: text(r.email),
    notes: text(r.notes),
  });
  const mapSite = (r: Row<"Site">): Site => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    customerId: r.customerId,
    name: text(r.name),
    address: r.address,
    accessNotes: text(r.accessNotes),
  });
  const mapJob = (r: Row<"Job">): Job => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobNumber: text(r.jobNumber),
    customerId: r.customerId,
    siteId: text(r.siteId),
    description: r.description,
    jobType: text(r.jobType),
    priority: (r.priority ?? "Normal") as Job["priority"],
    status: (r.status ?? "New") as Job["status"],
    assignedTechId: text(r.assignedTechId),
    scheduledStart: text(r.scheduledStart),
    scheduledEnd: text(r.scheduledEnd),
    startedAt: text(r.startedAt),
    completedAt: text(r.completedAt),
    notes: text(r.notes),
    laborHours: num(r.laborHours),
  });
  const mapAttachment = (r: Row<"Attachment">): Attachment => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    assignedTechId: text(r.assignedTechId),
    storagePath: r.storagePath,
    type: (r.type ?? "Document") as Attachment["type"],
    caption: text(r.caption),
    uploadedBy: text(r.uploadedBy),
  });
  const mapSignature = (r: Row<"Signature">): Signature => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    assignedTechId: text(r.assignedTechId),
    signerName: r.signerName,
    storagePath: r.storagePath,
    signedAt: r.signedAt,
  });
  const mapInvoice = (r: Row<"Invoice">): Invoice => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    invoiceNumber: text(r.invoiceNumber),
    jobId: r.jobId,
    customerId: r.customerId,
    lineItems: (typeof r.lineItems === "string"
      ? JSON.parse(r.lineItems)
      : r.lineItems) as InvoiceLineItem[],
    total: r.total,
    status: (r.status ?? "Draft") as Invoice["status"],
    pdfPath: text(r.pdfPath),
  });

  /** Generic repo over one Amplify model. `encode` adapts domain input to the model's create/update input. */
  type Sub = {
    subscribe: (h: { next: () => void; error: (e: unknown) => void }) => {
      unsubscribe: () => void;
    };
  };
  type LooseModel<R> = {
    list: (
      args?: object,
    ) => Promise<{ data: R[]; errors?: { message: string }[]; nextToken?: string | null }>;
    get: (args: { id: string }) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    create: (args: object) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    update: (args: object) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    delete: (args: { id: string }) => Promise<{ errors?: { message: string }[] }>;
    onCreate: () => Sub;
    onUpdate: () => Sub;
    onDelete: () => Sub;
  };
  function repo<K extends keyof M & keyof Schema, T, N>(
    table: TableName,
    model: K,
    map: (r: Row<K>) => T,
    encode: (n: Partial<N>) => object,
  ): Repo<T, N> {
    // The generated model types are very deep; the glue is loosely typed here and
    // strongly typed at the boundary (the mappers above and the Repo interface).
    const m = client.models[model] as unknown as LooseModel<Row<K>>;
    const fail = (errors?: { message: string }[]) => {
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
    };
    // Other users' changes (e.g. dispatch assigning a job) reach open screens.
    let subscribed = false;
    const subscribeOnce = () => {
      if (subscribed || listeners.size === 0) return;
      subscribed = true;
      const h = { next: () => notify(table), error: () => undefined };
      m.onCreate().subscribe(h);
      m.onUpdate().subscribe(h);
      m.onDelete().subscribe(h);
    };
    return {
      async list() {
        subscribeOnce();
        const out: T[] = [];
        let nextToken: string | null | undefined;
        do {
          const page = await m.list(nextToken ? { nextToken, limit: 500 } : { limit: 500 });
          fail(page.errors);
          out.push(...page.data.map(map));
          nextToken = page.nextToken;
        } while (nextToken);
        return out;
      },
      async get(id) {
        const r = await m.get({ id });
        fail(r.errors);
        return r.data ? map(r.data) : null;
      },
      async create(input) {
        const r = await m.create(encode(input as Partial<N>));
        fail(r.errors);
        if (!r.data) throw new Error(`${table}: create returned no row`);
        notify(table);
        return map(r.data);
      },
      async update(id, patch) {
        const r = await m.update({ id, ...encode(patch) });
        fail(r.errors);
        if (!r.data) throw new Error(`${table}: update returned no row`);
        notify(table);
        return map(r.data);
      },
      async remove(id) {
        const r = await m.delete({ id });
        fail(r.errors);
        notify(table);
      },
    };
  }

  // Domain -> model input. Nulls are sent as-is (AppSync clears the field);
  // only JSON needs stringifying.
  const plain = (n: object) => ({ ...n });
  const invoiceEncode = (n: Partial<NewInvoice>) => ({
    ...n,
    ...(n.lineItems !== undefined ? { lineItems: JSON.stringify(n.lineItems) } : {}),
  });

  const filesApi: FilesApi = {
    async upload(path, file, contentType) {
      const r = await uploadData({ path, data: file, options: { contentType } }).result;
      return r.path;
    },
    async getUrl(path) {
      const r = await getUrl({ path, options: { expiresIn: 900 } });
      return r.url.toString();
    },
    async remove(path) {
      await removeObject({ path });
    },
  };

  return {
    kind: "amplify",
    auth,
    users: repo<"User", User, NewUser>("users", "User", mapUser, plain),
    customers: repo<"Customer", Customer, NewCustomer>("customers", "Customer", mapCustomer, plain),
    sites: repo<"Site", Site, NewSite>("sites", "Site", mapSite, plain),
    jobs: repo<"Job", Job, NewJob>("jobs", "Job", mapJob, plain),
    attachments: repo<"Attachment", Attachment, NewAttachment>(
      "attachments",
      "Attachment",
      mapAttachment,
      plain,
    ),
    signatures: repo<"Signature", Signature, NewSignature>(
      "signatures",
      "Signature",
      mapSignature,
      plain,
    ),
    invoices: repo<"Invoice", Invoice, NewInvoice>(
      "invoices",
      "Invoice",
      mapInvoice,
      invoiceEncode,
    ),
    files: filesApi,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
