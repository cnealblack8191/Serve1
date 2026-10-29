import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/eci/AppShell";
import { QuotePreview } from "@/components/eci/QuotePreview";
import { DocumentsPanel } from "@/components/eci/DocumentsPanel";
import { CommunicationsPanel } from "@/components/eci/CommunicationsPanel";
import { CommunicationTimeline } from "@/components/eci/CommunicationTimeline";
import { SendBidDialog } from "@/components/eci/SendBidDialog";
import { BID_DOCUMENT_LABELS } from "@/lib/sharepoint/types";
import {
  EmptyState,
  Field,
  PageHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMPLOYEES } from "@/lib/eci/data";
import { bidTotals, lineCost, lineSell, money, useEci } from "@/lib/eci/store";
import { BID_LINK_LABELS } from "@/lib/eci/types";
import type { CostCategory } from "@/lib/eci/types";

export const Route = createFileRoute("/_authenticated/bids/$id")({
  head: () => ({
    meta: [
      { title: "Estimate Editor — ECI Operations" },
      {
        name: "description",
        content:
          "Spreadsheet-style estimate editor with labor, material, equipment and subcontractor cost categories, markup and quote preview.",
      },
      { property: "og:title", content: "Estimate Editor — ECI Operations" },
      {
        property: "og:description",
        content: "Build the estimate, submit for approval, generate the branded ECI quote PDF and send it.",
      },
    ],
  }),
  component: BidDetail,
});

const CATEGORIES: CostCategory[] = ["Labor", "Material", "Equipment", "Subcontractor", "Other"];

function BidDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    bids,
    customerRecords,
    jobs,
    emails,
    currentUser,
    addLineItem,
    updateLineItem,
    removeLineItem,
    importSpectrumItems,
    submitForApproval,
    decideApproval,
    generateQuotePdf,
    sendQuote,
    markBidWon,
    createJobFromBid,
    addBidPackageLink,
    removeBidPackageLink,
    setJobSync,
  } = useEci();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [approvers, setApprovers] = useState<string[]>(["Dana Whitfield", "Ray Okafor"]);
  const [comment, setComment] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [sendBidOpen, setSendBidOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", body: "" });
  const [jobPromptOpen, setJobPromptOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState<string>(BID_LINK_LABELS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const bid = bids.find((b) => b.id === id);
  if (!bid) {
    return (
      <AppShell>
        <EmptyState title="Bid not found" />
      </AppShell>
    );
  }
  const totals = bidTotals(bid.lineItems);
  const bidEmails = emails.filter((e) => e.recordId === bid.id);
  const quoteFormat =
    customerRecords.find((c) => c.name === bid.customer)?.quoteFormat ?? "Lump Sum";
  const linkedJob = jobs.find((j) => j.id === bid.jobId);

  /**
   * Sending is locked to the stage: "Ready to Send" only exists once every
   * approval row is Approved (see decideApproval). Previewing the quote never
   * advances the stage, so nobody can send without a completed approval round.
   */
  const approvalPending = bid.stage === "Estimating" || bid.stage === "Awaiting Approval";
  const pendingApprovals = bid.approvals.filter((a) => a.status === "Pending");
  const canSendQuote = bid.stage === "Ready to Send";

  const openEmail = () => {
    setEmailForm({
      to: `contracts@${bid.customer.toLowerCase().replace(/[^a-z]/g, "")}.com`,
      subject: `ECI Quotation ${bid.id} — ${bid.name}`,
      body: `Hello,\n\nAttached is our quotation for ${bid.name} in the amount of ${money(totals.sell)}. Please let me know if you would like to review any line of the scope.\n\nRegards,\n${currentUser}\nElectrical Contractor Incorporated`,
    });
    setEmailOpen(true);
  };

  return (
    <AppShell>
      <PageHeader title={bid.name} description={`${bid.customer} · ${bid.address}`}>
        <StatusBadge status={bid.stage} className="px-3 py-1.5 text-sm" />
      </PageHeader>

      <Tabs defaultValue="estimate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="estimate">Estimate</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
          <TabsTrigger value="quote">Quote preview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ESTIMATE */}
        <TabsContent value="estimate" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => importSpectrumItems(bid.id)}>
              Import from Spectrum
            </Button>
            <Button variant="outline" onClick={() => toast("Upload Estimate — placeholder")}>
              Upload Estimate
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => addLineItem(bid.id)}>
              <Plus className="size-4" />
              Add Line Item
            </Button>
            <Button variant="outline" onClick={() => toast.success("Draft saved")}>
              Save Draft
            </Button>
            <Button
              onClick={() => setSubmitOpen(true)}
              disabled={bid.lineItems.length === 0 || bid.stage !== "Estimating"}
            >
              Submit for Approval
            </Button>
          </div>

          <div className="eci-card overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Cost code",
                    "Category",
                    "Description",
                    "Qty",
                    "Unit",
                    "Unit cost",
                    "Markup %",
                    "Extended cost",
                    "Selling price",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {bid.lineItems.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 w-24 font-mono"
                        value={l.costCode}
                        onChange={(e) => updateLineItem(bid.id, l.id, { costCode: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={l.category}
                        onValueChange={(v) =>
                          updateLineItem(bid.id, l.id, { category: v as CostCategory })
                        }
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="space-y-1.5 px-3 py-2">
                      <Input
                        className="h-9 w-72"
                        value={l.description}
                        onChange={(e) =>
                          updateLineItem(bid.id, l.id, { description: e.target.value })
                        }
                        placeholder="Internal description"
                      />
                      <Input
                        className="h-8 w-72 text-xs"
                        value={l.customerDescription}
                        onChange={(e) =>
                          updateLineItem(bid.id, l.id, { customerDescription: e.target.value })
                        }
                        placeholder="Customer-facing description"
                      />
                      <Input
                        className="h-8 w-72 text-xs"
                        value={l.internalNote}
                        onChange={(e) =>
                          updateLineItem(bid.id, l.id, { internalNote: e.target.value })
                        }
                        placeholder="Internal note"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        className="h-9 w-20"
                        value={l.qty}
                        onChange={(e) => updateLineItem(bid.id, l.id, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 w-16"
                        value={l.unit}
                        onChange={(e) => updateLineItem(bid.id, l.id, { unit: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        className="h-9 w-28"
                        value={l.unitCost}
                        onChange={(e) =>
                          updateLineItem(bid.id, l.id, { unitCost: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        className="h-9 w-20"
                        value={l.markup}
                        onChange={(e) =>
                          updateLineItem(bid.id, l.id, { markup: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-3 py-4 font-mono text-sm">{money(lineCost(l))}</td>
                    <td className="px-3 py-4 font-mono text-sm font-medium">{money(lineSell(l))}</td>
                    <td className="px-3 py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line item"
                        onClick={() => removeLineItem(bid.id, l.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {bid.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center text-muted-foreground">
                      No line items yet. Add one manually or import Spectrum cost codes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="eci-card w-full max-w-sm space-y-3 p-6">
              <SectionHeading title="Estimate totals" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total cost</span>
                <span>{money(totals.cost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross margin</span>
                <span>{totals.margin.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>Selling price</span>
                <span>{money(totals.sell)}</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* APPROVAL */}
        <TabsContent value="approval" className="space-y-6">
          <div className="eci-card space-y-4 p-6">
            <SectionHeading title={bid.approvalGroup} />
            <p className="text-sm text-muted-foreground">
              Approvers are preset by the standard approval group and can be modified by customer,
              job type, or manual selection when submitting.
            </p>
            {bid.approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not yet submitted. Use Submit for Approval on the estimate tab.
              </p>
            ) : (
              <div className="divide-y divide-black/5">
                {bid.approvals.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-sm font-medium">{a.approver}</p>
                      <p className="text-xs text-muted-foreground">{a.role}</p>
                      {a.comment ? (
                        <p className="mt-1 text-sm text-muted-foreground">“{a.comment}”</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.status === "Pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => decideApproval(bid.id, a.id, "Approved", comment)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              decideApproval(bid.id, a.id, "Changes Requested", comment)
                            }
                          >
                            Request changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decideApproval(bid.id, a.id, "Rejected", comment)}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bid.stage === "Awaiting Approval" ? (
              <Field label="Approver comment">
                <Textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment attached to your decision"
                />
              </Field>
            ) : null}
          </div>

          {bid.stage === "Ready to Send" && !bid.pdfGenerated ? (
            <div className="eci-card flex flex-wrap items-center justify-between gap-4 border-l-4 border-eci-amber p-6">
              <div>
                <p className="font-medium">Final approval complete</p>
                <p className="text-sm text-muted-foreground">
                  Generate the branded ECI quote PDF and prepare the Spectrum record.
                </p>
              </div>
              <Button
                onClick={() => {
                  generateQuotePdf(bid.id);
                  toast.success("Quote PDF generated and Spectrum record prepared");
                }}
              >
                Generate quote PDF
              </Button>
            </div>
          ) : null}
        </TabsContent>

        {/* QUOTE PREVIEW */}
        <TabsContent value="quote" className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (approvalPending) {
                  toast("Approval required before this quote can be sent");
                  return;
                }
                if (bid.pdfGenerated) {
                  toast("Quote preview is up to date");
                  return;
                }
                generateQuotePdf(bid.id);
                toast.success("Quote PDF generated and Spectrum record prepared");
              }}
            >
              Preview Quote
            </Button>
            <Button onClick={() => setSendBidOpen(true)} disabled={!canSendQuote}>
              Review &amp; send quote
            </Button>
            {bid.stage === "Sent to Customer" ? (
              <Button
                variant="outline"
                onClick={() => {
                  markBidWon(bid.id);
                  setJobPromptOpen(true);
                }}
              >
                Mark bid Won
              </Button>
            ) : null}
            {bid.stage === "Won" && !bid.jobId ? (
              <Button onClick={() => setJobPromptOpen(true)}>Create job</Button>
            ) : null}
            {linkedJob ? (
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/jobs/$id", params: { id: linkedJob.id } })}
              >
                Open job {linkedJob.spectrumNumber}
              </Button>
            ) : null}
          </div>

          {approvalPending ? (
            <div
              role="status"
              className="eci-card flex flex-wrap items-center justify-between gap-4 border-l-4 border-eci-amber p-5"
            >
              <div className="space-y-1">
                <p className="font-medium">Approval required before this quote can be sent</p>
                <p className="text-sm text-muted-foreground">
                  {bid.stage === "Estimating"
                    ? "This estimate hasn't gone to approvers yet. Submit it for approval to unlock sending."
                    : `Waiting on ${pendingApprovals.length} of ${bid.approvals.length} approvals${
                        pendingApprovals.length
                          ? `: ${pendingApprovals.map((a) => a.approver).join(", ")}`
                          : ""
                      }.`}
                </p>
              </div>
              {bid.stage === "Estimating" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bid.lineItems.length === 0}
                  onClick={() => setSubmitOpen(true)}
                >
                  Submit for approval
                </Button>
              ) : null}
            </div>
          ) : null}

          <QuotePreview bid={bid} quoteFormat={quoteFormat} />
        </TabsContent>

        {/* DOCUMENTS — SharePoint-backed bid documents */}
        <TabsContent value="documents" className="space-y-6">
          <DocumentsPanel
            target={{
              recordType: "bid",
              recordId: bid.id,
              name: bid.name,
              customer: bid.customer,
            }}
            title="Documents associated with this bid"
            description="Plans, specifications, addenda, invitations to bid, scope documents, quotes, vendor files and proposals."
            labels={BID_DOCUMENT_LABELS}
          />

          <DocumentsPanel
            target={{ recordType: "customer", recordId: bid.customer, name: bid.customer }}
            title={`Client documents — ${bid.customer}`}
            description="Files held against this client that may also apply to the bid."
          />

          <CommunicationTimeline
            target={{
              recordType: "bid",
              recordId: bid.id,
              name: bid.name,
              customer: bid.customer,
            }}
            title="Bid activity timeline"
          />

          <CommunicationsPanel
            target={{
              recordType: "bid",
              recordId: bid.id,
              name: bid.name,
              customer: bid.customer,
            }}
          />

          <div className="eci-card flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="font-medium">Bid package links</p>
              <p className="text-sm text-muted-foreground">
                Files live in OneDrive / SharePoint. Add the shared link for each folder or document.
              </p>
            </div>
            <Button onClick={() => setLinkOpen(true)}>
              <Plus className="mr-2 size-4" /> Add link
            </Button>
          </div>

          {bid.packageLinks.length ? (
            <div className="eci-card divide-y divide-black/5">
              {bid.packageLinks.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Added by {l.addedBy} · {l.at}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 size-4" /> Open in OneDrive
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${l.label}`}
                      onClick={() => removeBidPackageLink(bid.id, l.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No package links yet"
              hint="Add Exhibit A, Submittals, Supplier Quotes and other folders from OneDrive."
            />
          )}
        </TabsContent>

        {/* COMMUNICATIONS */}
        <TabsContent value="communications" className="space-y-6">
          <div className="eci-card flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="font-medium">Microsoft 365 email</p>
              <p className="text-sm text-muted-foreground">
                Integration placeholder — connected as dwhitfield@eci.com
              </p>
            </div>
            <Button onClick={openEmail}>Compose email</Button>
          </div>
          {bidEmails.length ? (
            <div className="eci-card divide-y divide-black/5">
              {bidEmails.map((e) => (
                <div key={e.id} className="space-y-1 p-5">
                  <p className="text-sm font-medium">{e.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    To {e.to} · {e.at} · {e.attachments.join(", ")}
                  </p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{e.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No email history yet" hint="Sent quotes and messages appear here." />
          )}
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <ol className="space-y-4">
            {bid.activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-eci-amber" />
                <div>
                  <p className="text-pretty text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.actor} · {a.at}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>

      {/* Submit for approval dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit quote for approval</DialogTitle>
            <DialogDescription>
              The standard approval group is preselected based on customer {bid.customer} and job
              type {bid.jobType}. Adjust approvers if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {EMPLOYEES.map((e) => (
              <label key={e} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={approvers.includes(e)}
                  onCheckedChange={(v) =>
                    setApprovers((prev) => (v ? [...prev, e] : prev.filter((p) => p !== e)))
                  }
                />
                {e}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                submitForApproval(bid.id, approvers);
                setSubmitOpen(false);
                toast.success("Submitted — approvers notified by Microsoft 365 email");
              }}
            >
              Submit and notify approvers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email composer */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send quote via Microsoft 365</DialogTitle>
            <DialogDescription>
              Nothing is emailed automatically — you review and send from here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Template">
              <Select defaultValue="quote">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote delivery</SelectItem>
                  <SelectItem value="followup">Quote follow-up</SelectItem>
                  <SelectItem value="revision">Revised quote</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="To">
              <Input
                value={emailForm.to}
                onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))}
              />
            </Field>
            <Field label="Subject">
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </Field>
            <Field label="Message">
              <Textarea
                rows={8}
                value={emailForm.body}
                onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))}
              />
            </Field>
            <div className="rounded-lg bg-muted p-3 text-sm">
              Attachment: <span className="font-medium">ECI-Quote-{bid.id}.pdf</span>
            </div>
            {approvalPending ? (
              <div
                role="status"
                className="rounded-lg border border-eci-amber/50 bg-eci-amber/10 p-3 text-sm"
              >
                <p className="font-medium">Approval required before this quote can be sent</p>
                <p className="text-muted-foreground">
                  {bid.stage === "Estimating"
                    ? "Submit the estimate for approval first — sending stays locked until every approver has approved."
                    : `Waiting on ${pendingApprovals.length} of ${bid.approvals.length} approvals before this can go out.`}
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => toast("Attach document — placeholder")}>
              Attach document
            </Button>
            <Button
              disabled={approvalPending}
              onClick={() => {
                sendQuote(bid.id, emailForm.to, emailForm.subject, emailForm.body);
                setEmailOpen(false);
                toast.success("Quote sent to customer");
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send bid / proposal — goes through the shared communications service */}
      <SendBidDialog
        open={sendBidOpen}
        onOpenChange={setSendBidOpen}
        bidId={bid.id}
        bidName={bid.name}
        customer={bid.customer}
        opportunityId={bid.opportunityId}
        defaultTo={`contracts@${bid.customer.toLowerCase().replace(/[^a-z]/g, "")}.com`}
        onSent={(info) => {
          // Keeps the existing stage advance, activity log and quote record.
          sendQuote(bid.id, info.to.join(", "), info.subject, info.body);
        }}
      />

      {/* Create job prompt */}
      <Dialog open={jobPromptOpen} onOpenChange={setJobPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create the job?</DialogTitle>
            <DialogDescription>
              Customer contacts, documents, activity history, and the quote and estimate will be
              copied into the new job, then prepared for Spectrum.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobPromptOpen(false)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                const jobId = createJobFromBid(bid.id);
                setJobPromptOpen(false);
                toast.success("Job created — sending to Spectrum");
                setTimeout(() => setJobSync(jobId, "Synced"), 1500);
                navigate({ to: "/jobs/$id", params: { id: jobId } });
              }}
            >
              Create job and send to Spectrum
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ADD PACKAGE LINK */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bid package link</DialogTitle>
            <DialogDescription>
              Paste the OneDrive / SharePoint share link for this part of the bid package.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Label">
              <Select value={linkLabel} onValueChange={setLinkLabel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BID_LINK_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom">Add custom link</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {linkLabel === "__custom" ? (
              <Field label="Custom label">
                <Input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. Addendum 2"
                />
              </Field>
            ) : null}
            <Field label="Link URL">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://electricalcontractorinc.sharepoint.com/..."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const label = linkLabel === "__custom" ? customLabel.trim() : linkLabel;
                const url = linkUrl.trim();
                if (!label) {
                  toast.error("Enter a label for this link");
                  return;
                }
                if (!/^https?:\/\//i.test(url)) {
                  toast.error("Enter a full link starting with https://");
                  return;
                }
                addBidPackageLink(bid.id, label, url);
                toast.success(`${label} link added`);
                setLinkOpen(false);
                setLinkUrl("");
                setCustomLabel("");
                setLinkLabel(BID_LINK_LABELS[0]);
              }}
            >
              Add link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
