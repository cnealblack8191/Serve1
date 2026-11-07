import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState, PageHeader } from "@/components/eci/primitives";
import { JobStatusBadge } from "@/components/serv1/office/JobStatusBadge";
import { matches } from "@/components/serv1/office/matches";
import { SearchBox } from "@/components/serv1/office/SearchBox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  JOB_STATUSES,
  WORK_TYPES,
  useAttachments,
  useCustomers,
  useIsOffice,
  useJobs,
  useTechNames,
  type JobStatus,
  type WorkType,
} from "@/data";
import {
  JOB_ATTENTION_LABEL,
  jobNeedsAttention,
  type JobAttention,
} from "@/components/serv1/sales/attention";
import { JOB_STATUS_LABEL } from "@/lib/status";
import { requireRole, OFFICE_VIEW } from "@/lib/access";

interface Search {
  attention?: JobAttention;
  type?: WorkType;
}

export const Route = createFileRoute("/_authenticated/jobs/")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_VIEW),
  // Dashboard "Needs attention" links open this list pre-filtered.
  validateSearch: (s: Record<string, unknown>): Search => ({
    attention:
      s["attention"] === "pastEndDate" || s["attention"] === "noPhotos"
        ? s["attention"]
        : undefined,
    type: WORK_TYPES.includes(s["type"] as WorkType) ? (s["type"] as WorkType) : undefined,
  }),
  component: Page,
});

function Page() {
  const isOffice = useIsOffice();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const attachments = useAttachments();
  const photoJobIds = new Set(
    (attachments.data ?? []).filter((a) => a.type === "Photo").map((a) => a.jobId),
  );
  const jobs = useJobs();
  const customers = useCustomers();
  const techs = useTechNames();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("all");

  const customerName = new Map((customers.data ?? []).map((c) => [c.id, c.name]));
  const techName = new Map((techs.data ?? []).map((t) => [t.identityId, t.name]));

  const rows = (jobs.data ?? [])
    .filter((j) => status === "all" || j.status === status)
    .filter((j) => !search.type || j.workType === search.type)
    .filter((j) => !search.attention || jobNeedsAttention(j, search.attention, photoJobIds))
    .filter((j) =>
      matches(q, j.jobNumber, j.description, j.jobType, customerName.get(j.customerId)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description={
          search.attention ? JOB_ATTENTION_LABEL[search.attention] : "Every job, newest first."
        }
      >
        {isOffice ? (
          <Button asChild>
            <Link to="/jobs/new">New job</Link>
          </Button>
        ) : null}
      </PageHeader>
      {search.attention ? (
        <Button asChild variant="outline" size="sm">
          <Link to="/jobs" search={{}}>
            Show all jobs
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search jobs"
          placeholder="Search by job number, customer or description"
          value={q}
          onChange={setQ}
        />
        <Select value={status} onValueChange={(v) => setStatus(v as JobStatus | "all")}>
          <SelectTrigger aria-label="Filter by status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {JOB_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {jobs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading jobs…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            q || status !== "all" || search.attention ? "No jobs match your filters" : "No jobs yet"
          }
          hint={
            q || status !== "all" || search.attention
              ? "Clear the search or pick All statuses."
              : isOffice
                ? "Use New job when a customer calls."
                : "Jobs appear here once the office creates them."
          }
        />
      ) : (
        <>
          {/* Phones: one card per job; the whole card opens the job. */}
          <ul className="space-y-3 md:hidden" aria-label="Jobs">
            {rows.map((j) => (
              <li key={j.id}>
                <Link
                  to="/jobs/$id"
                  params={{ id: j.id }}
                  className="eci-card block space-y-1 p-4 hover:bg-muted/50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{j.jobNumber ?? "Job"}</span>
                      <span className="block truncate text-sm">
                        {customerName.get(j.customerId) ?? "—"}
                      </span>
                    </span>
                    <JobStatusBadge status={j.status} />
                  </span>
                  <span className="line-clamp-2 block text-sm text-muted-foreground">
                    {j.description}
                  </span>
                  <span className="block text-sm">
                    Tech: {(j.assignedTechId && techName.get(j.assignedTechId)) || "Unassigned"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {/* Wider screens: a table; clicking anywhere on a row opens the job. */}
          <div className="eci-card hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Tech</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((j) => (
                  <TableRow
                    key={j.id}
                    className="cursor-pointer"
                    onClick={() => void navigate({ to: "/jobs/$id", params: { id: j.id } })}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to="/jobs/$id"
                        params={{ id: j.id }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {j.jobNumber ?? "Job"}
                      </Link>
                    </TableCell>
                    <TableCell>{customerName.get(j.customerId) ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{j.description}</TableCell>
                    <TableCell>
                      {(j.assignedTechId && techName.get(j.assignedTechId)) || "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={j.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
