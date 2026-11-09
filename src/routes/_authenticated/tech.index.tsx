import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { byStart, isToday, OPEN_STATUSES } from "@/components/serv1/tech/format";
import { TechJobCard } from "@/components/serv1/tech/TechJobCard";
import { useCurrentUser, useCustomers, useJobs, useSites, useVisits, visitEntries } from "@/data";
import { requireRole, TECH_ONLY } from "@/lib/access";

/** Tech home (SPEC.md W3): today's jobs by time, then the tech's other open jobs. */
export const Route = createFileRoute("/_authenticated/tech/")({
  beforeLoad: ({ context }) => requireRole(context.user.role, TECH_ONLY),
  component: Page,
});

function Page() {
  // The backend already limits a tech to their own jobs.
  const jobs = useJobs();
  const visits = useVisits();
  const me = useCurrentUser();
  const customers = useCustomers();
  const sites = useSites();

  // One card per visit of mine (docs/VISITS.md); a job with no visits is its own one visit.
  const all = visitEntries(jobs.data ?? [], visits.data ?? []).filter(
    (e) => e.assignedTechId === me.data?.identityId,
  );
  const today = all.filter((j) => isToday(j.scheduledStart)).sort(byStart);
  const later = all
    .filter((j) => !isToday(j.scheduledStart) && OPEN_STATUSES.includes(j.status))
    .sort(byStart);

  const customer = (id: string) => customers.data?.find((c) => c.id === id);
  const site = (id: string | null) => (id ? sites.data?.find((s) => s.id === id) : undefined);
  const dateLabel = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <PageHeader title="Today" description={dateLabel} />

      {jobs.isLoading || visits.isLoading || me.isLoading ? (
        <p className="text-base text-muted-foreground">Loading jobs…</p>
      ) : jobs.isError ? (
        <EmptyState title="Could not load your jobs" hint="Check your connection and try again." />
      ) : today.length ? (
        <section className="space-y-3" aria-label="Today's jobs">
          {today.map((j) => (
            <TechJobCard
              key={j.entryId}
              job={j}
              customer={customer(j.customerId)}
              site={site(j.siteId)}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="No jobs today"
          hint="Jobs assigned to you appear here when the office schedules them."
        />
      )}

      {later.length ? (
        <section className="space-y-3 pt-2" aria-label="Later">
          <h2 className="text-lg font-semibold">Later</h2>
          {later.map((j) => (
            <TechJobCard
              key={j.entryId}
              job={j}
              customer={customer(j.customerId)}
              site={site(j.siteId)}
              showDay
            />
          ))}
        </section>
      ) : null}
    </>
  );
}
