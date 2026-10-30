import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { DataRow, EmptyState, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { JobStatusBadge } from "@/components/serv1/office/JobStatusBadge";
import { Button } from "@/components/ui/button";
import {
  fileUrl,
  useAttachments,
  useCustomer,
  useJob,
  useSignatures,
  useSites,
  useTechNames,
  useIsOffice,
} from "@/data";
import { PRIORITY_LABEL } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
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

/** Shows a stored file through a short-lived link. */
function StoredImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    fileUrl(path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(""));
    return () => {
      live = false;
    };
  }, [path]);
  if (!url)
    return <div className="aspect-video rounded-md bg-muted" aria-label={`${alt} (loading)`} />;
  return <img src={url} alt={alt} className="aspect-video w-full rounded-md object-cover" />;
}

function Page() {
  const { id } = Route.useParams();
  const job = useJob(id);
  const isOffice = useIsOffice();
  const customer = useCustomer(job.data?.customerId);
  const sites = useSites();
  const techs = useTechNames();
  const attachments = useAttachments();
  const signatures = useSignatures();

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
  const tech = (techs.data ?? []).find((t) => t.identityId === j.assignedTechId);
  const photos = (attachments.data ?? []).filter((a) => a.jobId === id);
  const sigs = (signatures.data ?? []).filter((s) => s.jobId === id);

  return (
    <div className="space-y-8">
      <PageHeader title={`${j.jobNumber ?? "Job"} · ${j.jobType ?? "Job"}`}>
        <JobStatusBadge status={j.status} />
        {isOffice ? (
          <Button asChild>
            <Link to="/invoices">Create invoice</Link>
          </Button>
        ) : null}
      </PageHeader>

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
