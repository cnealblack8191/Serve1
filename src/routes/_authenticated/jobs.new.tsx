import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Field, PageHeader } from "@/components/eci/primitives";
import { CustomerDialog } from "@/components/serv1/office/CustomerDialog";
import { matches } from "@/components/serv1/office/matches";
import { SearchBox } from "@/components/serv1/office/SearchBox";
import { SiteDialog } from "@/components/serv1/office/SiteDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isOfficeRole,
  JOB_PRIORITIES,
  newJobNumber,
  useCustomers,
  useJobMutations,
  useSites,
  type JobPriority,
} from "@/data";
import { PRIORITY_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

const JOB_TYPES = ["Service call", "Repair", "Install", "Inspection", "Emergency"];

export const Route = createFileRoute("/_authenticated/jobs/new")({
  beforeLoad: ({ context }) => {
    if (!isOfficeRole(context.user.role)) throw redirect({ to: "/jobs" });
  },
  validateSearch: (s: Record<string, unknown>): { customerId?: string } =>
    typeof s["customerId"] === "string" ? { customerId: s["customerId"] } : {},
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const customers = useCustomers();
  const sites = useSites();
  const { create } = useJobMutations();

  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState(search.customerId ?? "");
  const [siteId, setSiteId] = useState("");
  const [jobType, setJobType] = useState(JOB_TYPES[0]!);
  const [priority, setPriority] = useState<JobPriority>("Normal");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addingSite, setAddingSite] = useState(false);

  const customer = (customers.data ?? []).find((c) => c.id === customerId);
  const mySites = (sites.data ?? []).filter((s) => s.customerId === customerId);
  // A customer with exactly one site needs no extra click.
  const effectiveSiteId = siteId || (mySites.length === 1 ? mySites[0]!.id : "");
  const results = (customers.data ?? [])
    .filter((c) => matches(q, c.name, c.phone, c.email))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 6);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!customerId) return setError("Choose a customer first.");
    if (!effectiveSiteId) return setError("Choose a site, or add one.");
    if (!description.trim()) return setError("Describe the work to be done.");
    try {
      const job = await create.mutateAsync({
        jobNumber: newJobNumber(),
        customerId,
        siteId: effectiveSiteId,
        description: description.trim(),
        jobType,
        priority,
        status: "New",
        assignedTechId: null,
        scheduledStart: null,
        scheduledEnd: null,
        startedAt: null,
        completedAt: null,
        notes: null,
        laborHours: null,
      });
      void navigate({ to: "/jobs/$id", params: { id: job.id } });
    } catch {
      setError("Couldn't save the job. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <PageHeader
        title="New job"
        description="Take the call: customer, site, then what needs doing."
      >
        <Button type="submit" disabled={create.isPending}>
          Save job
        </Button>
      </PageHeader>

      <section className="eci-card space-y-3 p-5">
        <h2 className="eci-panel-title">1. Customer</h2>
        {customer ? (
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{customer.name}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomerId("");
                setSiteId("");
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <SearchBox
              label="Find customer"
              placeholder="Search customers by name or phone"
              value={q}
              onChange={setQ}
            />
            <ul className="divide-y divide-border/70">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn("w-full px-2 py-2 text-left text-sm hover:bg-accent")}
                    onClick={() => setCustomerId(c.id)}
                  >
                    {c.name}
                    {c.phone ? <span className="ml-2 text-muted-foreground">{c.phone}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customer matches. Add a new one.</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingCustomer(true)}
            >
              Add new customer
            </Button>
          </>
        )}
      </section>

      {customer ? (
        <section className="eci-card space-y-3 p-5">
          <h2 className="eci-panel-title">2. Site</h2>
          {mySites.length === 0 ? (
            <p className="text-sm text-muted-foreground">This customer has no sites yet.</p>
          ) : (
            <Field label="Site">
              <Select value={effectiveSiteId} onValueChange={setSiteId}>
                <SelectTrigger aria-label="Site">
                  <SelectValue placeholder="Choose a site" />
                </SelectTrigger>
                <SelectContent>
                  {mySites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ? `${s.name} — ${s.address}` : s.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setAddingSite(true)}>
            Add new site
          </Button>
        </section>
      ) : null}

      <section className="eci-card space-y-4 p-5">
        <h2 className="eci-panel-title">3. The work</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job type">
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger aria-label="Job type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onValueChange={(v) => setPriority(v as JobPriority)}>
              <SelectTrigger aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is wrong, and what does the customer need?"
          />
        </Field>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <CustomerDialog
        open={addingCustomer}
        onOpenChange={setAddingCustomer}
        onSaved={(c) => {
          setCustomerId(c.id);
          setSiteId("");
          setAddingSite(true);
        }}
      />
      <SiteDialog
        open={addingSite}
        onOpenChange={setAddingSite}
        customerId={customerId}
        onSaved={(s) => setSiteId(s.id)}
      />
    </form>
  );
}
