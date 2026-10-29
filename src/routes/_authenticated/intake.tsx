import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Inbox, Paperclip, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DIVISIONS, JOB_TYPES } from "@/lib/eci/data";
import { useEci } from "@/lib/eci/store";
import { useIntakeActions, useIntakeCounts, useIntakeList } from "@/lib/intake/useIntake";
import {
  confidenceLabel,
  missingRequired,
  type IntakeExtraction,
  type IntakeRecord,
  type IntakeStatus,
} from "@/lib/intake/types";

export const Route = createFileRoute("/_authenticated/intake")({
  head: () => ({
    meta: [
      { title: "Bid Intake Queue — ECI Operations" },
      {
        name: "description",
        content:
          "Review bid invitations captured from the shared mailbox, correct the extracted project details and record a bid or no-bid decision.",
      },
      { property: "og:title", content: "Bid Intake Queue — ECI Operations" },
      {
        property: "og:description",
        content: "Human review of incoming bid invitations before they become CRM opportunities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntakePage,
});

const TABS: { value: IntakeStatus; label: string }[] = [
  { value: "pending", label: "Needs review" },
  { value: "bid", label: "Bid" },
  { value: "no_bid", label: "No bid" },
  { value: "dismissed", label: "Screened out" },
];

const FIELDS: { key: keyof IntakeExtraction; label: string; kind?: "area" | "date" }[] = [
  { key: "projectName", label: "Project name" },
  { key: "projectAddress", label: "Project address" },
  { key: "bidDueDate", label: "Bid due date", kind: "date" },
  { key: "bidDueTime", label: "Bid due time" },
  { key: "contactName", label: "Contact" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "addenda", label: "Addenda" },
  { key: "description", label: "Description", kind: "area" },
  { key: "scope", label: "Scope", kind: "area" },
  { key: "invitationText", label: "Invitation text", kind: "area" },
];

function Confidence({ value }: { value: number }) {
  const { label, tone } = confidenceLabel(value);
  const cls =
    tone === "high"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "medium"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-destructive/10 text-destructive";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label} · {Math.round(value * 100)}%
    </span>
  );
}

function IntakePage() {
  const { customers, employees, currentUser } = useEci();
  const [tab, setTab] = useState<IntakeStatus>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useIntakeList(tab);
  const counts = useIntakeCounts();
  const { scan, update, decide } = useIntakeActions();

  const records = useMemo(() => list.data ?? [], [list.data]);
  const selected = records.find((r) => r.id === selectedId) ?? records[0] ?? null;

  useEffect(() => {
    if (records.length > 0 && !records.some((r) => r.id === selectedId)) {
      setSelectedId(records[0]!.id);
    }
  }, [records, selectedId]);

  return (
    <AppShell>
      <PageHeader
        title="Bid intake queue"
        description="Bid invitations captured from the shared mailbox. Nothing here becomes an opportunity until you review it and select Bid."
      >
        <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
          {scan.isPending ? "Screening mail…" : "Scan mailbox"}
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as IntakeStatus)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {counts.data?.[t.value] ? (
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">{counts.data[t.value]}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!list.isLoading && records.length === 0 ? (
            <div className="eci-card flex flex-col items-center gap-2 p-8 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing in this list. Run a mailbox scan to screen new mail for bid invitations.
              </p>
            </div>
          ) : null}
          {records.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full rounded-lg bg-card p-4 text-left ring-1 transition-shadow hover:shadow-sm ${
                selected?.id === r.id ? "ring-2 ring-primary" : "ring-black/5"
              }`}
            >
              <p className="text-sm font-medium leading-snug">
                {r.extracted.projectName || r.subject || "(no subject)"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.matchedCustomer || r.extracted.customerName || r.fromAddress}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Confidence value={r.confidence} />
                {r.extracted.bidDueDate ? (
                  <span className="text-xs text-muted-foreground">Due {r.extracted.bidDueDate}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <IntakeDetail
            key={selected.id}
            record={selected}
            customers={customers}
            employees={employees.filter((e) => e.active).map((e) => e.name)}
            currentUser={currentUser}
            onSave={(payload) => update.mutate(payload)}
            onDecide={(payload) => decide.mutate(payload)}
            saving={update.isPending}
            deciding={decide.isPending}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function IntakeDetail({
  record,
  customers,
  employees,
  currentUser,
  onSave,
  onDecide,
  saving,
  deciding,
}: {
  record: IntakeRecord;
  customers: string[];
  employees: string[];
  currentUser: string;
  onSave: (payload: {
    id: string;
    extracted: Partial<IntakeExtraction>;
    matchedCustomer: string | null;
  }) => void;
  onDecide: (payload: {
    id: string;
    decision: "bid" | "no_bid";
    note: string;
    assignedTo: string;
    decidedBy: string;
    createCustomer: boolean;
  }) => void;
  saving: boolean;
  deciding: boolean;
}) {
  const [draft, setDraft] = useState<IntakeExtraction>(record.extracted);
  const initialCustomer =
    record.matchedCustomer && customers.includes(record.matchedCustomer)
      ? record.matchedCustomer
      : customers.includes(record.extracted.customerName)
        ? record.extracted.customerName
        : "__new";
  const [customer, setCustomer] = useState<string>(initialCustomer);
  const [newCustomer, setNewCustomer] = useState(
    record.matchedCustomer || record.extracted.customerName,
  );
  const [confirmNew, setConfirmNew] = useState(false);
  const [assignedTo, setAssignedTo] = useState(employees[0] ?? currentUser);
  const [note, setNote] = useState(record.decisionNote);

  const creatingNew = customer === "__new";
  const customerName = creatingNew ? newCustomer.trim() : customer;
  const decided = record.status !== "pending";
  const extractedWithCustomer: IntakeExtraction = { ...draft, customerName };
  const missing = missingRequired(extractedWithCustomer);
  const canDecideBid = missing.length === 0 && (!creatingNew || confirmNew) && !deciding;

  const set = (key: keyof IntakeExtraction, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="eci-card space-y-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{record.subject || "(no subject)"}</h2>
            <p className="text-sm text-muted-foreground">
              From {record.fromName || record.fromAddress} &lt;{record.fromAddress}&gt; ·{" "}
              {new Date(record.receivedAt).toLocaleString()}
            </p>
          </div>
          <Confidence value={record.confidence} />
        </div>
        {record.bodyPreview ? (
          <p className="text-sm text-muted-foreground">{record.bodyPreview}</p>
        ) : null}
        {record.reviewReasons.length > 0 && !decided ? (
          <ul className="space-y-1 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800">
            {record.reviewReasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        ) : null}
        {decided ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            {record.status === "bid" ? (
              <>
                Bid decision recorded by {record.decidedBy}. Opportunity{" "}
                {record.opportunityId ? (
                  <Link to="/crm/$id" params={{ id: record.opportunityId }} className="font-medium underline">
                    {record.opportunityId}
                  </Link>
                ) : null}{" "}
                is in the CRM pipeline.
              </>
            ) : record.status === "no_bid" ? (
              <>No bid recorded by {record.decidedBy}. Kept as history only.</>
            ) : (
              <>Screened out automatically — not treated as a bid invitation.</>
            )}
            {record.decisionNote ? <p className="mt-1 text-muted-foreground">{record.decisionNote}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="eci-card space-y-5 p-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Extracted information
          </h3>
          <p className="text-sm text-muted-foreground">
            Correct anything the screening got wrong. These values only become business data when you select Bid.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>General contractor / customer</Label>
            <Select value={customer} onValueChange={setCustomer} disabled={decided}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value="__new">+ New customer…</SelectItem>
              </SelectContent>
            </Select>
            {record.candidateCustomers.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Possible matches: {record.candidateCustomers.join(", ")}
              </p>
            ) : null}
            {creatingNew ? (
              <div className="space-y-2 pt-2">
                <Input
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(e.target.value)}
                  placeholder="New customer name"
                  disabled={decided}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={confirmNew}
                    onCheckedChange={(v) => setConfirmNew(v === true)}
                    disabled={decided}
                  />
                  Create “{newCustomer || "…"}” as a new customer — I checked it is not an existing record.
                </label>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Division</Label>
            <Select value={draft.division || ""} onValueChange={(v) => set("division", v)} disabled={decided}>
              <SelectTrigger>
                <SelectValue placeholder="Select division" />
              </SelectTrigger>
              <SelectContent>
                {DIVISIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Job type</Label>
            <Select value={draft.jobType || ""} onValueChange={(v) => set("jobType", v)} disabled={decided}>
              <SelectTrigger>
                <SelectValue placeholder="Select job type" />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((j) => (
                  <SelectItem key={j} value={j}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {FIELDS.map((f) => (
            <div key={f.key} className={`space-y-1.5 ${f.kind === "area" ? "md:col-span-2" : ""}`}>
              <div className="flex items-center justify-between">
                <Label>{f.label}</Label>
                {(record.fieldConfidence[f.key] ?? 0) > 0 && (record.fieldConfidence[f.key] ?? 0) < 0.8 ? (
                  <span className="text-xs text-amber-700">inferred — confirm</span>
                ) : null}
              </div>
              {f.kind === "area" ? (
                <Textarea
                  rows={3}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={decided}
                />
              ) : (
                <Input
                  type={f.kind === "date" ? "date" : "text"}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={decided}
                />
              )}
            </div>
          ))}
        </div>

        {(record.attachments.length > 0 || record.links.length > 0) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Attachments & plan links</h4>
            {record.attachments.map((a, i) => (
              <div key={`a${i}`} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  {a.name}
                </span>
                {a.webUrl ? (
                  <a href={a.webUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Files to SharePoint on Bid</span>
                )}
              </div>
            ))}
            {record.links.map((l, i) => (
              <div key={`l${i}`} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  {l.label}
                </span>
                <a href={l.url} target="_blank" rel="noreferrer" className="text-xs underline">
                  Open
                </a>
              </div>
            ))}
          </div>
        )}

        {!decided ? (
          <div className="space-y-4 border-t border-border pt-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([currentUser, ...employees])].map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Decision note</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {missing.length > 0 ? (
              <p className="text-sm text-destructive">
                Add the missing required information before bidding: {missing.join(", ")}.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  onSave({
                    id: record.id,
                    extracted: extractedWithCustomer,
                    matchedCustomer: creatingNew ? null : customer,
                  })
                }
                disabled={saving}
              >
                Save corrections
              </Button>
              <Button
                disabled={!canDecideBid}
                onClick={() => {
                  onSave({
                    id: record.id,
                    extracted: extractedWithCustomer,
                    matchedCustomer: creatingNew ? null : customer,
                  });
                  onDecide({
                    id: record.id,
                    decision: "bid",
                    note,
                    assignedTo,
                    decidedBy: currentUser,
                    createCustomer: creatingNew,
                  });
                }}
              >
                Bid — create opportunity
              </Button>
              <Button
                variant="destructive"
                disabled={deciding}
                onClick={() =>
                  onDecide({
                    id: record.id,
                    decision: "no_bid",
                    note,
                    assignedTo,
                    decidedBy: currentUser,
                    createCustomer: false,
                  })
                }
              >
                No bid
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
