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
import type { AuthApi, Backend, ChangeListener, FilesApi, Repo, SpectrumApi } from "../backend";
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
  NewOpportunity,
  NewSignature,
  NewSite,
  NewUser,
  Opportunity,
  Role,
  Signature,
  SignInResult,
  NewSpectrumCheck,
  Site,
  SpectrumCheck,
  TableName,
  TechNote,
  NewTechNote,
  TechReceipt,
  NewTechReceipt,
  Visit,
  NewVisit,
  JobMaterial,
  User,
} from "../types";
import {
  refusal,
  SPECTRUM_ERROR_CODES,
  type SpectrumReply,
} from "../../../amplify/functions/spectrum/contract";

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
  /** a.json fields arrive as a JSON string or as the value itself. */
  const jsonList = <T>(v: unknown): T[] | null => {
    try {
      const x = typeof v === "string" ? JSON.parse(v) : v;
      return Array.isArray(x) ? (x as T[]) : null;
    } catch {
      return null;
    }
  };
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
  /** a.string().array() fields: drop the nulls AppSync allows inside the list. */
  const ids = (v: (string | null)[] | null | undefined): string[] | null =>
    v ? v.filter((x): x is string => typeof x === "string") : null;

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
    spectrumCompanyCode: text(r.spectrumCompanyCode),
    spectrumCustomerCode: text(r.spectrumCustomerCode),
  });
  const mapSite = (r: Row<"Site">): Site => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    customerId: r.customerId,
    name: text(r.name),
    address: r.address,
    accessNotes: text(r.accessNotes),
    spectrumCompanyCode: text(r.spectrumCompanyCode),
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
    holdReason: text(r.holdReason),
    reviewNote: text(r.reviewNote),
    reviewedAt: text(r.reviewedAt),
    opportunityId: text(r.opportunityId),
    workType: (r.workType ?? null) as Job["workType"],
    health: (r.health ?? null) as Job["health"],
    startDate: text(r.startDate),
    endDate: text(r.endDate),
    poReceived: !!r.poReceived,
    materialOrdered: !!r.materialOrdered,
    materialDelivered: !!r.materialDelivered,
    liftConnex: !!r.liftConnex,
    serviceReportApproved: !!r.serviceReportApproved,
    completionPhotosOnFile: !!r.completionPhotosOnFile,
    spectrumCompanyCode: text(r.spectrumCompanyCode),
    spectrumJobNumber: text(r.spectrumJobNumber),
    spectrumWorkOrderNumber: text(r.spectrumWorkOrderNumber),
    holdNote: text(r.holdNote),
    officeChangedAt: text(r.officeChangedAt),
    officeNote: text(r.officeNote),
    noSignatureReason: (r.noSignatureReason ?? null) as Job["noSignatureReason"],
    noSignatureNote: text(r.noSignatureNote),
    materials: jsonList<JobMaterial>(r.materials),
    materialsAt: text(r.materialsAt),
    techStatusAt: text(r.techStatusAt),
    visitTechIds: ids(r.visitTechIds),
  });
  const mapVisit = (r: Row<"Visit">): Visit => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    number: r.number,
    scheduledStart: text(r.scheduledStart),
    scheduledEnd: text(r.scheduledEnd),
    assignedTechId: text(r.assignedTechId),
    jobTechIds: ids(r.jobTechIds),
    status: (r.status ?? "Scheduled") as Visit["status"],
    startedAt: text(r.startedAt),
    completedAt: text(r.completedAt),
    holdReason: text(r.holdReason),
    note: text(r.note),
  });
  const mapTechNote = (r: Row<"TechNote">): TechNote => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    assignedTechId: text(r.assignedTechId),
    jobTechIds: ids(r.jobTechIds),
    text: r.text,
    by: text(r.by),
    at: r.at,
    actionId: text(r.actionId),
  });
  const mapTechReceipt = (r: Row<"TechReceipt">): TechReceipt => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    assignedTechId: text(r.assignedTechId),
    kind: r.kind === "materials" ? "materials" : "other",
    vendor: text(r.vendor),
    date: text(r.date),
    amount: r.amount,
    paidWith: r.paidWith === "personal" ? "personal" : "company_card",
    note: text(r.note),
    storagePath: text(r.storagePath),
    at: r.at,
    actionId: text(r.actionId),
    reviewStatus: (["Approved", "Rejected"].includes(r.reviewStatus)
      ? r.reviewStatus
      : "Pending") as TechReceipt["reviewStatus"],
    reviewNote: text(r.reviewNote),
    reviewedBy: text(r.reviewedBy),
    reviewedAt: text(r.reviewedAt),
  });
  const mapSpectrumCheck = (r: Row<"SpectrumCheck">): SpectrumCheck => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    result: r.result === "connected" ? "connected" : "failed",
    reason: text(r.reason),
    message: text(r.message),
    durationMs: num(r.durationMs),
    checkedBy: r.checkedBy,
  });
  const mapOpportunity = (r: Row<"Opportunity">): Opportunity => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    name: r.name,
    customerId: text(r.customerId),
    customerContract: (r.customerContract ?? "NonContract") as Opportunity["customerContract"],
    type: (r.type ?? "Service") as Opportunity["type"],
    stage: (r.stage ?? "Prospect") as Opportunity["stage"],
    customerContact: text(r.customerContact),
    invoiceContact: text(r.invoiceContact),
    eciQuoteNumber: text(r.eciQuoteNumber),
    workOrderNumber: text(r.workOrderNumber),
    customerPoNumber: text(r.customerPoNumber),
    quoteDue: text(r.quoteDue),
    expectedClose: text(r.expectedClose),
    siteVisitDate: text(r.siteVisitDate),
    salesRep: text(r.salesRep),
    priority: text(r.priority),
    probability: num(r.probability),
    hoursQuoted: num(r.hoursQuoted),
    quotedAmount: num(r.quotedAmount),
    forecastAmount: num(r.forecastAmount),
    jobCost: num(r.jobCost),
    invoicedAmount: num(r.invoicedAmount),
    quotedMargin: num(r.quotedMargin),
    completedMargin: num(r.completedMargin),
    notes: text(r.notes),
    nextStep: text(r.nextStep),
    nextStepDue: text(r.nextStepDue),
    nextStepRemind: !!r.nextStepRemind,
    closedAt: text(r.closedAt),
    jobId: text(r.jobId),
    importKey: text(r.importKey),
  });
  const mapAttachment = (r: Row<"Attachment">): Attachment => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
    assignedTechId: text(r.assignedTechId),
    jobTechIds: ids(r.jobTechIds),
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
    jobTechIds: ids(r.jobTechIds),
    signerName: r.signerName,
    storagePath: r.storagePath,
    signedAt: r.signedAt,
  });
  const mapInvoice = (r: Row<"Invoice">): Invoice => ({
    id: r.jobId,
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
    get: (args: object) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    create: (args: object) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    update: (args: object) => Promise<{ data: R | null; errors?: { message: string }[] }>;
    delete: (args: object) => Promise<{ errors?: { message: string }[] }>;
    onCreate: () => Sub;
    onUpdate: () => Sub;
    onDelete: () => Sub;
  };
  function repo<K extends keyof M & keyof Schema, T, N>(
    table: TableName,
    model: K,
    map: (r: Row<K>) => T,
    /** Field that identifies a row in the model ("id", or "jobId" for Invoice). */
    keyField: string,
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
        const r = await m.get({ [keyField]: id });
        fail(r.errors);
        return r.data ? map(r.data) : null;
      },
      async create(input, opts) {
        // A fixed id makes DynamoDB refuse a second create of the same row (conditional put).
        const r = await m.create({
          ...encode(input as Partial<N>),
          ...(opts?.id ? { [keyField]: opts.id } : {}),
        });
        fail(r.errors);
        if (!r.data) throw new Error(`${table}: create returned no row`);
        notify(table);
        return map(r.data);
      },
      async update(id, patch) {
        const r = await m.update({ [keyField]: id, ...encode(patch) });
        fail(r.errors);
        if (!r.data) throw new Error(`${table}: update returned no row`);
        notify(table);
        return map(r.data);
      },
      async remove(id) {
        const r = await m.delete({ [keyField]: id });
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

  /**
   * When the office reassigns a job, its attachments and signatures follow it so
   * the former tech loses access and the new tech gains it (Codex review of PR #1).
   * Objects already stored under the former tech's S3 prefix stay readable to
   * office and owner; the new tech sees the record but not the old file. Copying
   * objects between tech prefixes needs the new tech's storage id, which is only
   * known after their first sign-in: follow-up.
   */
  const retagFileRows = async (jobId: string, assignedTechId: string | null) => {
    // Tech notes and receipts too (Codex review of PR #18).
    const TABLE_OF = {
      Attachment: "attachments",
      Signature: "signatures",
      TechNote: "techNotes",
      TechReceipt: "techReceipts",
    } as const;
    for (const name of ["Attachment", "Signature", "TechNote", "TechReceipt"] as const) {
      const m = client.models[name] as unknown as LooseModel<{
        id: string;
        assignedTechId?: string | null;
      }>;
      let nextToken: string | null | undefined;
      do {
        const page = await m.list({
          filter: { jobId: { eq: jobId } },
          limit: 500,
          ...(nextToken ? { nextToken } : {}),
        });
        for (const row of page.data) {
          if ((row.assignedTechId ?? null) !== assignedTechId)
            await m.update({ id: row.id, assignedTechId });
        }
        nextToken = page.nextToken;
      } while (nextToken);
      notify(TABLE_OF[name]);
    }
  };
  const jobEncode = (n: Partial<NewJob>) => ({
    ...n,
    ...(n.materials !== undefined
      ? { materials: n.materials === null ? null : JSON.stringify(n.materials) }
      : {}),
  });
  const jobsBase = repo<"Job", Job, NewJob>("jobs", "Job", mapJob, "id", jobEncode);
  /** The office's own changes stamp officeChangedAt ("New to you / Changed" on the phone). */
  /**
   * Office edits stamp officeChangedAt; a tech's own status change in Serv1 advances
   * techStatusAt, so an older change still queued on the ECI1 phone cannot undo it.
   */
  const changeStamps = async (
    patch?: Partial<NewJob>,
  ): Promise<{ officeChangedAt?: string; techStatusAt?: string }> => {
    const me = await auth.currentUser();
    const now = new Date().toISOString();
    if (me?.role === "Admin" || me?.role === "Office") return { officeChangedAt: now };
    if (me?.role === "Tech" && patch?.status !== undefined) return { techStatusAt: now };
    return {};
  };
  const jobsRepo: Repo<Job, NewJob> = {
    ...jobsBase,
    async create(input, opts) {
      return jobsBase.create({ ...input, ...(await changeStamps()) }, opts);
    },
    async update(id, patch) {
      return jobsBase.update(id, { ...patch, ...(await changeStamps(patch)) });
    },
  };
  const jobs: Repo<Job, NewJob> = {
    ...jobsRepo,
    async update(id, patch) {
      const before = patch.assignedTechId !== undefined ? await jobsRepo.get(id) : null;
      const after = await jobsRepo.update(id, patch);
      // A multi-visit job's rows keep their own tech (the others read them through jobTechIds);
      // re-tagging would hand one tech's receipts to the next (Codex review of PR #21).
      if (
        before &&
        before.assignedTechId !== after.assignedTechId &&
        !(after.visitTechIds ?? []).length
      )
        await retagFileRows(id, after.assignedTechId);
      return after;
    },
  };

  /**
   * Spectrum calls go to the server-side `spectrum` query; the function signs them
   * (amplify/functions/spectrum). The browser never sees connector credentials.
   */
  const spectrum: SpectrumApi = {
    async call(operation, params) {
      type Query = (args: object) => Promise<{ data: unknown; errors?: { message: string }[] }>;
      const q = (client.queries as unknown as { spectrum?: Query }).spectrum;
      if (!q) return refusal("internal", "Spectrum is not connected in this Serv1 yet.") as never;
      try {
        const r = await q({ operation, params: JSON.stringify(params ?? {}) });
        const reply = (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as SpectrumReply;
        const known =
          reply?.ok === true ||
          (reply?.ok === false &&
            (SPECTRUM_ERROR_CODES as readonly string[]).includes(reply.error?.code));
        return (known ? reply : refusal("internal")) as never;
      } catch {
        return refusal("internal") as never;
      }
    },
  };

  return {
    kind: "amplify",
    auth,
    users: repo<"User", User, NewUser>("users", "User", mapUser, "id", plain),
    customers: repo<"Customer", Customer, NewCustomer>(
      "customers",
      "Customer",
      mapCustomer,
      "id",
      plain,
    ),
    sites: repo<"Site", Site, NewSite>("sites", "Site", mapSite, "id", plain),
    jobs,
    attachments: repo<"Attachment", Attachment, NewAttachment>(
      "attachments",
      "Attachment",
      mapAttachment,
      "id",
      plain,
    ),
    signatures: repo<"Signature", Signature, NewSignature>(
      "signatures",
      "Signature",
      mapSignature,
      "id",
      plain,
    ),
    invoices: repo<"Invoice", Invoice, NewInvoice>(
      "invoices",
      "Invoice",
      mapInvoice,
      "jobId",
      invoiceEncode,
    ),
    opportunities: repo<"Opportunity", Opportunity, NewOpportunity>(
      "opportunities",
      "Opportunity",
      mapOpportunity,
      "id",
      plain,
    ),
    spectrumChecks: repo<"SpectrumCheck", SpectrumCheck, NewSpectrumCheck>(
      "spectrumChecks",
      "SpectrumCheck",
      mapSpectrumCheck,
      "id",
      plain,
    ),
    spectrum,
    techNotes: repo<"TechNote", TechNote, NewTechNote>(
      "techNotes",
      "TechNote",
      mapTechNote,
      "id",
      plain,
    ),
    techReceipts: repo<"TechReceipt", TechReceipt, NewTechReceipt>(
      "techReceipts",
      "TechReceipt",
      mapTechReceipt,
      "id",
      plain,
    ),
    visits: repo<"Visit", Visit, NewVisit>("visits", "Visit", mapVisit, "id", plain),
    files: filesApi,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
