import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import { IntegrationCard } from "@/components/eci/IntegrationCard";
import { DocumentsPanel } from "@/components/eci/DocumentsPanel";
import { CommunicationsPanel } from "@/components/eci/CommunicationsPanel";
import { CommunicationTimeline } from "@/components/eci/CommunicationTimeline";
import { WorkOrderCommsMenu } from "@/components/eci/WorkOrderCommsMenu";
import {
  DataRow,
  EmptyState,
  PageHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, useEci } from "@/lib/eci/store";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  head: () => ({
    meta: [
      { title: "Job Detail — ECI Operations" },
      {
        name: "description",
        content:
          "Job overview with customer, project address, division, manager, Spectrum job number, work orders, documents, photos and invoices.",
      },
      { property: "og:title", content: "Job Detail — ECI Operations" },
      {
        property: "og:description",
        content: "Everything about one electrical job: work orders, documents, invoices and history.",
      },
    ],
  }),
  component: JobDetail,
});

function JobDetail() {
  const { id } = Route.useParams();
  const { jobs, workOrders, invoices, materials, retrySpectrum } = useEci();

  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return (
      <AppShell>
        <EmptyState title="Job not found" />
      </AppShell>
    );
  }

  const wos = workOrders.filter((w) => w.jobId === job.id);
  const jobInvoices = invoices.filter((i) => i.jobId === job.id);
  const jobMaterials = materials.filter((m) => m.jobId === job.id);

  return (
    <AppShell>
      <PageHeader title={job.name} description={`${job.customer} · ${job.address}`}>
        <StatusBadge status={job.status} className="px-3 py-1.5 text-sm" />
      </PageHeader>

      <div className="eci-card grid grid-cols-2 gap-x-8 p-6 lg:grid-cols-4">
        <DataRow label="Division" value={job.division} />
        <DataRow label="Assigned manager" value={job.manager} />
        <DataRow
          label="Spectrum job number"
          value={<span className="font-mono">{job.spectrumNumber}</span>}
        />
        <DataRow label="Open work orders" value={wos.filter((w) => w.status !== "Complete").length} />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="estimate">Estimate & Quote</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SectionHeading title="Work orders" />
          <Accordion type="single" collapsible className="eci-card px-6">
            {wos.map((w) => (
              <AccordionItem key={w.id} value={w.id}>
                <AccordionTrigger>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pr-4 text-left">
                    <span className="text-sm font-medium">
                      {w.number} — {w.title}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={w.priority} />
                      <StatusBadge status={w.status} />
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {w.technician} · scheduled {w.scheduled}
                  </p>
                  <WorkOrderCommsMenu
                    workOrderId={w.id}
                    number={w.number}
                    jobId={job.id}
                    customer={job.customer}
                    technician={w.technician}
                    scheduled={w.scheduled}
                  />
                  <ul className="space-y-1 text-sm">
                    {w.tasks.map((t) => (
                      <li key={t.id} className={t.done ? "text-muted-foreground line-through" : ""}>
                        {t.label}
                      </li>
                    ))}
                  </ul>
                  {w.notes.map((n) => (
                    <p key={n} className="rounded-lg bg-muted p-3 text-sm">
                      {n}
                    </p>
                  ))}
                  {(w.photos ?? []).length > 0 ? (
                    <div>
                      <p className="pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Field photos
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {(w.photos ?? []).map((ph) => (
                          <figure key={ph.id} className="overflow-hidden rounded-lg ring-1 ring-black/5">
                            <img src={ph.src} alt={ph.caption} className="h-24 w-full object-cover" loading="lazy" />
                            <figcaption className="px-2 py-1.5 text-xs text-muted-foreground">
                              {ph.caption} · {ph.at}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {w.completion ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                      <p className="font-medium text-emerald-900 dark:text-emerald-200">
                        Completed by {w.technician} · {w.completion.completedAt}
                      </p>
                      <p className="mt-1">{w.completion.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {w.completion.hours} hrs · Materials: {w.completion.materialsUsed} ·
                        Signed by {w.completion.signedBy}
                      </p>
                    </div>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
            {wos.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No work orders on this job yet.</p>
            ) : null}
          </Accordion>

          <DocumentsPanel
            target={{
              recordType: "job",
              recordId: job.id,
              name: job.name,
              customer: job.customer,
            }}
            title="Documents associated with this job"
          />

          <CommunicationTimeline
            target={{
              recordType: "job",
              recordId: job.id,
              name: job.name,
              customer: job.customer,
            }}
            title="Job activity timeline"
          />

          <CommunicationsPanel
            target={{
              recordType: "job",
              recordId: job.id,
              name: job.name,
              customer: job.customer,
            }}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="eci-card p-6">
              <SectionHeading title="Documents, photos & receipts" />
              <div className="mt-3 divide-y divide-black/5">
                {job.documents.map((d) => (
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
                {job.documents.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">No documents yet.</p>
                ) : null}
              </div>
            </div>

            <div className="eci-card p-6">
              <SectionHeading title="Material requests" />
              <div className="mt-3 divide-y divide-black/5">
                {jobMaterials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{m.item}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.qty} · {m.poNumber ?? "no PO yet"}
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                ))}
                {jobMaterials.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">No material requests.</p>
                ) : null}
              </div>
            </div>
          </div>

          <SectionHeading title="Integrations" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <IntegrationCard
              integration={{
                name: "Spectrum — Jobs & Phases",
                purpose: "Job, phases, cost codes and work orders",
                state: job.spectrumSync,
                lastSync: job.spectrumSync === "Synced" ? "Just now" : "Never",
              }}
              onRetry={() => {
                retrySpectrum(job.id);
                toast("Retrying Spectrum sync…");
              }}
            />
            <IntegrationCard
              integration={{
                name: "Microsoft 365",
                purpose: "Customer email and quote delivery",
                state: "Synced",
                lastSync: "3 minutes ago",
              }}
            />
            <IntegrationCard
              integration={{
                name: "Document storage",
                purpose: "Job documents, photos and receipts",
                state: "Synced",
                lastSync: "12 minutes ago",
              }}
            />
          </div>

          <SectionHeading title="History & communications" />
          <ol className="space-y-4">
            {job.activity.map((a) => (
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
            {job.activity.length === 0 ? (
              <li className="text-sm text-muted-foreground">No history recorded yet.</li>
            ) : null}
          </ol>
        </TabsContent>

        <TabsContent value="contacts">
          <div className="eci-card divide-y divide-black/5">
            {job.contacts.map((ct) => (
              <div key={ct.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-medium">{ct.name}</p>
                  <p className="text-sm text-muted-foreground">{ct.title}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{ct.email}</p>
                  <p className="text-muted-foreground">{ct.phone}</p>
                </div>
              </div>
            ))}
            {job.contacts.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No contacts copied to this job.</p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="estimate">
          <div className="eci-card space-y-3 p-6">
            <SectionHeading title="Contract value" />
            <p className="text-3xl font-semibold">{money(job.contractValue)}</p>
            <p className="text-sm text-muted-foreground">
              {job.bidId
                ? `Copied from bid ${job.bidId}, including the approved quote PDF and estimate detail.`
                : "Estimate detail was imported from Spectrum."}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          {jobInvoices.length ? (
            <div className="eci-card divide-y divide-black/5">
              {jobInvoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm font-medium">Invoice #{i.number}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {i.issued} · due {i.due}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm">{money(i.amount)}</span>
                    <StatusBadge status={i.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No invoices on this job yet" />
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
