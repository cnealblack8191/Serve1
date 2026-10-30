import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Context,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage } from "@/lib/comms/comms.functions";
import { templateFor } from "@/lib/comms/types";
import { registerGeneratedDocument } from "@/lib/sharepoint/documents.functions";
import { DEFAULT_MARKUP_TABLE, seedPendingSync } from "./data";
import { AUTO_REMINDER_DEFAULTS } from "./reminders";
import {
  emailFromRow,
  emailToRow,
  fieldPhotoPool,
  fromRow,
  reminderFromRow,
  reminderToRow,
  toRow,
  uid,
  workOrderFromRow,
  workOrderToRow,
} from "./db";
import {
  ROLE_PRESETS,
  type ActivityEntry,
  type AppNotification,
  type ApprovalRecord,
  type Bid,
  type EmailRecord,
  type Employee,
  type Reminder,
  type Invoice,
  type InvoiceStatus,
  type Job,
  type LineItem,
  type MaterialRequest,
  type MarkupRow,
  type MaterialStatus,
  type QuoteFormat,
  type RateType,
  type Opportunity,
  type OpportunitySource,
  type OpportunityStage,
  type PendingSyncItem,
  type Permission,
  type Receipt,
  type Role,
  type SyncState,
  type WorkOrder,
  type WorkOrderStatus,
} from "./types";

export const lineCost = (l: LineItem) => l.qty * l.unitCost;
export const lineSell = (l: LineItem) => lineCost(l) * (1 + l.markup / 100);
export const bidTotals = (items: LineItem[]) => {
  const cost = items.reduce((s, l) => s + lineCost(l), 0);
  const sell = items.reduce((s, l) => s + lineSell(l), 0);
  return { cost, sell, margin: sell === 0 ? 0 : ((sell - cost) / sell) * 100 };
};

export const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const now = () =>
  new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const entry = (
  kind: ActivityEntry["kind"],
  message: string,
  actor: string,
): ActivityEntry => ({ id: uid("ACT"), kind, message, actor, at: now() });

export interface NewOpportunityInput {
  name: string;
  customer: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  address: string;
  jobType: string;
  division: string;
  expectedBidDate: string;
  description: string;
  notes: string;
  assignedTo: string;
  value: number;
  documentName?: string;
  newCustomer?: boolean;
  /** Effective rate type: the customer default unless overridden on the form. */
  rateType?: RateType;
  /** Set when the form was pre-filled by the AI email import. */
  source?: "ai-email-import";
}

/** One row from a Smartsheets export, already mapped onto Opportunity fields. */
export interface ImportedOpportunityInput {
  name: string;
  customer: string;
  contactName: string;
  address: string;
  jobType: string;
  division: string;
  expectedBidDate: string;
  description: string;
  notes: string;
  assignedTo: string;
  value: number;
  stage: OpportunityStage;
  source?: Exclude<OpportunitySource, "Manual">;
}

export interface CustomerRecord {
  id: string;
  name: string;
  billingAddress: string;
  contactEmail: string;
  contactPhone: string;
  rateType: RateType;
  quoteFormat: QuoteFormat;
  markupTable: MarkupRow[];
}

interface StoreValue {
  // auth
  session: Session | null;
  authReady: boolean;
  accountRole: Role;
  roleReady: boolean;
  /** False when the account has no role row yet: signed in, but no permissions. */
  hasRole: boolean;
  /** Account owner: unlocks sensitive setup screens. Not a role. */
  isOwner: boolean;
  signOut: () => Promise<void>;

  role: Role;
  setRole: (r: Role) => void;
  currentUser: string;
  permissions: Permission[];
  exceptions: Permission[];
  toggleException: (p: Permission) => void;
  restrictToAssigned: boolean;
  setRestrictToAssigned: (v: boolean) => void;
  can: (p: Permission) => boolean;

  storageProvider: "OneDrive / SharePoint" | "AWS S3";
  setStorageProvider: (v: "OneDrive / SharePoint" | "AWS S3") => void;
  notificationPrefs: Record<string, boolean>;
  toggleNotificationPref: (k: string) => void;

  customers: string[];
  customerRecords: CustomerRecord[];
  addCustomer: (
    name: string,
    extra?: Partial<Omit<CustomerRecord, "id" | "name">>,
  ) => void;

  employees: Employee[];
  addEmployee: (input: {
    name: string;
    role: Role;
    phone: string;
    email: string;
  }) => void;
  setEmployeeActive: (id: string, active: boolean) => void;
  updateEmployee: (id: string, patch: { name: string; role: Role; phone: string; email: string }) => void;
  removeEmployee: (id: string) => void;

  opportunities: Opportunity[];
  bids: Bid[];
  jobs: Job[];
  workOrders: WorkOrder[];
  materials: MaterialRequest[];
  invoices: Invoice[];
  receipts: Receipt[];
  emails: EmailRecord[];
  reminders: Reminder[];
  notifications: AppNotification[];
  pendingSync: PendingSyncItem[];
  online: boolean;
  loading: boolean;

  createOpportunity: (input: NewOpportunityInput) => string;
  /** Bulk-create opportunities from a Smartsheets CSV/Excel export. Returns created ids. */
  importOpportunities: (rows: ImportedOpportunityInput[]) => string[];
  setOpportunityStage: (id: string, stage: OpportunityStage) => void;
  approveToEstimate: (id: string) => string;
  addOpportunityNote: (id: string, note: string) => void;
  addReminder: (input: {
    recordId: string;
    title: string;
    due: string;
    assignedTo: string;
    note?: string;
  }) => void;
  toggleReminder: (id: string) => void;
  removeReminder: (id: string) => void;
  sendRecordEmail: (
    recordId: string,
    to: string,
    subject: string,
    body: string,
  ) => void;

  addLineItem: (bidId: string, item?: Partial<LineItem>) => void;
  updateLineItem: (bidId: string, itemId: string, patch: Partial<LineItem>) => void;
  removeLineItem: (bidId: string, itemId: string) => void;
  importSpectrumItems: (bidId: string) => void;
  submitForApproval: (bidId: string, approvers: string[]) => void;
  decideApproval: (
    bidId: string,
    approvalId: string,
    status: "Approved" | "Rejected" | "Changes Requested",
    comment: string,
  ) => void;
  generateQuotePdf: (bidId: string) => void;
  sendQuote: (bidId: string, to: string, subject: string, body: string) => void;
  markBidWon: (bidId: string) => void;
  addBidPackageLink: (bidId: string, label: string, url: string) => void;
  removeBidPackageLink: (bidId: string, linkId: string) => void;
  createJobFromBid: (bidId: string) => string;
  retrySpectrum: (jobId: string) => void;
  setJobSync: (jobId: string, s: SyncState) => void;

  setMaterialStatus: (id: string, s: MaterialStatus, po?: string) => void;
  createMaterialRequest: (r: Omit<MaterialRequest, "id" | "status">) => void;
  approveMaterialRequest: (id: string) => void;
  setInvoiceStatus: (id: string, s: InvoiceStatus) => void;
  addInvoiceNote: (id: string, note: string) => void;
  updateReceipt: (id: string, patch: Partial<Receipt>) => void;
  setWorkOrderStatus: (id: string, s: WorkOrderStatus) => void;
  toggleTask: (woId: string, taskId: string) => void;
  addWorkOrderNote: (woId: string, note: string) => void;
  addWorkOrderPhoto: (woId: string, caption: string, src?: string) => void;
  completeWorkOrder: (
    woId: string,
    c: { summary: string; hours: string; materialsUsed: string; signedBy: string },
  ) => void;

  markNotificationsRead: () => void;
  setOnline: (v: boolean) => void;
  queueOffline: (item: Omit<PendingSyncItem, "id" | "at">) => void;
  resolveSyncItem: (id: string, keep: "device" | "server") => void;
  syncAll: () => void;
}

// Keep a single context instance even if this module is evaluated twice
// (dev HMR / mixed import specifiers can otherwise create duplicates).
const g = globalThis as unknown as {
  __eciCtx?: Context<StoreValue | null>;
};
const Ctx = g.__eciCtx ?? createContext<StoreValue | null>(null);
g.__eciCtx = Ctx;

/* ------------------------------------------------------------------ */
/* Generic table hook: React Query cache + optimistic writes to Cloud  */
/* ------------------------------------------------------------------ */

type TableName =
  | "customers"
  | "employees"
  | "opportunities"
  | "bids"
  | "line_items"
  | "approval_records"
  | "jobs"
  | "work_orders"
  | "material_requests"
  | "invoices"
  | "receipts"
  | "email_records"
  | "notifications"
  | "reminders";

const TABLES: TableName[] = [
  "customers",
  "employees",
  "opportunities",
  "bids",
  "line_items",
  "approval_records",
  "jobs",
  "work_orders",
  "material_requests",
  "invoices",
  "receipts",
  "email_records",
  "notifications",
  "reminders",
];

type AnyRow = Record<string, unknown>;
// The tables are generic CRUD targets; keep the client untyped here and map
// rows through the converters in ./db.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: TableName) => (supabase as any).from(table);

const keyFor = (table: TableName) => ["eci", table] as const;

function useTable<T extends { id: string }>(
  table: TableName,
  enabled: boolean,
  from: (row: AnyRow) => T,
  to: (entity: T) => AnyRow,
  order: { column: string; ascending: boolean } = { column: "created_at", ascending: false },
) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keyFor(table),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db(table)
        .select("*")
        .order(order.column, { ascending: order.ascending });
      if (error) throw error;
      return (data as AnyRow[]).map(from);
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const report = (e: { message: string }) =>
    toast.error("Couldn't save to Lovable Cloud", { description: e.message });

  const save = useCallback(
    (entities: T[], { prepend = false } = {}) => {
      if (entities.length === 0) return;
      qc.setQueryData<T[]>(keyFor(table), (prev = []) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        const fresh = entities.filter((e) => !map.has(e.id));
        const merged = prev.map((p) => entities.find((e) => e.id === p.id) ?? p);
        return prepend ? [...fresh, ...merged] : [...merged, ...fresh];
      });
      void db(table)
        .upsert(entities.map(to))
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            report(error);
            void qc.invalidateQueries({ queryKey: keyFor(table) });
          }
        });
    },
    [qc, table, to],
  );

  const remove = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      qc.setQueryData<T[]>(keyFor(table), (prev = []) => prev.filter((p) => !ids.includes(p.id)));
      void db(table)
        .delete()
        .in("id", ids)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            report(error);
            void qc.invalidateQueries({ queryKey: keyFor(table) });
          }
        });
    },
    [qc, table],
  );

  /** Read the latest cached rows (avoids stale closures inside mutations). */
  const current = useCallback(() => qc.getQueryData<T[]>(keyFor(table)) ?? [], [qc, table]);

  const patch = useCallback(
    (id: string, fn: (item: T) => T) => {
      const item = current().find((x) => x.id === id);
      if (item) save([fn(item)]);
    },
    [current, save],
  );

  return { rows, save, remove, patch, current, isLoading: query.isLoading };
}

/* ------------------------------------------------------------------ */

const NOTIFICATION_PREFS_DEFAULT: Record<string, boolean> = {
  "Opportunity or bid stage changes": true,
  "Quote awaiting approval": true,
  "Work order updates": true,
  "Material request status changes": true,
  "Invoice payment activity": false,
  ...AUTO_REMINDER_DEFAULTS,
};

export function EciProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  /* ---- auth & profile ---- */
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountRole, setAccountRole] = useState<Role>("Field");
  // Starts true so an established session never flashes the no-access screen
  // while ensure_profile is still in flight.
  const [hasRole, setHasRole] = useState(true);
  const [roleReady, setRoleReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [profileName, setProfileName] = useState<string>("");
  const [viewAs, setViewAs] = useState<Role | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setViewAs(null);
      setProfileName("");
      setIsOwner(false);
      qc.removeQueries({ queryKey: ["eci"] });
      return;
    }
    // Ensures a profile + role row exists and returns the account's role.
    void supabase.rpc("ensure_profile").then(({ data, error }) => {
      if (error) {
        toast.error("Couldn't load your profile", { description: error.message });
        setRoleReady(true);
        return;
      }
      const p = data as {
        role: Role;
        full_name: string | null;
        email: string;
        is_owner?: boolean;
      } | null;
      // ensure_profile returns a null role for an account an admin has created
      // but not yet assigned. accountRole keeps its placeholder for typing; the
      // hasRole flag is what gates access.
      if (p?.role) setAccountRole(p.role);
      setHasRole(!!p?.role);
      setIsOwner(!!p?.is_owner);
      setRoleReady(true);
      setProfileName(p?.full_name || p?.email || "");
    });
    // Saved notification preferences (drive the automatic reminder sweep).
    void supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const saved = (data?.notification_prefs ?? {}) as Record<string, boolean>;
        setNotificationPrefs({ ...NOTIFICATION_PREFS_DEFAULT, ...saved });
      });
  }, [userId, qc]);

  const signedIn = !!userId;

  /* ---- realtime: any change → refetch that table ---- */
  useEffect(() => {
    if (!signedIn) return;
    const channel = supabase.channel("eci-live");
    TABLES.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void qc.invalidateQueries({ queryKey: keyFor(table) }),
      );
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [signedIn, qc]);

  /* ---- local-only preferences ---- */
  const [exceptions, setExceptions] = useState<Permission[]>([]);
  const [restrictToAssigned, setRestrictToAssigned] = useState(false);
  const [storageProvider, setStorageProvider] = useState<
    "OneDrive / SharePoint" | "AWS S3"
  >("OneDrive / SharePoint");
  const [notificationPrefs, setNotificationPrefs] = useState(NOTIFICATION_PREFS_DEFAULT);
  const [pendingSync, setPendingSync] = useState<PendingSyncItem[]>(seedPendingSync);
  const [online, setOnline] = useState(true);

  /* ---- tables ---- */
  const customersT = useTable<CustomerRecord>(
    "customers",
    signedIn,
    (r) => fromRow<CustomerRecord>(r),
    (e) => toRow(e),
  );
  const employeesT = useTable<Employee>("employees", signedIn, fromRow, (e) => toRow(e));
  const oppsT = useTable<Opportunity>("opportunities", signedIn, fromRow, (e) => toRow(e));
  type BidRow = Omit<Bid, "lineItems" | "approvals">;
  const bidsT = useTable<BidRow>("bids", signedIn, fromRow, (e) => toRow(e));
  type LineRow = LineItem & { bidId: string; position: number };
  const linesT = useTable<LineRow>(
    "line_items",
    signedIn,
    fromRow,
    (e) => toRow(e),
    { column: "position", ascending: true },
  );
  type ApprovalRow = ApprovalRecord & { bidId: string };
  const approvalsT = useTable<ApprovalRow>(
    "approval_records",
    signedIn,
    fromRow,
    (e) => toRow(e),
    { column: "created_at", ascending: true },
  );
  const jobsT = useTable<Job>("jobs", signedIn, fromRow, (e) => toRow(e));
  const wosT = useTable<WorkOrder>("work_orders", signedIn, workOrderFromRow, workOrderToRow);
  const materialsT = useTable<MaterialRequest>("material_requests", signedIn, fromRow, (e) => toRow(e));
  const invoicesT = useTable<Invoice>("invoices", signedIn, fromRow, (e) => toRow(e));
  const receiptsT = useTable<Receipt>("receipts", signedIn, fromRow, (e) => toRow(e));
  const emailsT = useTable<EmailRecord>("email_records", signedIn, emailFromRow, emailToRow);
  const notificationsT = useTable<AppNotification>("notifications", signedIn, fromRow, (e) => toRow(e));
  const remindersT = useTable<Reminder>("reminders", signedIn, reminderFromRow, reminderToRow);

  const customers = useMemo(() => customersT.rows.map((c) => c.name), [customersT.rows]);

  const bids = useMemo<Bid[]>(
    () =>
      bidsT.rows.map((b) => ({
        ...b,
        packageLinks: b.packageLinks ?? [],
        lineItems: linesT.rows
          .filter((l) => l.bidId === b.id)
          .map(({ bidId: _b, position: _p, ...l }) => l),
        approvals: approvalsT.rows
          .filter((a) => a.bidId === b.id)
          .map(({ bidId: _b, ...a }) => a),
      })),
    [bidsT.rows, linesT.rows, approvalsT.rows],
  );

  const loading =
    signedIn &&
    (oppsT.isLoading || bidsT.isLoading || jobsT.isLoading || wosT.isLoading);

  /* ---- role & permissions ---- */
  const canManage = hasRole && ROLE_PRESETS[accountRole].includes("manage_permissions");
  const role: Role = canManage && viewAs ? viewAs : accountRole;
  const setRole = (r: Role) => {
    if (canManage) setViewAs(r === accountRole ? null : r);
  };

  const currentUser = profileName || session?.user.email || "ECI User";

  const permissions = useMemo(() => {
    // No role row means no permissions at all - exceptions must not re-grant any.
    if (!hasRole) return [];
    const base = new Set(ROLE_PRESETS[role]);
    exceptions.forEach((p) => (base.has(p) ? base.delete(p) : base.add(p)));
    return [...base];
  }, [hasRole, role, exceptions]);

  const can = useCallback((p: Permission) => permissions.includes(p), [permissions]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };

  const notify = useCallback(
    (n: Omit<AppNotification, "id" | "at" | "read">) =>
      notificationsT.save([{ ...n, id: uid("N"), at: "Just now", read: false }], { prepend: true }),
    [notificationsT.save],
  );

  const toggleException = (p: Permission) =>
    setExceptions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const toggleNotificationPref = (k: string) =>
    setNotificationPrefs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      if (userId) {
        void supabase
          .from("profiles")
          .update({ notification_prefs: next })
          .eq("id", userId)
          .then(({ error }) => {
            if (error) toast.error("Couldn't save notification preference", { description: error.message });
          });
      }
      return next;
    });

  /* ---- customers / employees ---- */
  const addCustomer: StoreValue["addCustomer"] = (name, extra) => {
    if (customersT.current().some((c) => c.name === name)) return;
    customersT.save(
      [
        {
          id: uid("CUST"),
          name,
          billingAddress: "",
          contactEmail: "",
          contactPhone: "",
          rateType: "Contract",
          quoteFormat: "Lump Sum",
          markupTable: DEFAULT_MARKUP_TABLE.map((r) => ({ ...r })),
          ...extra,
        },
      ],
      { prepend: true },
    );
  };

  const addEmployee: StoreValue["addEmployee"] = (input) => {
    employeesT.save([{ id: uid("EMP"), ...input, active: true, addedAt: now() }], { prepend: true });
    notify({
      kind: "stage",
      title: "Employee added",
      detail: `${input.name} (${input.role}) was added to the team.`,
    });
  };

  const setEmployeeActive = (id: string, active: boolean) =>
    employeesT.patch(id, (e) => ({ ...e, active }));

  const updateEmployee: StoreValue["updateEmployee"] = (id, patch) => {
    employeesT.patch(id, (e) => ({ ...e, ...patch }));
    notify({
      title: "Employee updated",
      detail: `${patch.name}'s details were saved.`,
      kind: "stage",
    });
  };

  const removeEmployee: StoreValue["removeEmployee"] = (id) => {
    const emp = employeesT.current().find((e) => e.id === id);
    employeesT.remove([id]);
    notify({
      title: "Employee removed",
      detail: `${emp?.name ?? "Employee"} was removed from the team.`,
      kind: "stage",
    });
  };

  /* ---- opportunities ---- */
  const createOpportunity = (input: NewOpportunityInput) => {
    const id = uid("OPP");
    const activity: ActivityEntry[] = [
      entry("stage", "Opportunity created in stage New Opportunity", input.assignedTo),
    ];
    if (input.newCustomer) {
      activity.unshift(entry("system", `New customer ${input.customer} created`, input.assignedTo));
    }
    if (input.source === "ai-email-import") {
      activity.unshift(
        entry("system", "Created via AI email import — fields extracted from a forwarded bid email and reviewed before saving", input.assignedTo),
      );
    }
    const {
      contactEmail,
      contactPhone,
      documentName,
      newCustomer: _nc,
      rateType,
      source: _src,
      ...rest
    } = input;
    const customerRate =
      customersT.current().find((c) => c.name === input.customer)?.rateType ?? "Contract";
    const opp: Opportunity = {
      id,
      ...rest,
      rateType: rateType ?? customerRate,
      stage: "New Opportunity",
      source: "Manual",
      contacts: [
        {
          id: uid("CT"),
          name: input.contactName || "Primary Contact",
          title: "Primary Contact",
          email: contactEmail || "contact@example.com",
          phone: contactPhone || "(770) 788-8082",
          primary: true,
        },
      ],
      documents: documentName
        ? [
            {
              id: uid("D"),
              name: documentName,
              kind: "PDF",
              size: "1.2 MB",
              uploadedBy: input.assignedTo,
              at: now(),
            },
          ]
        : [],
      activity,
    };
    oppsT.save([opp], { prepend: true });
    notify({
      kind: "stage",
      title: "New opportunity created",
      detail: `${input.name} assigned to ${input.assignedTo}.`,
    });
    return id;
  };

  const importOpportunities: StoreValue["importOpportunities"] = (rows) => {
    if (rows.length === 0) return [];
    const existing = customersT.current();
    const known = new Set(existing.map((c) => c.name.toLowerCase()));
    const newCustomers: CustomerRecord[] = [];
    for (const r of rows) {
      const key = r.customer.trim().toLowerCase();
      if (!key || known.has(key)) continue;
      known.add(key);
      newCustomers.push({
        id: uid("CUST"),
        name: r.customer.trim(),
        billingAddress: "",
        contactEmail: "",
        contactPhone: "",
        rateType: "Contract",
        quoteFormat: "Lump Sum",
        markupTable: DEFAULT_MARKUP_TABLE.map((m) => ({ ...m })),
      });
    }
    if (newCustomers.length) customersT.save(newCustomers, { prepend: true });
    const rateFor = (name: string) =>
      [...existing, ...newCustomers].find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
        ?.rateType ?? "Contract";
    const actor = currentUser || "Import";
    const opps: Opportunity[] = rows.map((r) => ({
      id: uid("OPP"),
      name: r.name,
      customer: r.customer.trim(),
      contactName: r.contactName,
      address: r.address,
      jobType: r.jobType,
      division: r.division,
      expectedBidDate: r.expectedBidDate,
      description: r.description,
      notes: r.notes,
      assignedTo: r.assignedTo,
      value: r.value,
      stage: r.stage,
      source: r.source ?? "Sales",
      rateType: rateFor(r.customer),
      contacts: r.contactName
        ? [
            {
              id: uid("CT"),
              name: r.contactName,
              title: "Primary Contact",
              email: "",
              phone: "",
              primary: true,
            },
          ]
        : [],
      documents: [],
      activity: [
        entry("system", "Imported from Smartsheets", actor),
        entry("stage", `Opportunity imported in stage ${r.stage}`, actor),
      ],
    }));
    oppsT.save(opps, { prepend: true });
    notify({
      kind: "stage",
      title: "Smartsheets import complete",
      detail: `${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} imported by ${actor}.`,
    });
    return opps.map((o) => o.id);
  };

  const logOpp = (id: string, e: ActivityEntry, extra: Partial<Opportunity> = {}) =>
    oppsT.patch(id, (o) => ({ ...o, ...extra, activity: [e, ...o.activity] }));

  const setOpportunityStage = (id: string, stage: OpportunityStage) => {
    logOpp(id, entry("stage", `Stage changed to ${stage}`, currentUser), { stage });
    notify({ kind: "stage", title: "Opportunity stage changed", detail: `${id} → ${stage}` });
  };

  const addOpportunityNote = (id: string, note: string) =>
    logOpp(id, entry("note", note, currentUser));

  const addReminder: StoreValue["addReminder"] = (input) => {
    remindersT.save(
      [
        {
          id: uid("REM"),
          recordId: input.recordId,
          title: input.title,
          due: input.due,
          assignedTo: input.assignedTo,
          note: input.note ?? "",
          done: false,
          createdAt: now(),
        },
      ],
      { prepend: true },
    );
    logOpp(
      input.recordId,
      entry(
        "reminder",
        `Reminder set for ${input.assignedTo}: ${input.title}${input.due ? ` (due ${input.due})` : ""}`,
        currentUser,
      ),
    );
  };

  const toggleReminder = (id: string) => remindersT.patch(id, (r) => ({ ...r, done: !r.done }));
  const removeReminder = (id: string) => remindersT.remove([id]);

  const sendRecordEmail: StoreValue["sendRecordEmail"] = (recordId, to, subject, body) => {
    emailsT.save([{ id: uid("EM"), to, subject, body, attachments: [], at: now(), recordId }], {
      prepend: true,
    });
    logOpp(recordId, entry("email", `Email sent to ${to}: ${subject}`, currentUser));
    notify({ kind: "stage", title: "Follow-up email sent", detail: `${recordId} → ${to}` });
  };

  const approveToEstimate = (id: string) => {
    const opp = oppsT.current().find((o) => o.id === id);
    const bidId = uid("BID");
    if (!opp) return bidId;
    bidsT.save(
      [
        {
          id: bidId,
          opportunityId: id,
          name: opp.name,
          customer: opp.customer,
          address: opp.address,
          division: opp.division,
          jobType: opp.jobType,
          owner: opp.assignedTo,
          stage: "Estimating",
          rateType: opp.rateType ?? "Contract",
          packageLinks: [],
          approvalGroup: "Standard Approval Group",
          pdfGenerated: false,
          activity: [entry("stage", `Bid created from opportunity ${id}`, currentUser)],
        },
      ],
      { prepend: true },
    );
    logOpp(id, entry("stage", `Approved to Estimate — bid ${bidId} created`, currentUser), {
      stage: "Approved to Estimate",
      bidId,
    });
    notify({ kind: "stage", title: "Approved to estimate", detail: `${opp.name} is now bid ${bidId}.` });
    return bidId;
  };

  /* ---- bids ---- */
  const logBid = (bidId: string, e: ActivityEntry, extra: Partial<BidRow> = {}) =>
    bidsT.patch(bidId, (b) => ({ ...b, ...extra, activity: [e, ...b.activity] }));

  const nextPosition = (bidId: string) =>
    linesT.current().filter((l) => l.bidId === bidId).length;

  const addLineItem = (bidId: string, item?: Partial<LineItem>) =>
    linesT.save([
      {
        id: uid("LI"),
        costCode: "16-100",
        category: "Labor",
        description: "New line item",
        customerDescription: "",
        qty: 1,
        unit: "EA",
        unitCost: 0,
        markup: 15,
        internalNote: "",
        ...item,
        bidId,
        position: nextPosition(bidId),
      },
    ]);

  const updateLineItem = (_bidId: string, itemId: string, patch: Partial<LineItem>) =>
    linesT.patch(itemId, (l) => ({ ...l, ...patch }));

  const removeLineItem = (_bidId: string, itemId: string) => linesT.remove([itemId]);

  const importSpectrumItems = (bidId: string) => {
    const pos = nextPosition(bidId);
    linesT.save([
      {
        id: uid("LI"),
        costCode: "16-100",
        category: "Labor",
        description: "Journeyman electrician (Spectrum cost code)",
        customerDescription: "Installation labor",
        qty: 120,
        unit: "HR",
        unitCost: 76,
        markup: 18,
        internalNote: "Imported from Spectrum cost code library.",
        bidId,
        position: pos,
      },
      {
        id: uid("LI"),
        costCode: "16-430",
        category: "Material",
        description: "Branch circuit material allowance",
        customerDescription: "Branch circuit materials",
        qty: 1,
        unit: "LS",
        unitCost: 18400,
        markup: 14,
        internalNote: "Imported from Spectrum estimate items.",
        bidId,
        position: pos + 1,
      },
    ]);
    logBid(bidId, entry("system", "Imported 2 cost codes from Spectrum", currentUser));
  };

  const submitForApproval = (bidId: string, approvers: string[]) => {
    approvalsT.remove(approvalsT.current().filter((a) => a.bidId === bidId).map((a) => a.id));
    approvalsT.save(
      approvers.map((a) => ({
        id: uid("AP"),
        bidId,
        approver: a,
        role: a === "Dana Whitfield" ? "Division Manager" : "Approver",
        status: "Pending" as const,
      })),
    );
    logBid(bidId, entry("stage", `Submitted for approval to ${approvers.join(", ")}`, currentUser), {
      stage: "Awaiting Approval",
    });
    notify({
      kind: "approval",
      title: "Quote awaiting approval",
      detail: `${bidId} was submitted and approvers were notified by email.`,
    });
  };

  const decideApproval: StoreValue["decideApproval"] = (bidId, approvalId, status, comment) => {
    const approvals = approvalsT
      .current()
      .filter((a) => a.bidId === bidId)
      .map((a) => (a.id === approvalId ? { ...a, status, comment, at: now() } : a));
    approvalsT.save(approvals);
    const allApproved = approvals.length > 0 && approvals.every((a) => a.status === "Approved");
    const bid = bidsT.current().find((b) => b.id === bidId);
    logBid(bidId, entry("stage", `${status} by approver${comment ? ` — "${comment}"` : ""}`, currentUser), {
      stage: allApproved
        ? "Ready to Send"
        : status === "Approved"
          ? (bid?.stage ?? "Awaiting Approval")
          : "Estimating",
    });
  };

  /**
   * Generating/previewing the quote never moves the bid forward — only a
   * complete approval round does (see decideApproval). That keeps
   * "Ready to Send" meaning "every approver has approved".
   */
  const generateQuotePdf = (bidId: string) => {
    bidsT.patch(bidId, (b) => ({
      ...b,
      pdfGenerated: true,
      activity: [
        entry("document", "Branded ECI quote PDF generated and Spectrum record prepared", currentUser),
        ...b.activity,
      ],
    }));
    // Generated documents are referenced against the bid so they file into the
    // record's SharePoint folder (immediately once Microsoft 365 is connected).
    const bid = bidsT.current().find((b) => b.id === bidId);
    if (bid) {
      void registerGeneratedDocument({
        data: {
          recordType: "bid",
          recordId: bid.id,
          name: bid.name,
          customer: bid.customer,
          fileName: `ECI-Quote-${bid.id}.pdf`,
          generatedKind: "proposal",
          label: "Proposal",
          createdBy: currentUser,
        },
      }).catch((e: unknown) => console.warn("Quote document not filed:", e));
    }
  };

  const sendQuote: StoreValue["sendQuote"] = (bidId, to, subject, body) => {
    const bid = bidsT.current().find((b) => b.id === bidId);
    if (bid && (bid.stage === "Estimating" || bid.stage === "Awaiting Approval")) {
      toast.error("Approval required before this quote can be sent", {
        description: "Every approver must approve before the quote can go to the customer.",
      });
      return;
    }
    emailsT.save(
      [
        {
          id: uid("EM"),
          to,
          subject,
          body,
          attachments: [`ECI-Quote-${bidId}.pdf`],
          at: now(),
          recordId: bidId,
        },
      ],
      { prepend: true },
    );
    logBid(bidId, entry("email", `Quote emailed to ${to} via Microsoft 365`, currentUser), {
      stage: "Sent to Customer",
      sentAt: now(),
    });
    notify({ kind: "stage", title: "Quote sent", detail: `${bidId} sent to ${to}.` });
  };

  const markBidWon = (bidId: string) => {
    logBid(bidId, entry("stage", "Bid marked Won", currentUser), { stage: "Won" });
    notify({ kind: "stage", title: "Bid won", detail: `${bidId} was marked Won. Create the job to continue.` });
  };

  const addBidPackageLink: StoreValue["addBidPackageLink"] = (bidId, label, url) => {
    const link = { id: uid("LNK"), label, url, addedBy: currentUser, at: now() };
    bidsT.patch(bidId, (b) => ({
      ...b,
      packageLinks: [...(b.packageLinks ?? []), link],
      activity: [entry("system", `Bid package link added — ${label}`, currentUser), ...b.activity],
    }));
  };

  const removeBidPackageLink: StoreValue["removeBidPackageLink"] = (bidId, linkId) =>
    bidsT.patch(bidId, (b) => ({
      ...b,
      packageLinks: (b.packageLinks ?? []).filter((l) => l.id !== linkId),
    }));

  const createJobFromBid = (bidId: string) => {
    const bid = bids.find((b) => b.id === bidId);
    const jobId = uid("JOB");
    if (!bid) return jobId;
    const opp = oppsT.current().find((o) => o.id === bid.opportunityId);
    const totals = bidTotals(bid.lineItems);
    const job: Job = {
      id: jobId,
      name: bid.name,
      phase: "Ph 1: Mobilization",
      customer: bid.customer,
      address: bid.address,
      status: "Active",
      division: bid.division,
      manager: bid.owner,
      spectrumNumber: "pending",
      contractValue: Math.round(totals.sell),
      spectrumSync: "Connecting",
      contacts: opp?.contacts ?? [],
      documents: [
        ...(opp?.documents ?? []),
        {
          id: uid("D"),
          name: `ECI-Quote-${bidId}.pdf`,
          kind: "PDF",
          size: "412 KB",
          uploadedBy: bid.owner,
          at: now(),
        },
      ],
      activity: [
        entry("system", `Job created from bid ${bidId} — contacts, documents, quote and history copied`, currentUser),
        ...(opp?.activity ?? []),
      ],
      bidId,
    };
    jobsT.save([job], { prepend: true });
    bidsT.patch(bidId, (b) => ({ ...b, jobId }));
    const tech = employeesT.current().find((e) => e.role === "Field" && e.active)?.name ?? "Unassigned";
    wosT.save(
      [
        {
          id: uid("WO"),
          number: `WO-${Math.floor(20500 + Math.random() * 400)}`,
          jobId,
          title: "Mobilization and site survey",
          technician: tech,
          priority: "Priority 2",
          status: "Scheduled",
          scheduled: "Next Monday, 7:30 AM",
          tasks: [{ id: uid("T"), label: "Site walk with customer", done: false }],
          notes: [],
        },
      ],
      { prepend: true },
    );
    return jobId;
  };

  /* ---- jobs ---- */
  const setJobSync = (jobId: string, s: SyncState) =>
    jobsT.patch(jobId, (j) => ({
      ...j,
      spectrumSync: s,
      spectrumNumber:
        s === "Synced" && j.spectrumNumber === "pending"
          ? `2026-${jobId.split("-")[1]}-A`
          : j.spectrumNumber,
      activity: [entry("system", `Spectrum integration: ${s}`, "System"), ...j.activity],
    }));

  const retrySpectrum = (jobId: string) => {
    setJobSync(jobId, "Connecting");
    setTimeout(() => setJobSync(jobId, "Synced"), 1400);
  };

  /* ---- materials / invoices / receipts ---- */
  const setMaterialStatus = (id: string, s: MaterialStatus, po?: string) => {
    const mr = materialsT.current().find((m) => m.id === id);
    materialsT.patch(id, (m) => ({ ...m, status: s, poNumber: po ?? m.poNumber }));
    notify({
      kind: "material",
      title: `Material request ${s.toLowerCase()}`,
      detail: `${mr?.item ?? id} — technician ${mr?.requestedBy ?? ""} notified.`,
    });
  };

  const emailForEmployee = (name: string) =>
    employeesT.current().find((e) => e.active && e.name.toLowerCase() === name.toLowerCase())
      ?.email ?? null;

  const materialLinks = (r: Pick<MaterialRequest, "jobId" | "workOrder">) => {
    const wo = wosT.current().find((w) => w.number === r.workOrder);
    const links = [{ recordType: "job", recordId: r.jobId }];
    if (wo) links.push({ recordType: "work_order", recordId: wo.id });
    return links;
  };

  const createMaterialRequest = (r: Omit<MaterialRequest, "id" | "status">) => {
    const id = uid("MR");
    materialsT.save([{ ...r, id, status: "Requested" } as MaterialRequest], { prepend: true });
    notify({ kind: "material", title: "Material requested", detail: `${r.item} for ${r.jobName}` });
    // Approval step 1: email the manager of that job/work order for approval.
    const job = jobsT.current().find((j) => j.id === r.jobId);
    const managerEmail = job ? emailForEmployee(job.manager) : null;
    if (managerEmail) {
      const t = templateFor("material_request", {
        name: r.jobName,
        item: r.item,
        qty: r.qty,
        technician: r.requestedBy,
        scheduled: r.workOrder,
        sender: currentUser,
      });
      void sendMessage({
        data: {
          to: [managerEmail],
          subject: t.subject,
          bodyHtml: t.body.replace(/\n/g, "<br>"),
          purpose: "material_request",
          sentByName: currentUser,
          links: materialLinks(r),
        },
      }).catch((e: unknown) => console.warn("Material approval email not sent:", e));
    } else {
      notify({
        kind: "material",
        title: "Manager email not found",
        detail: `No work email on file for ${job?.manager ?? "the job manager"} — approve ${r.item} manually.`,
      });
    }
  };

  const approveMaterialRequest: StoreValue["approveMaterialRequest"] = (id) => {
    const mr = materialsT.current().find((m) => m.id === id);
    if (!mr) return;
    materialsT.patch(id, (m) => ({ ...m, status: "Approved" }));
    notify({
      kind: "material",
      title: "Material request approved",
      detail: `${mr.item} approved — sent to the materials manager for ordering.`,
    });
    // Approval step 2: forward to the materials manager (coordinator) to order.
    const materialsManager =
      employeesT.current().find((e) => e.active && e.role === "Coordinator") ??
      employeesT.current().find((e) => e.active && e.role === "Admin");
    if (materialsManager) {
      const t = templateFor("material_approval", {
        name: mr.jobName,
        item: mr.item,
        qty: mr.qty,
        technician: mr.requestedBy,
        scheduled: mr.workOrder,
        sender: currentUser,
      });
      void sendMessage({
        data: {
          to: [materialsManager.email],
          subject: t.subject,
          bodyHtml: t.body.replace(/\n/g, "<br>"),
          purpose: "material_approval",
          sentByName: currentUser,
          links: materialLinks(mr),
        },
      }).catch((e: unknown) => console.warn("Materials manager email not sent:", e));
    }
  };

  const setInvoiceStatus = (id: string, s: InvoiceStatus) =>
    invoicesT.patch(id, (i) => ({ ...i, status: s, balance: s === "Paid" ? 0 : i.balance }));

  const addInvoiceNote = (id: string, note: string) =>
    invoicesT.patch(id, (i) => ({ ...i, notes: [note, ...i.notes] }));

  const updateReceipt = (id: string, patch: Partial<Receipt>) =>
    receiptsT.patch(id, (r) => ({ ...r, ...patch }));

  /* ---- work orders ---- */
  const setWorkOrderStatus = (id: string, s: WorkOrderStatus) => {
    wosT.patch(id, (w) => ({ ...w, status: s }));
    notify({ kind: "workorder", title: "Work order updated", detail: `${id} moved to ${s}.` });
  };

  const toggleTask = (woId: string, taskId: string) =>
    wosT.patch(woId, (w) => ({
      ...w,
      tasks: w.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    }));

  const addWorkOrderNote = (woId: string, note: string) =>
    wosT.patch(woId, (w) => ({ ...w, notes: [note, ...w.notes] }));

  const addWorkOrderPhoto = (woId: string, caption: string, src?: string) =>
    wosT.patch(woId, (w) => ({
      ...w,
      photos: [
        {
          id: uid("WP"),
          src: src ?? fieldPhotoPool[(w.photos?.length ?? 0) % fieldPhotoPool.length]!,
          caption: caption || "Site photo",
          at: `Today, ${now()}`,
        },
        ...(w.photos ?? []),
      ],
    }));

  const completeWorkOrder: StoreValue["completeWorkOrder"] = (woId, c) => {
    wosT.patch(woId, (w) => ({
      ...w,
      status: "Complete",
      tasks: w.tasks.map((t) => ({ ...t, done: true })),
      completion: { ...c, completedAt: `Today, ${now()}` },
    }));
    notify({ kind: "workorder", title: "Work order completed", detail: `${woId} closed out with ${c.hours} hrs.` });
  };

  /* ---- notifications / offline ---- */
  const markNotificationsRead = () =>
    notificationsT.save(notificationsT.current().filter((n) => !n.read).map((n) => ({ ...n, read: true })));

  const queueOffline = (item: Omit<PendingSyncItem, "id" | "at">) =>
    setPendingSync((prev) => [{ ...item, id: uid("PS"), at: `Captured offline ${now()}` }, ...prev]);

  const resolveSyncItem = (id: string) => setPendingSync((prev) => prev.filter((p) => p.id !== id));

  const syncAll = () => setPendingSync((prev) => prev.filter((p) => p.conflict));

  const value: StoreValue = {
    session,
    authReady,
    accountRole,
    roleReady,
    hasRole,
    isOwner,
    signOut,
    role,
    setRole,
    currentUser,
    permissions,
    exceptions,
    toggleException,
    restrictToAssigned,
    setRestrictToAssigned,
    can,
    storageProvider,
    setStorageProvider,
    notificationPrefs,
    toggleNotificationPref,
    customers,
    customerRecords: customersT.rows,
    addCustomer,
    employees: employeesT.rows,
    addEmployee,
    setEmployeeActive,
    updateEmployee,
    removeEmployee,
    opportunities: oppsT.rows,
    bids,
    jobs: jobsT.rows,
    workOrders: wosT.rows,
    materials: materialsT.rows,
    invoices: invoicesT.rows,
    receipts: receiptsT.rows,
    emails: emailsT.rows,
    reminders: remindersT.rows,
    notifications: notificationsT.rows,
    pendingSync,
    online,
    loading,
    createOpportunity,
    importOpportunities,
    setOpportunityStage,
    approveToEstimate,
    addOpportunityNote,
    addReminder,
    toggleReminder,
    removeReminder,
    sendRecordEmail,
    addLineItem,
    updateLineItem,
    removeLineItem,
    importSpectrumItems,
    submitForApproval,
    decideApproval,
    generateQuotePdf,
    sendQuote,
    markBidWon,
    addBidPackageLink,
    removeBidPackageLink,
    createJobFromBid,
    retrySpectrum,
    setJobSync,
    setMaterialStatus,
    createMaterialRequest,
    approveMaterialRequest,
    setInvoiceStatus,
    addInvoiceNote,
    updateReceipt,
    setWorkOrderStatus,
    toggleTask,
    addWorkOrderNote,
    addWorkOrderPhoto,
    completeWorkOrder,
    markNotificationsRead,
    setOnline,
    queueOffline,
    resolveSyncItem,
    syncAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEci() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEci must be used inside EciProvider");
  return ctx;
}
