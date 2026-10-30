import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { backend } from "./backend";
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
  Role,
  Signature,
  Site,
  TableName,
  User,
} from "./types";

/** React hooks screens use to read and write data. All go through the backend contract. */
export const keys = {
  me: ["serv1", "me"] as const,
  table: (t: TableName) => ["serv1", t] as const,
  one: (t: TableName, id: string) => ["serv1", t, id] as const,
};

export const backendKind = () => backend().kind;
export const onDataChange = (listener: (table: TableName) => void) => backend().onChange(listener);

/** Mount once (the app shell does) so other users' changes refresh open screens. */
export function useDataChangeRefresh() {
  const qc = useQueryClient();
  useEffect(
    () => onDataChange((table) => void qc.invalidateQueries({ queryKey: keys.table(table) })),
    [qc],
  );
}

/** Admin and Office may create and edit customers, sites, jobs and invoices (SPEC.md section 2). */
export const isOfficeRole = (role: Role | undefined | null) =>
  role === "Admin" || role === "Office";

/** True when the signed-in person may use office editing controls. Screens hide or disable them otherwise. */
export function useIsOffice(): boolean {
  const me = useCurrentUser();
  return isOfficeRole(me.data?.role);
}

export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: keys.me,
    queryFn: () => backend().auth.currentUser(),
    staleTime: 60_000,
  });
}

function useTable<T>(table: TableName, list: () => Promise<T[]>) {
  return useQuery<T[]>({ queryKey: keys.table(table), queryFn: list });
}
function useOne<T>(
  table: TableName,
  id: string | undefined,
  get: (id: string) => Promise<T | null>,
) {
  return useQuery<T | null>({
    queryKey: keys.one(table, id ?? ""),
    queryFn: () => get(id!),
    enabled: !!id,
  });
}

export const useUsers = () => useTable<User>("users", () => backend().users.list());
export const useCustomers = () => useTable<Customer>("customers", () => backend().customers.list());
export const useCustomer = (id?: string) =>
  useOne<Customer>("customers", id, (i) => backend().customers.get(i));
export const useSites = () => useTable<Site>("sites", () => backend().sites.list());
export const useJobs = () => useTable<Job>("jobs", () => backend().jobs.list());
export const useJob = (id?: string) => useOne<Job>("jobs", id, (i) => backend().jobs.get(i));
export const useAttachments = () =>
  useTable<Attachment>("attachments", () => backend().attachments.list());
export const useSignatures = () =>
  useTable<Signature>("signatures", () => backend().signatures.list());
export const useInvoices = () => useTable<Invoice>("invoices", () => backend().invoices.list());

/** Techs: the list is already limited to their own jobs by the backend. */
export const useTechNames = () => {
  const users = useUsers();
  return { ...users, data: users.data?.filter((u) => u.role === "Tech" && u.active) };
};

type Repo<T, N> = {
  create(n: N): Promise<T>;
  update(id: string, p: Partial<N>): Promise<T>;
  remove(id: string): Promise<void>;
};
function useRepoMutations<T, N>(table: TableName, repo: () => Repo<T, N>) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.table(table) });
  const create = useMutation({ mutationFn: (n: N) => repo().create(n), onSuccess: refresh });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<N> }) => repo().update(v.id, v.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => repo().remove(id), onSuccess: refresh });
  return { create, update, remove };
}

export const useUserMutations = () =>
  useRepoMutations<User, NewUser>("users", () => backend().users);
export const useCustomerMutations = () =>
  useRepoMutations<Customer, NewCustomer>("customers", () => backend().customers);
export const useSiteMutations = () =>
  useRepoMutations<Site, NewSite>("sites", () => backend().sites);
export const useJobMutations = () => useRepoMutations<Job, NewJob>("jobs", () => backend().jobs);
export const useAttachmentMutations = () =>
  useRepoMutations<Attachment, NewAttachment>("attachments", () => backend().attachments);
export const useSignatureMutations = () =>
  useRepoMutations<Signature, NewSignature>("signatures", () => backend().signatures);
export const useInvoiceMutations = () =>
  useRepoMutations<Invoice, NewInvoice>("invoices", () => backend().invoices);
