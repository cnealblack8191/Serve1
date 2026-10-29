import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import { EmptyState, PageHeader, SectionHeading, StatusBadge } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, useEci } from "@/lib/eci/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Overdue Action Items — ECI Operations" },
      {
        name: "description",
        content:
          "Every overdue invoice, stalled quote approval, failed Spectrum sync and past-due reminder in one action list with one-click follow-up email.",
      },
      { property: "og:title", content: "Overdue Action Items — ECI Operations" },
      {
        property: "og:description",
        content:
          "Track and chase overdue ECI tasks — email the responsible person or clear the item yourself.",
      },
    ],
  }),
  component: AlertsPage,
});

type ActionItem = {
  id: string;
  recordId: string;
  kind: "Invoice" | "Approval" | "Spectrum Sync" | "Reminder" | "Work Order";
  title: string;
  detail: string;
  owner: string;
  ownerEmail: string;
  due?: string;
  severity: "red" | "amber";
  link?: { to: "/invoices" | "/bids/$id" | "/jobs/$id" | "/crm/$id"; id?: string };
  resolve?: () => void;
  resolveLabel?: string;
};

const isPast = (value: string) => {
  const t = Date.parse(value);
  return Number.isFinite(t) && t < Date.now();
};

function AlertsPage() {
  const {
    can,
    roleReady,
    currentUser,
    invoices,
    bids,
    jobs,
    workOrders,
    reminders,
    employees,
    customerRecords,
    sendRecordEmail,
    toggleReminder,
  } = useEci();

  const [active, setActive] = useState<ActionItem | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const emailFor = (name: string) =>
    employees.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())?.email ?? "";

  const items = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    const apOwner = employees.find((e) => e.role === "AP/AR" && e.active);

    for (const i of invoices.filter((x) => x.status === "Overdue")) {
      const customer = customerRecords.find((c) => c.name === i.customer);
      list.push({
        id: `inv-${i.id}`,
        recordId: i.id,
        kind: "Invoice",
        title: `Invoice #${i.number} is past due`,
        detail: `${money(i.balance)} outstanding · ${i.customer} · ${i.jobName}`,
        owner: apOwner?.name ?? "Accounts Receivable",
        ownerEmail: apOwner?.email ?? customer?.contactEmail ?? "",
        due: i.due,
        severity: "red",
        link: { to: "/invoices" },
      });
    }

    for (const b of bids.filter((x) => x.stage === "Awaiting Approval")) {
      const pending = b.approvals.filter((a) => a.status !== "Approved");
      const approver = pending[0];
      list.push({
        id: `bid-${b.id}`,
        recordId: b.id,
        kind: "Approval",
        title: `Quote awaiting approval — ${b.name}`,
        detail: `${b.customer} · ${pending.length} approval${pending.length === 1 ? "" : "s"} outstanding`,
        owner: approver?.approver ?? b.owner,
        ownerEmail: emailFor(approver?.approver ?? b.owner),
        severity: "amber",
        link: { to: "/bids/$id", id: b.id },
      });
    }

    for (const j of jobs.filter((x) => x.spectrumSync === "Failed")) {
      list.push({
        id: `job-${j.id}`,
        recordId: j.id,
        kind: "Spectrum Sync",
        title: `Spectrum sync failed — ${j.name}`,
        detail: `${j.customer} · Spectrum #${j.spectrumNumber}`,
        owner: j.manager,
        ownerEmail: emailFor(j.manager),
        severity: "red",
        link: { to: "/jobs/$id", id: j.id },
      });
    }

    for (const r of reminders.filter((x) => !x.done && x.due && isPast(x.due))) {
      list.push({
        id: `rem-${r.id}`,
        recordId: r.recordId,
        kind: "Reminder",
        title: r.title,
        detail: r.note || `Reminder on ${r.recordId}`,
        owner: r.assignedTo,
        ownerEmail: emailFor(r.assignedTo),
        due: r.due,
        severity: "amber",
        link: { to: "/crm/$id", id: r.recordId },
        resolve: () => toggleReminder(r.id),
        resolveLabel: "Mark done",
      });
    }

    for (const w of workOrders.filter(
      (x) => x.status !== "Complete" && x.scheduled && isPast(x.scheduled),
    )) {
      const job = jobs.find((j) => j.id === w.jobId);
      list.push({
        id: `wo-${w.id}`,
        recordId: w.id,
        kind: "Work Order",
        title: `${w.number} past its scheduled date`,
        detail: `${w.title} · ${job?.name ?? w.jobId} · ${w.status}`,
        owner: w.technician,
        ownerEmail: emailFor(w.technician),
        due: w.scheduled,
        severity: w.priority === "Priority 1" ? "red" : "amber",
        link: { to: "/jobs/$id", id: w.jobId },
      });
    }

    return list;
  }, [invoices, bids, jobs, workOrders, reminders, employees, customerRecords, toggleReminder]);

  if (!roleReady) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }
  if (!can("dashboard")) return <Navigate to={can("crm") ? "/crm" : "/field"} replace />;

  const openComposer = (item: ActionItem) => {
    setActive(item);
    setTo(item.ownerEmail);
    setSubject(`Action needed: ${item.title}`);
    setBody(
      `Hi ${item.owner || "team"},\n\nThis item is showing as overdue in Serve One:\n\n${item.title}\n${item.detail}${item.due ? `\nDue: ${item.due}` : ""}\n\nCould you take care of it or reply with a status update?\n\nThanks,\n${currentUser}`,
    );
  };

  const send = () => {
    if (!active) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      toast.error("Enter a valid email address.");
      return;
    }
    sendRecordEmail(active.recordId, to.trim(), subject, body);
    toast.success(`Follow-up sent to ${to.trim()}`);
    setActive(null);
  };

  const grouped = ["Invoice", "Approval", "Spectrum Sync", "Reminder", "Work Order"] as const;

  return (
    <AppShell>
      <PageHeader
        title="Overdue Action Items"
        description="Everything past due across invoicing, approvals, sync, reminders and field work — chase the owner by email or clear it yourself."
      >
        <span className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-600/10">
          <AlertTriangle className="size-4" />
          {items.length} open
        </span>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState title="Nothing is overdue" hint="Every tracked task is on schedule right now." />
      ) : (
        <div className="space-y-8">
          {grouped.map((kind) => {
            const rows = items.filter((i) => i.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} className="space-y-4">
                <SectionHeading title={`${kind} items`} description={`${rows.length} needing attention`} />
                <div className="eci-card divide-y divide-black/5">
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              item.severity === "red" ? "bg-red-500" : "bg-amber-500",
                            )}
                          />
                          <p className="text-sm font-medium">{item.title}</p>
                          <StatusBadge status={item.severity === "red" ? "Overdue" : "Pending"} />
                        </div>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                        <p className="text-xs text-muted-foreground">
                          Responsible: <span className="font-medium text-foreground">{item.owner}</span>
                          {item.ownerEmail ? ` · ${item.ownerEmail}` : " · no email on file"}
                          {item.due ? ` · due ${item.due}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.link ? (
                          <Button asChild variant="outline" size="sm">
                            {item.link.id ? (
                              <Link to={item.link.to} params={{ id: item.link.id }}>
                                Open record
                              </Link>
                            ) : (
                              <Link to={item.link.to}>Open record</Link>
                            )}
                          </Button>
                        ) : null}
                        {item.resolve ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              item.resolve?.();
                              toast.success("Marked done.");
                            }}
                          >
                            {item.resolveLabel ?? "Mark done"}
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => openComposer(item)}>
                          <Mail className="mr-2 size-4" />
                          Email owner
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send follow-up</DialogTitle>
            <DialogDescription>
              {active ? `${active.kind} · ${active.recordId}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="alert-to">
                To
              </label>
              <Input
                id="alert-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@ecinc.us"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="alert-subject">
                Subject
              </label>
              <Input id="alert-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="alert-body">
                Message
              </label>
              <Textarea
                id="alert-body"
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button onClick={send}>Send email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
