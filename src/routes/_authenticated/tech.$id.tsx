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
import { HoldDialog } from "@/components/serv1/tech/HoldDialog";
import { SignatureStep } from "@/components/serv1/tech/SignatureStep";
import { visitWhen } from "@/components/serv1/visits/format";
import { VisitList } from "@/components/serv1/visits/VisitList";
import { JOB_STATUS_CLASS, JOB_STATUS_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  currentVisit,
  isFinished,
  isLastOpenVisit,
  isOpenVisit,
  isReturnHold,
  useCurrentUser,
  useTechNames,
  useVisitActions,
  useVisits,
  visitsOf,
  useCustomers,
  useFileUrl,
  useJob,
  useJobMove,
  useJobMutations,
  useJobSignature,
  useSites,
} from "@/data";
import { requireRole, TECH_ONLY } from "@/lib/access";

/** Tech job screen (SPEC.md W3): details, Start Job, photos and notes, Complete, signature. */
export const Route = createFileRoute("/_authenticated/tech/$id")({
  beforeLoad: ({ context }) => requireRole(context.user.role, TECH_ONLY),
  component: Page,
});

/** Keyed by job id, so moving to another job always starts again at its details (never at "sign"). */
function Page() {
  const { id } = Route.useParams();
  return <JobScreen key={id} id={id} />;
}

type Step = "detail" | "sign" | "done" | "visitDone";

function JobScreen({ id }: { id: string }) {
  const job = useJob(id);
  const customers = useCustomers();
  const sites = useSites();
  const { update } = useJobMutations();
  const move = useJobMove();
  const [holding, setHolding] = useState(false);
  const signature = useJobSignature(id);
  const signatureUrl = useFileUrl(signature.data?.storagePath);
  const [signatureUnreadable, setSignatureUnreadable] = useState(false);
  const [step, setStep] = useState<Step>("detail");
  const visits = useVisits();
  const me = useCurrentUser();
  const techs = useTechNames();
  const visitActions = useVisitActions();
  // The visit being ended, kept while the dialog is open so a retry ends the same visit.
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [nextText, setNextText] = useState("");

  if (job.isLoading || visits.isLoading)
    return <p className="text-base text-muted-foreground">Loading job…</p>;
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

  // Multi-visit jobs (docs/VISITS.md): the tech acts on the job only while its current visit is
  // theirs; a job with no visits is its own one visit.
  const { visits: vs, implied } = visitsOf(j, visits.data ?? []);
  const cur = currentVisit(vs);
  const myId = me.data?.identityId ?? null;
  const myTurn = implied || (!!cur && cur.assignedTechId === myId);
  // The job passes to the next visit's tech when the office hands it over (only the office
  // reassigns a job); until then that tech sees the job but cannot change it.
  const mine = myTurn && (implied || j.assignedTechId === myId);
  const waitingHandover = myTurn && !mine;
  const myNext = vs.find((v) => isOpenVisit(v) && v.assignedTechId === myId) ?? null;
  const shown = (mine ? cur : myNext) ?? cur ?? vs[vs.length - 1]!;
  const lastVisit = !cur || isLastOpenVisit(vs, cur);
  const endingId = finishingId ?? cur?.id ?? null;
  const nextPlanned = endingId ? vs.find((v) => v.id !== endingId && isOpenVisit(v)) : undefined;
  const techName = (id: string | null) =>
    techs.data?.find((t) => t.identityId === id)?.name ?? "another tech";

  if (step === "done") return <DoneScreen customerName={customer?.name} />;
  if (step === "visitDone") return <DoneScreen visitDone={nextText} />;
  // Signing completes the job, so it is offered only while the job is In Progress, on its last
  // open visit, to that visit's tech.
  if (step === "sign" && j.status === "InProgress" && mine && lastVisit) {
    return (
      <SignatureStep
        job={j}
        customerName={customer?.name}
        onBack={() => setStep("detail")}
        onDone={() => setStep("done")}
      />
    );
  }

  const notStarted =
    mine && (j.status === "New" || j.status === "Scheduled" || j.status === "EnRoute");
  const working = mine && j.status === "InProgress";
  const onHold = j.status === "OnHold";
  const doMove = (action: "enRoute" | "start" | "resume") => move.mutate({ job: j, action });
  const start = () => doMove("start");

  return (
    <>
      <BackLink />
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold leading-tight">{customer?.name ?? "Job"}</h1>
          <JobStatusBadge status={j.status} />
        </div>
        <p className="text-base font-medium">
          {dayLabel(shown.scheduledStart)},{" "}
          {timeRange({
            ...j,
            scheduledStart: shown.scheduledStart,
            scheduledEnd: shown.scheduledEnd,
          })}
        </p>
        {!implied ? (
          <p className="text-sm font-medium text-muted-foreground">
            Visit {shown.number} of {vs.length}
          </p>
        ) : null}
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

      {waitingHandover ? (
        <section className="rounded-md border border-border bg-muted p-4 text-base" role="status">
          <p className="font-semibold">Your visit is next</p>
          <p>The office is handing this job to you. Ask them if it does not change soon.</p>
        </section>
      ) : !mine && cur ? (
        <section className="rounded-md border border-border bg-muted p-4 text-base" role="status">
          <p className="font-semibold">
            Visit {cur.number} is {techName(cur.assignedTechId)}&apos;s
          </p>
          <p>
            {myNext
              ? `Your visit: ${visitWhen(myNext)}. You can act on the job then.`
              : "You can read this job; there is no visit of yours still to come."}
          </p>
        </section>
      ) : null}

      {onHold ? (
        <section
          className={cn("rounded-md p-4 text-base ring-1", JOB_STATUS_CLASS.OnHold)}
          role="status"
        >
          <p className="font-semibold">{JOB_STATUS_LABEL.OnHold}</p>
          {j.holdReason ? <p>{j.holdReason}</p> : null}
          {j.holdNote ? <p className="whitespace-pre-wrap">{j.holdNote}</p> : null}
        </section>
      ) : null}
      {j.reviewNote && working ? (
        <section className="rounded-md border border-border bg-muted p-4 text-base" role="status">
          <p className="font-semibold">Sent back by the office</p>
          <p>{j.reviewNote}</p>
        </section>
      ) : null}

      {working || onHold || isFinished(j.status) || !implied ? (
        <JobPhotos job={j} canAdd={working} />
      ) : null}

      {working ? <JobNotes job={j} /> : null}

      {!implied ? (
        <VisitList visits={vs} techs={techs.data ?? []} currentId={cur?.id ?? null} meId={myId} />
      ) : null}
      {!working && j.notes ? (
        <section className="space-y-1">
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-base">{j.notes}</p>
        </section>
      ) : null}

      {signature.data ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Signature</h2>
          {signatureUrl.data && !signatureUnreadable ? (
            <img
              src={signatureUrl.data}
              alt={`Signature of ${signature.data.signerName}`}
              className="h-28 w-full rounded-md bg-white object-contain ring-1 ring-border"
              // Signed in the ECI1 app: stored where this screen can't open it.
              onError={() => setSignatureUnreadable(true)}
            />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Signed by {signature.data.signerName},{" "}
            {new Date(signature.data.signedAt).toLocaleString()}
          </p>
        </section>
      ) : null}

      {update.isError || move.isError || visitActions.finish.isError ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Could not update the job. Try again.
        </p>
      ) : null}

      {mine && j.status === "Scheduled" ? (
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => doMove("enRoute")}
          disabled={move.isPending}
        >
          On my way
        </Button>
      ) : null}
      {working ? (
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => setHolding(true)}
          disabled={move.isPending}
        >
          Put on hold
        </Button>
      ) : null}
      {/* "Job complete" is offered only on the last open visit; any visit can end with a return. */}
      {working && lastVisit ? (
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => setFinishingId(cur?.id ?? "")}
          disabled={visitActions.finish.isPending}
        >
          Visit done, return needed
        </Button>
      ) : null}
      <HoldDialog
        open={finishingId !== null}
        onOpenChange={(open) => !open && setFinishingId(null)}
        busy={visitActions.finish.isPending}
        optional={!!nextPlanned}
        title="Visit done, return needed"
        description={
          nextPlanned
            ? `Visit ${nextPlanned.number} is planned for ${visitWhen(nextPlanned)}. Add anything the next visit should know.`
            : "No other visit is planned yet. Say what is left, so the office can plan the return visit."
        }
        label="What is left to do"
        saveLabel="Visit done"
        onSave={(note) =>
          visitActions.finish.mutate(
            { job: j, note: note || null, visitId: finishingId || null },
            {
              onSuccess: () => {
                setFinishingId(null);
                setNextText(
                  nextPlanned
                    ? `Next: visit ${nextPlanned.number}, ${visitWhen(nextPlanned)}.`
                    : "The office will plan the return visit.",
                );
                setStep("visitDone");
              },
            },
          )
        }
      />
      <HoldDialog
        open={holding}
        onOpenChange={setHolding}
        busy={move.isPending}
        onSave={(reason) =>
          move.mutate({ job: j, action: "hold", reason }, { onSuccess: () => setHolding(false) })
        }
      />

      {notStarted ? (
        <BottomAction>
          <Button className={PRIMARY_BUTTON} onClick={start} disabled={move.isPending}>
            {move.isPending ? "Saving…" : "Start Job"}
          </Button>
        </BottomAction>
      ) : onHold && mine && !isReturnHold(j) ? (
        <BottomAction>
          <Button
            className={PRIMARY_BUTTON}
            onClick={() => doMove("resume")}
            disabled={move.isPending}
          >
            Resume job
          </Button>
        </BottomAction>
      ) : working && lastVisit ? (
        <BottomAction>
          <Button className={PRIMARY_BUTTON} onClick={() => setStep("sign")}>
            Job complete
          </Button>
        </BottomAction>
      ) : working ? (
        <BottomAction>
          <Button
            className={PRIMARY_BUTTON}
            onClick={() => setFinishingId(cur?.id ?? "")}
            disabled={visitActions.finish.isPending}
          >
            Visit done, return needed
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
