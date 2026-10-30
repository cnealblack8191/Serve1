import { createFileRoute, Link } from "@tanstack/react-router";
import { Navigation, Phone } from "lucide-react";
import { useState } from "react";

import { DataRow, EmptyState } from "@/components/eci/primitives";
import { BottomAction, PRIMARY_BUTTON } from "@/components/serv1/tech/BottomAction";
import { DoneScreen } from "@/components/serv1/tech/DoneScreen";
import { directionsUrl, telUrl, timeRange, dayLabel } from "@/components/serv1/tech/format";
import { JobNotes } from "@/components/serv1/tech/JobNotes";
import { JobPhotos } from "@/components/serv1/tech/JobPhotos";
import { JobStatusBadge, PriorityTag } from "@/components/serv1/tech/JobStatusBadge";
import { SignatureStep } from "@/components/serv1/tech/SignatureStep";
import { Button } from "@/components/ui/button";
import {
  useCustomers,
  useFileUrl,
  useJob,
  useJobMutations,
  useJobSignature,
  useSites,
} from "@/data";

/** Tech job screen (SPEC.md W3): details, Start Job, photos and notes, Complete, signature. */
export const Route = createFileRoute("/_authenticated/tech/$id")({
  component: Page,
});

type Step = "detail" | "sign" | "done";

function Page() {
  const { id } = Route.useParams();
  const job = useJob(id);
  const customers = useCustomers();
  const sites = useSites();
  const { update } = useJobMutations();
  const signature = useJobSignature(id);
  const signatureUrl = useFileUrl(signature.data?.storagePath);
  const [step, setStep] = useState<Step>("detail");

  if (job.isLoading) return <p className="text-base text-muted-foreground">Loading job…</p>;
  const j = job.data;
  if (!j) {
    return (
      <>
        <BackLink />
        <EmptyState title="Job not found" hint="It may not be assigned to you." />
      </>
    );
  }

  const customer = customers.data?.find((c) => c.id === j.customerId);
  const site = j.siteId ? sites.data?.find((s) => s.id === j.siteId) : undefined;

  if (step === "done") return <DoneScreen customerName={customer?.name} />;
  if (step === "sign") {
    return (
      <SignatureStep
        job={j}
        customerName={customer?.name}
        onBack={() => setStep("detail")}
        onDone={() => setStep("done")}
      />
    );
  }

  const notStarted = j.status === "New" || j.status === "Scheduled";
  const working = j.status === "InProgress";

  const start = () =>
    update.mutate({
      id: j.id,
      patch: { status: "InProgress", startedAt: new Date().toISOString() },
    });

  return (
    <>
      <BackLink />
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold leading-tight">{customer?.name ?? "Job"}</h1>
          <JobStatusBadge status={j.status} />
        </div>
        <p className="text-base font-medium">
          {dayLabel(j.scheduledStart)}, {timeRange(j)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {j.jobNumber ? (
            <span className="text-sm text-muted-foreground">{j.jobNumber}</span>
          ) : null}
          {j.jobType ? <span className="text-sm text-muted-foreground">{j.jobType}</span> : null}
          <PriorityTag priority={j.priority} />
        </div>
      </div>

      <section className="eci-card px-4">
        <DataRow label="Work to do" value={<span className="text-base">{j.description}</span>} />
        <DataRow
          label="Site"
          value={
            site ? (
              <span className="text-base">
                {site.name ? <span className="block font-medium">{site.name}</span> : null}
                {site.address}
              </span>
            ) : (
              "No site on file"
            )
          }
        />
        <DataRow
          label="Access notes"
          value={<span className="text-base">{site?.accessNotes || "None"}</span>}
        />
      </section>

      <div className="grid grid-cols-2 gap-3">
        {customer?.phone ? (
          <Button asChild variant="outline" className="h-12 text-base">
            <a href={telUrl(customer.phone)} aria-label={`Call ${customer.phone}`}>
              <Phone aria-hidden />
              Call
            </a>
          </Button>
        ) : null}
        {site ? (
          <Button asChild variant="outline" className="h-12 text-base">
            <a href={directionsUrl(site.address)} target="_blank" rel="noreferrer">
              <Navigation aria-hidden />
              Directions
            </a>
          </Button>
        ) : null}
      </div>
      {customer?.phone ? (
        <p className="-mt-2 text-sm text-muted-foreground">Customer phone: {customer.phone}</p>
      ) : null}

      {working || j.status === "Complete" || j.status === "Invoiced" ? (
        <JobPhotos jobId={j.id} canAdd={working} />
      ) : null}

      {working ? <JobNotes job={j} /> : null}
      {!working && j.notes ? (
        <section className="space-y-1">
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-base">{j.notes}</p>
        </section>
      ) : null}

      {signature.data ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Signature</h2>
          {signatureUrl.data ? (
            <img
              src={signatureUrl.data}
              alt={`Signature of ${signature.data.signerName}`}
              className="h-28 w-full rounded-md bg-white object-contain ring-1 ring-border"
            />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Signed by {signature.data.signerName},{" "}
            {new Date(signature.data.signedAt).toLocaleString()}
          </p>
        </section>
      ) : null}

      {update.isError ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Could not update the job. Try again.
        </p>
      ) : null}

      {notStarted ? (
        <BottomAction>
          <Button className={PRIMARY_BUTTON} onClick={start} disabled={update.isPending}>
            {update.isPending ? "Starting…" : "Start Job"}
          </Button>
        </BottomAction>
      ) : working ? (
        <BottomAction>
          <Button className={PRIMARY_BUTTON} onClick={() => setStep("sign")}>
            Complete
          </Button>
        </BottomAction>
      ) : null}
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/tech"
      className="-ml-2 inline-flex min-h-12 items-center px-2 text-base font-medium text-primary"
    >
      ← Today
    </Link>
  );
}
