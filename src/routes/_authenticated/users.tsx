import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { EmptyState, Field, PageHeader } from "@/components/eci/primitives";
import { matches } from "@/components/serv1/office/matches";
import { SearchBox } from "@/components/serv1/office/SearchBox";
import { SELECT_CLASS } from "@/components/serv1/sales/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROLES, useUserMutations, useUsers, type Role, type User } from "@/data";
import { ADMIN_ONLY, requireRole } from "@/lib/access";

/** Admin-only list of the people who use Serv1 (SPEC.md section 2). */
export const Route = createFileRoute("/_authenticated/users")({
  beforeLoad: ({ context }) => requireRole(context.user.role, ADMIN_ONLY),
  component: Page,
});

const ROLE_HELP: Record<Role, string> = {
  Admin: "Everything, including users and settings",
  Office: "Customers, jobs, dispatch, quotes and invoices",
  Tech: "Only their assigned jobs: notes, photos, signatures",
  Owner: "Reads everything; changes only invoice status",
};

function Page() {
  const users = useUsers();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const rows = (users.data ?? [])
    .filter((u) => matches(q, u.name, u.email, u.role, u.phone))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Who uses Serv1 and what each person may do.">
        <Button onClick={() => setEditing("new")}>Add user</Button>
      </PageHeader>
      <p className="eci-card p-4 text-sm text-muted-foreground">
        This list sets each person&apos;s name, role and phone in Serv1. Their sign-in (email and
        password) is created separately in the company&apos;s AWS account; until then the person
        shows &quot;Sign-in not set up&quot;. Turn someone off instead of deleting them so their
        past jobs keep their name.
      </p>
      <SearchBox label="Search users" placeholder="Name, email or role" value={q} onChange={setQ} />
      {users.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : rows.length === 0 ? (
        <EmptyState title={q ? "No users match" : "No users yet"} />
      ) : (
        <ul className="eci-card divide-y divide-border/70" aria-label="Users">
          {rows.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setEditing(u)}
                className="grid w-full gap-1 px-4 py-3 text-left hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_8rem_10rem_9rem] md:items-center"
                aria-label={`Edit ${u.name}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{u.email}</span>
                </span>
                <span className="text-sm">{u.role}</span>
                <span className="text-sm text-muted-foreground">
                  {u.identityId ? "Sign-in linked" : "Sign-in not set up"}
                </span>
                <span
                  className={
                    u.active ? "text-sm" : "text-sm font-medium text-red-700 dark:text-red-400"
                  }
                >
                  {u.active ? "Active" : "Turned off"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <UserDialog
        user={editing === "new" ? null : editing}
        open={editing !== null}
        others={users.data ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function UserDialog({
  user,
  open,
  others,
  onClose,
}: {
  user: User | null;
  open: boolean;
  others: User[];
  onClose: () => void;
}) {
  const { create, update } = useUserMutations();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Tech");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role ?? "Tech");
    setPhone(user?.phone ?? "");
    setActive(user?.active ?? true);
    setError("");
  }, [open, user]);

  const lastAdmin =
    !!user &&
    user.role === "Admin" &&
    user.active &&
    others.filter((u) => u.role === "Admin" && u.active).length === 1;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return setError("Enter a name and an email.");
    const clash = others.find(
      (u) => u.id !== user?.id && u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (clash) return setError(`${clash.name} already uses that email.`);
    if (lastAdmin && (role !== "Admin" || !active))
      return setError("Keep at least one active Admin, or nobody can manage users.");
    const fields = {
      name: name.trim(),
      email: email.trim(),
      role,
      phone: phone.trim() || null,
      active,
    };
    try {
      if (user) await update.mutateAsync({ id: user.id, patch: fields });
      else await create.mutateAsync({ ...fields, identityId: null });
      onClose();
    } catch {
      setError("Couldn't save. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
            <DialogDescription>{ROLE_HELP[role]}</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                className={SELECT_CLASS}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--eci-copper)]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active (turn off when someone leaves)
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {user ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
