import { createFileRoute, Link } from "@tanstack/react-router";
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
  useCustomers,
  useIsOffice,
  useJobs,
  useTechNames,
  type JobStatus,
} from "@/data";
import { JOB_STATUS_LABEL } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/jobs/")({
  component: Page,
});

function Page() {
  const isOffice = useIsOffice();
  const jobs = useJobs();
  const customers = useCustomers();
  const techs = useTechNames();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("all");

  const customerName = new Map((customers.data ?? []).map((c) => [c.id, c.name]));
  const techName = new Map((techs.data ?? []).map((t) => [t.identityId, t.name]));

  const rows = (jobs.data ?? [])
    .filter((j) => status === "all" || j.status === status)
    .filter((j) =>
      matches(q, j.jobNumber, j.description, j.jobType, customerName.get(j.customerId)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" description="Every job, newest first.">
        {isOffice ? (
          <Button asChild>
            <Link to="/jobs/new">New job</Link>
          </Button>
        ) : null}
      </PageHeader>
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
          title={q || status !== "all" ? "No jobs match your filters" : "No jobs yet"}
          hint={
            q || status !== "all"
              ? "Clear the search or pick All statuses."
              : isOffice
                ? "Use New job when a customer calls."
                : "Jobs appear here once the office creates them."
          }
        />
      ) : (
        <div className="eci-card overflow-x-auto">
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
                <TableRow key={j.id}>
                  <TableCell className="font-medium">
                    <Link to="/jobs/$id" params={{ id: j.id }} className="hover:underline">
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
      )}
    </div>
  );
}
