import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import {
  DataRow,
  EmptyState,
  Field,
  PageHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsPanel } from "@/components/eci/DocumentsPanel";
import { CommunicationsPanel } from "@/components/eci/CommunicationsPanel";
import { CommunicationTimeline } from "@/components/eci/CommunicationTimeline";
import { Textarea } from "@/components/ui/textarea";
import { bidTotals, money, useEci } from "@/lib/eci/store";
import type { Opportunity } from "@/lib/eci/types";

export const Route = createFileRoute("/_authenticated/crm/$id")({
  head: () => ({
    meta: [
      { title: "Opportunity Detail — ECI Operations" },
      {
        name: "description",
        content:
          "Opportunity overview, contacts, estimate and quote, invoices, and a full activity history for stage changes and notes.",
      },
      { property: "og:title", content: "Opportunity Detail — ECI Operations" },
      {
        property: "og:description",
        content: "Review scope, contacts and history, then make the bid or no-bid decision.",
      },
    ],
  }),
  component: OpportunityDetail,
});

function OpportunityDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    opportunities,
    bids,
    invoices,
    setOpportunityStage,
    approveToEstimate,
    addOpportunityNote,
  } = useEci();
  const [note, setNote] = useState("");

  const opp = opportunities.find((o) => o.id === id);
  if (!opp) {
    return (
      <AppShell>
        <EmptyState title="Opportunity not found" hint="It may have been converted to a bid." />
      </AppShell>
    );
  }

  const bid = bids.find((b) => b.id === opp.bidId);
  const related = invoices.filter((i) => i.customer === opp.customer);

  return (
    <AppShell>
      <PageHeader title={opp.name} description={`${opp.customer} · ${opp.address}`}>
        <StatusBadge status={opp.stage} className="px-3 py-1.5 text-sm" />
      </PageHeader>

      {opp.stage === "New Opportunity" ? (
        <div className="eci-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-medium">Bid or no-bid decision</p>
            <p className="text-sm text-muted-foreground">
              Decide whether ECI will pursue this work before estimating begins.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpportunityStage(opp.id, "No-Bid");
                toast("Marked as no-bid");
              }}
            >
              No-bid
            </Button>
            <Button
              onClick={() => {
                setOpportunityStage(opp.id, "Bid or No-Bid Decision");
                toast.success("Moved to bid or no-bid decision");
              }}
            >
              Move to decision
            </Button>
          </div>
        </div>
      ) : null}

      {opp.stage === "Bid or No-Bid Decision" ? (
        <div className="eci-card flex flex-wrap items-center justify-between gap-4 border-l-4 border-eci-amber p-6">
          <div>
            <p className="font-medium">Approve for estimating</p>
            <p className="text-sm text-muted-foreground">
              Approving creates a bid record and opens the estimate editor.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpportunityStage(opp.id, "No-Bid")}>
              No-bid
            </Button>
            <Button
              onClick={() => {
                const bidId = approveToEstimate(opp.id);
                toast.success("Approved to estimate");
                navigate({ to: "/bids/$id", params: { id: bidId } });
              }}
            >
              Approve to estimate
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="estimate">Estimate & Quote</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="eci-card grid grid-cols-1 gap-x-8 p-6 md:grid-cols-2">
                <DataRow label="Customer" value={opp.customer} />
                <DataRow label="Customer contact" value={opp.contactName || "—"} />
                <DataRow label="Project address" value={opp.address} />
                <DataRow label="Job type" value={opp.jobType} />
                <DataRow label="Division" value={opp.division} />
                <DataRow label="Expected bid date" value={opp.expectedBidDate || "—"} />
                <DataRow label="Assigned employee" value={opp.assignedTo} />
                <DataRow label="Estimated value" value={money(opp.value)} />
              </div>
              <div className="eci-card space-y-4 p-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-1 text-pretty text-sm">{opp.description || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 text-pretty text-sm">{opp.notes || "—"}</p>
                </div>
              </div>
              <DocumentsPanel
                target={{
                  recordType: "opportunity",
                  recordId: opp.id,
                  name: opp.name,
                  customer: opp.customer,
                }}
                title="Documents associated with this opportunity"
              />

              <DocumentsPanel
                target={{ recordType: "customer", recordId: opp.customer, name: opp.customer }}
                title={`Client documents — ${opp.customer}`}
                description="Everything filed against this client in SharePoint."
              />

              <CommunicationTimeline
                target={{
                  recordType: "opportunity",
                  recordId: opp.id,
                  name: opp.name,
                  customer: opp.customer,
                }}
                title="Opportunity activity timeline"
              />

              <CommunicationTimeline
                target={{ recordType: "customer", recordId: opp.customer, name: opp.customer }}
                title={`Client activity — ${opp.customer}`}
              />

              <CommunicationsPanel
                target={{
                  recordType: "opportunity",
                  recordId: opp.id,
                  name: opp.name,
                  customer: opp.customer,
                }}
              />

              <CommunicationsPanel
                target={{ recordType: "customer", recordId: opp.customer, name: opp.customer }}
                title={`Client communications — ${opp.customer}`}
                description="Email exchanged with this client across every record."
              />

              <div className="eci-card p-6">
                <SectionHeading title="Documents (legacy attachments)" />
                <div className="mt-4 divide-y divide-black/5">
                  {opp.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.kind} · {d.size} · {d.uploadedBy} · {d.at}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                  {opp.documents.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No documents uploaded yet.</p>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contacts">
              <div className="eci-card divide-y divide-black/5">
                {opp.contacts.map((ct) => (
                  <div key={ct.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium">
                        {ct.name}
                        {ct.primary ? (
                          <span className="ml-2 text-xs text-eci-copper">Primary</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">{ct.title}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{ct.email}</p>
                      <p className="text-muted-foreground">{ct.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="estimate">
              {bid ? (
                <div className="eci-card space-y-4 p-6">
                  <SectionHeading title={`Bid ${bid.id}`} />
                  <div className="flex flex-wrap items-center gap-4">
                    <StatusBadge status={bid.stage} />
                    <span className="text-sm text-muted-foreground">
                      Selling price {money(bidTotals(bid.lineItems).sell)}
                    </span>
                  </div>
                  <Button asChild>
                    <Link to="/bids/$id" params={{ id: bid.id }}>
                      Open estimate editor
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyState
                  title="No estimate yet"
                  hint="Approve this opportunity to estimate to create a bid record."
                />
              )}
            </TabsContent>

            <TabsContent value="invoices">
              {related.length ? (
                <div className="eci-card divide-y divide-black/5">
                  {related.map((i) => (
                    <div key={i.id} className="flex items-center justify-between p-5">
                      <div>
                        <p className="text-sm font-medium">Invoice #{i.number}</p>
                        <p className="text-xs text-muted-foreground">{i.jobName}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm">{money(i.amount)}</span>
                        <StatusBadge status={i.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No invoices for this customer yet" />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <RemindersPanel oppId={opp.id} />
          <NudgePanel opp={opp} />
          <SectionHeading title="Activity History" />

          <div className="eci-card space-y-3 p-5">
            <Field label="Add a note">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Log a call, email or reminder…"
              />
            </Field>
            <Button
              size="sm"
              onClick={() => {
                if (!note.trim()) return;
                addOpportunityNote(opp.id, note.trim());
                setNote("");
                toast.success("Note added to activity history");
              }}
            >
              Add note
            </Button>
          </div>
          <ol className="space-y-4">
            {opp.activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-eci-amber" />
                <div>
                  <p className="text-pretty text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.actor} · {a.at} · {a.kind}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}

function RemindersPanel({ oppId }: { oppId: string }) {
  const { reminders, addReminder, toggleReminder, removeReminder, currentUser } = useEci();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const mine = reminders.filter((r) => r.recordId === oppId);

  return (
    <div className="eci-card space-y-3 p-5">
      <SectionHeading title="Internal reminders" description="Private to your team — never emailed to the customer." />
      <div className="space-y-2">
        <Field label="Reminder">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Follow up on drawings"
          />
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Button
          size="sm"
          onClick={() => {
            if (!title.trim()) {
              toast.error("Add a reminder description first");
              return;
            }
            addReminder({ recordId: oppId, title: title.trim(), due, assignedTo: currentUser });
            setTitle("");
            setDue("");
            toast.success("Reminder added");
          }}
        >
          Add reminder
        </Button>
      </div>
      <ul className="divide-y divide-black/5">
        {mine.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-3">
            <input
              type="checkbox"
              checked={r.done}
              onChange={() => toggleReminder(r.id)}
              className="mt-1 size-4 accent-eci-copper"
              aria-label={`Mark ${r.title} complete`}
            />
            <div className="flex-1">
              <p className={r.done ? "text-sm line-through text-muted-foreground" : "text-sm"}>
                {r.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.due ? `Due ${r.due} · ` : ""}
                {r.assignedTo}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => removeReminder(r.id)}
            >
              Remove
            </button>
          </li>
        ))}
        {mine.length === 0 ? (
          <li className="py-3 text-sm text-muted-foreground">No reminders yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

function NudgePanel({ opp }: { opp: Opportunity }) {
  const { sendRecordEmail, currentUser } = useEci();
  const primary = opp.contacts.find((c) => c.primary) ?? opp.contacts[0];
  const [to, setTo] = useState(primary?.email ?? "");
  const [subject, setSubject] = useState(`Checking in on ${opp.name}`);
  const [body, setBody] = useState(
    `Hi ${primary?.name ?? "there"},\n\nJust following up on ${opp.name}. Could you share an update on timing or any information we still need to finalize our pricing?\n\nThank you,\n${currentUser}\nElectrical Contractor Incorporated`,
  );

  return (
    <div className="eci-card space-y-3 p-5">
      <SectionHeading title="Request an update" description="Send the customer a gentle nudge by email." />
      <Field label="To">
        <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
      </Field>
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message">
        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Button
        size="sm"
        onClick={() => {
          if (!to.includes("@")) {
            toast.error("Enter a valid email address");
            return;
          }
          sendRecordEmail(opp.id, to.trim(), subject.trim() || "Following up", body);
          toast.success(`Nudge sent to ${to.trim()}`);
        }}
      >
        Send nudge
      </Button>
    </div>
  );
}
