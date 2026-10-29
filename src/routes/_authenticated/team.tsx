import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, SectionHeading } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEci } from "@/lib/eci/store";
import { ROLE_PRESETS, type Employee, type Role } from "@/lib/eci/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team Management — ECI Operations" },
      {
        name: "description",
        content:
          "Add electricians and office staff, assign roles, and manage team access for ECI.",
      },
      { property: "og:title", content: "Team Management — ECI Operations" },
      {
        property: "og:description",
        content: "Add electricians and office staff, assign roles, and manage team access.",
      },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { employees, addEmployee, setEmployeeActive, updateEmployee, removeEmployee, can } = useEci();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("Field");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState("");
  const [role, setRoleSel] = useState<Role>("Field");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const editable = can("manage_permissions");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Enter the employee's name");
      return;
    }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid work email");
      return;
    }
    addEmployee({ name: name.trim(), role, phone: phone.trim(), email: email.trim() });
    toast.success(`${name.trim()} added to the team`);
    setName("");
    setPhone("");
    setEmail("");
    setRoleSel("Field");
  };

  const openEmployee = (e: Employee) => {
    setSelected(e);
    setEditName(e.name);
    setEditRole(e.role);
    setEditPhone(e.phone);
    setEditEmail(e.email);
    setConfirmRemove(false);
  };

  const saveEmployee = () => {
    if (!selected) return;
    if (!editName.trim()) {
      toast.error("Enter the employee's name");
      return;
    }
    if (!editEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editEmail)) {
      toast.error("Enter a valid work email");
      return;
    }
    updateEmployee(selected.id, {
      name: editName.trim(),
      role: editRole,
      phone: editPhone.trim(),
      email: editEmail.trim(),
    });
    toast.success(`${editName.trim()} updated`);
    setSelected(null);
  };

  const confirmRemoveEmployee = () => {
    if (!selected) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    removeEmployee(selected.id);
    toast.success(`${selected.name} removed from the team`);
    setSelected(null);
  };

  return (
    <AppShell>
      <PageHeader
        title="Team Management"
        description="Add electricians and office staff, assign their role, and control access."
      />

      {!editable ? (
        <div className="eci-card border-l-4 border-l-eci-copper p-5 text-sm">
          Your current role can view the team but cannot add employees. Switch to
          Division Manager in the role switcher to make changes.
        </div>
      ) : null}

      <section className="eci-card space-y-5 p-6">
        <SectionHeading
          title="Add employee"
          description="New electricians get the Field role; their role preset controls what they can see."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jamie Carter"
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRoleSel(v as Role)} disabled={!editable}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_PRESETS) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(770) 555-0100"
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Work email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@electricalcontractorinc.com"
              disabled={!editable}
            />
          </div>
        </div>
        <Button onClick={submit} disabled={!editable}>
          Add to team
        </Button>
      </section>

      <section className="eci-card space-y-4 p-6">
        <SectionHeading
          title={`Team (${employees.length})`}
          description="Active employees can be assigned to opportunities, jobs, and work orders."
        />
        <ul className="divide-y divide-border">
          {employees.map((e) => (
            <li key={e.id} className="flex items-center gap-4 py-3">
              <button
                type="button"
                onClick={() => openEmployee(e)}
                disabled={!editable}
                className="flex min-w-0 flex-1 items-center gap-4 rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                aria-label={`View and edit ${e.name}`}
              >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-eci-navy text-xs font-semibold text-zinc-100">
                {e.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", !e.active && "text-muted-foreground line-through")}>
                  {e.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.role} · {e.email}
                  {e.phone ? ` · ${e.phone}` : ""}
                </p>
              </div>
              </button>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  e.active
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {e.active ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={e.active}
                disabled={!editable}
                onCheckedChange={(v) => setEmployeeActive(e.id, v)}
                aria-label={`Set ${e.name} active`}
              />
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Edit this team member's details or remove them from the team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_PRESETS) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Work email</label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">Active</span>
              <Switch
                checked={selected?.active ?? false}
                onCheckedChange={(v) => {
                  if (selected) {
                    setEmployeeActive(selected.id, v);
                    setSelected({ ...selected, active: v });
                  }
                }}
                aria-label="Set active"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={confirmRemoveEmployee}
            >
              {confirmRemove ? "Click again to confirm removal" : "Remove from team"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button onClick={saveEmployee}>Save changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
