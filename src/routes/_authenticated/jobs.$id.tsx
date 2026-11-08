import { createFileRoute, Link } from "@tanstack/react-router";

import { DataRow, EmptyState, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { JobStatusBadge } from "@/components/serv1/office/JobStatusBadge";
import { JobActions } from "@/components/serv1/office/JobActions";
import { JobTracking } from "@/components/serv1/office/JobTracking";
import { StoredImage } from "@/components/serv1/office/StoredImage";
import { TechWork } from "@/components/serv1/office/TechWork";
import { Button } from "@/components/ui/button";
import {
  useAttachments,
  useCustomer,
  useJob,
  useSignatures,
  useSites,
  useUsers,
  useInvoices,
  useIsOffice,
} from "@/data";
import { JOB_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/status";
import { requireRole, OFFICE_VIEW } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_VIEW),
  component: Page,
});

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function Page() {
  const { id } = Route.useParams();
  const job = useJob(id);
  const isOffice = useIsOffice();
  const customer = useCustomer(job.data?.customerId);
  const sites = useSites();
  // Full roster, so a job keeps the name of a tech who has since been turned off.
  const techs = useUsers();
  const attachments = useAttachments();
  const signatures = useSignatures();
  const invoices = useInvoices();

  if (job.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!job.data) {
    return (
      <>
        <PageHeader title="Job" />
        <EmptyState title="Job not found" hint="It may have been removed. Go back to Jobs." />
      </>
    );
  }
  const j = job.data;
  const site = (sites.data ?? []).find((s) => s.id === j.siteId);
  const tech = j.assignedTechId
    ? (techs.data ?? []).find((t) => t.identityId === j.assignedTechId)
    : undefined;
  const photos = (attachments.data ?? []).filter((a) => a.jobId === id);
  const sigs = (signatures.data ?? []).filter((s) => s.jobId === id);
  const invoice = (invoices.data ?? []).find((i) => i.jobId === id);

  return (
    <div className="space-y-8">
      <PageHeader title={`${j.jobNumber ?? "Job"} · ${j.jobType ?? "Job"}`}>
        <JobStatusBadge status={j.status} />
        {invoice ? (
          <Button asChild variant="outline">
            <Link to="/invoices/$id" params={{ id: invoice.id }}>
              View invoice
            </Link>
          </Button>
        ) : isOffice && (j.status === "Complete" || j.status === "Reviewed") ? (
          <Button asChild>
            <Link to="/invoices">Create invoice</Link>
          </Button>
        ) : null}
      </PageHeader>

      <JobActions job={j} />

      {j.status === "OnHold" || j.status === "Cancelled" ? (
        <p className="eci-card p-4 text-sm" role="status">
          <span className="font-semibold">{JOB_STATUS_LABEL[j.status]}:</span>{" "}
          {j.holdReason ?? "no reason given"}
          {j.status === "OnHold" && j.holdNote ? ` — ${j.holdNote}` : ""}
        </p>
      ) : null}
      {j.reviewNote ? (
        <p className="eci-card p-4 text-sm" role="status">
          <span className="font-semibold">Sent back:</span> {j.reviewNote}
        </p>
      ) : null}
      {j.reviewedAt ? (
        <p className="text-sm text-muted-foreground">Reviewed {fmt(j.reviewedAt)}</p>
      ) : null}

      <section className="eci-card grid gap-x-8 px-5 py-2 md:grid-cols-2">
        <DataRow
          label="Customer"
          value={
            customer.data ? (
              <Link
                to="/customers/$id"
                params={{ id: customer.data.id }}
                className="hover:underline"
              >
                {customer.data.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <DataRow
          label="Site"
          value={site ? `${site.name ? `${site.name}, ` : ""}${site.address}` : "—"}
        />
        <DataRow label="Access notes" value={site?.accessNotes ?? "None"} />
        <DataRow label="Priority" value={PRIORITY_LABEL[j.priority]} />
        <DataRow label="Assigned tech" value={tech?.name ?? "Unassigned"} />
        <DataRow
          label="Scheduled"
          value={
            j.scheduledStart ? `${fmt(j.scheduledStart)} – ${fmt(j.scheduledEnd)}` : "Not scheduled"
          }
        />
        <DataRow label="Description" value={j.description} />
        <DataRow label="Notes" value={j.notes ?? "No notes yet"} />
        <DataRow label="Started" value={fmt(j.startedAt)} />
        <DataRow label="Completed" value={fmt(j.completedAt)} />
      </section>

      <JobTracking
        job={j}
        canEdit={isOffice}
        photoCount={photos.filter((a) => a.type === "Photo").length}
      />

      <TechWork job={j} canEdit={isOffice} />

      <section className="space-y-3">
        <SectionHeading title="Photos and files" />
        {photos.length === 0 ? (
          <EmptyState title="No photos yet" hint="Photos the tech takes on site appear here." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((a) => (
              <li key={a.id} className="eci-card space-y-2 p-3">
                <StoredImage path={a.storagePath} alt={a.caption ?? "Job photo"} />
                {a.caption ? <p className="text-sm text-muted-foreground">{a.caption}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Customer signature" />
        {sigs.length === 0 ? (
          <EmptyState
            title="Not signed yet"
            hint="The customer signs when the tech completes the job."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sigs.map((s) => (
              <li key={s.id} className="eci-card space-y-2 p-3">
                <StoredImage path={s.storagePath} alt={`Signature of ${s.signerName}`} />
                <p className="text-sm">
                  {s.signerName} · <span className="text-muted-foreground">{fmt(s.signedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
