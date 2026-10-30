import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { DataRow, EmptyState, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { JobStatusBadge } from "@/components/serv1/office/JobStatusBadge";
import { SiteDialog } from "@/components/serv1/office/SiteDialog";
import { Button } from "@/components/ui/button";
import { useCustomer, useJobs, useSites, type Site } from "@/data";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const customer = useCustomer(id);
  const sites = useSites();
  const jobs = useJobs();
  const [editing, setEditing] = useState<Site | null>(null);
  const [adding, setAdding] = useState(false);

  if (customer.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!customer.data) {
    return (
      <>
        <PageHeader title="Customer" />
        <EmptyState
          title="Customer not found"
          hint="It may have been removed. Go back to Customers."
        />
      </>
    );
  }
  const c = customer.data;
  const mySites = (sites.data ?? []).filter((s) => s.customerId === id);
  const myJobs = (jobs.data ?? [])
    .filter((j) => j.customerId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-8">
      <PageHeader title={c.name}>
        <Button asChild>
          <Link to="/jobs/new" search={{ customerId: id }}>
            New job
          </Link>
        </Button>
      </PageHeader>

      <section className="eci-card px-5 py-2">
        <DataRow label="Phone" value={c.phone ?? "—"} />
        <DataRow label="Email" value={c.email ?? "—"} />
        <DataRow label="Billing address" value={c.billingAddress ?? "—"} />
        {c.notes ? <DataRow label="Notes" value={c.notes} /> : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <SectionHeading title="Sites" />
          <Button variant="outline" onClick={() => setAdding(true)}>
            Add site
          </Button>
        </div>
        {mySites.length === 0 ? (
          <EmptyState title="No sites yet" hint="Add the address where work is done." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {mySites.map((s) => (
              <li key={s.id} className="eci-card space-y-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{s.name ?? s.address}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit site ${s.name ?? s.address}`}
                    onClick={() => setEditing(s)}
                  >
                    Edit
                  </Button>
                </div>
                {s.name ? <p className="text-sm">{s.address}</p> : null}
                <p className="text-sm text-muted-foreground">
                  Access: {s.accessNotes ?? "none"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Jobs" />
        {myJobs.length === 0 ? (
          <EmptyState title="No jobs for this customer" hint="Use New job to create one." />
        ) : (
          <ul className="eci-card divide-y divide-border/70">
            {myJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link to="/jobs/$id" params={{ id: j.id }} className="min-w-0 hover:underline">
                  <span className="font-medium">{j.jobNumber ?? "Job"}</span>
                  <span className="ml-2 truncate text-sm text-muted-foreground">
                    {j.description}
                  </span>
                </Link>
                <JobStatusBadge status={j.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SiteDialog open={adding} onOpenChange={setAdding} customerId={id} />
      <SiteDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        customerId={id}
        site={editing}
      />
    </div>
  );
}
