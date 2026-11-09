import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/eci/primitives";
import { AssignDialog } from "@/components/serv1/dispatch/AssignDialog";
import { SELECT_CLASS } from "@/components/serv1/sales/format";
import { HoldDialog } from "@/components/serv1/tech/HoldDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  JOB_PRIORITIES,
  canDispatch,
  canMove,
  schedulePatch,
  unschedulePatch,
  useCurrentUser,
  useJobMove,
  useJobMutations,
  useJobs,
  useSites,
  useTechNames,
  currentVisit,
  useVisitActions,
  useVisits,
  visitEntries,
  visitsOf,
  type Job,
  type JobAction,
  type JobPriority,
} from "@/data";
import { JOB_TYPES } from "@/lib/job-types";
import { PRIORITY_LABEL } from "@/lib/status";

type ReasonAction = "hold" | "sendBack" | "cancel";
const REASON_TEXT: Record<ReasonAction, { title: string; description: string; save: string }> = {
  hold: {
    title: "Put the job on hold",
    description: "Say why (for example: waiting on a part or on the customer).",
    save: "Put on hold",
  },
  sendBack: {
    title: "Send back to the tech",
    description: "Say what still needs doing. The tech sees this note on the job.",
    save: "Send back",
  },
  cancel: {
    title: "Cancel the job",
    description: "Say why it is cancelled. It leaves the schedule; you can reopen it later.",
    save: "Cancel job",
  },
};

/** Office controls on the job page (Phase 3). Hidden for the owner and techs. */
export function JobActions({ job }: { job: Job }) {
  const me = useCurrentUser();
  const role = me.data?.role;
  const move = useJobMove();
  const { update } = useJobMutations();
  const techs = useTechNames();
  // A job with visits is rescheduled visit by visit (docs/VISITS.md; Codex review of PR #21).
  const visits = useVisits();
  const visitActions = useVisitActions();
  const allJobs = useJobs();
  const [reason, setReason] = useState<ReasonAction | null>(null);
  const [assigning, setAssigning] = useState(false);
  // The visit the job is on now, when it has visits: the dialog moves or removes that visit only.
  const { visits: vs, implied } = visitsOf(job, visits.data ?? []);
  const cur = implied ? null : currentVisit(vs);
  const dialogJob: Job =
    (cur && visitEntries([job], visits.data ?? []).find((e) => e.visit.id === cur.id)) || job;
  const visitError = (e: Error) =>
    toast.error("Couldn't change the visit", { description: e.message });
  const [editing, setEditing] = useState(false);
  if (role !== "Admin" && role !== "Office") return null;

  const can = (a: JobAction) => canMove(job, a, role);
  const go = (action: JobAction, r?: string) =>
    move.mutate({ job, action, reason: r }, { onSuccess: () => setReason(null) });

  return (
    <div className="flex flex-wrap gap-2" aria-label="Job actions" role="group">
      {can("approve") ? <Button onClick={() => go("approve")}>Approve</Button> : null}
      {can("sendBack") ? (
        <Button variant="outline" onClick={() => setReason("sendBack")}>
          Send back
        </Button>
      ) : null}
      <Button variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
      {canDispatch(job) ? (
        <Button variant="outline" onClick={() => setAssigning(true)}>
          {job.assignedTechId ? "Reschedule or reassign" : "Schedule"}
        </Button>
      ) : null}
      {can("hold") ? (
        <Button variant="outline" onClick={() => setReason("hold")}>
          Put on hold
        </Button>
      ) : null}
      {can("resume") ? (
        <Button variant="outline" onClick={() => go("resume")}>
          Resume
        </Button>
      ) : null}
      {can("cancel") ? (
        <Button variant="outline" onClick={() => setReason("cancel")}>
          Cancel job
        </Button>
      ) : null}
      {can("reopen") ? (
        <Button variant="outline" onClick={() => go("reopen")}>
          Reopen
        </Button>
      ) : null}
      {move.isError || update.isError ? (
        <p role="alert" className="w-full text-sm text-destructive">
          Could not update the job. Try again.
        </p>
      ) : null}

      <HoldDialog
        key={reason ?? "none"}
        open={!!reason}
        onOpenChange={(o) => !o && setReason(null)}
        busy={move.isPending}
        title={reason ? REASON_TEXT[reason].title : ""}
        description={reason ? REASON_TEXT[reason].description : ""}
        saveLabel={reason ? REASON_TEXT[reason].save : ""}
        onSave={(r) => reason && go(reason, r)}
      />
      <AssignDialog
        jobs={visitEntries(allJobs.data ?? [], visits.data ?? [])}
        job={assigning ? dialogJob : null}
        techs={techs.data ?? []}
        day={dialogJob.scheduledStart ? new Date(dialogJob.scheduledStart) : new Date()}
        busy={
          update.isPending || visitActions.reschedule.isPending || visitActions.remove.isPending
        }
        onClose={() => setAssigning(false)}
        onSubmit={(j, techId, start, minutes) =>
          cur
            ? visitActions.reschedule.mutate(
                { visit: cur, plan: { assignedTechId: techId, start, minutes } },
                { onSuccess: () => setAssigning(false), onError: visitError },
              )
            : update.mutate(
                { id: j.id, patch: schedulePatch(j, techId, start, minutes) },
                { onSuccess: () => setAssigning(false) },
              )
        }
        onUnschedule={(j) =>
          cur
            ? visitActions.remove.mutate(cur, {
                onSuccess: () => setAssigning(false),
                onError: visitError,
              })
            : update.mutate(
                { id: j.id, patch: unschedulePatch() },
                { onSuccess: () => setAssigning(false) },
              )
        }
        onAddVisit={(j, techId, start, minutes) =>
          visitActions.add.mutate(
            { job, plan: { assignedTechId: techId, start, minutes } },
            {
              onSuccess: (v) => {
                toast.success(`Visit ${v.number} added`);
                setAssigning(false);
              },
              onError: visitError,
            },
          )
        }
      />
      {editing ? <EditJobDialog job={job} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function EditJobDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { update } = useJobMutations();
  const sites = useSites();
  const [description, setDescription] = useState(job.description);
  const [jobType, setJobType] = useState(job.jobType ?? "");
  const [priority, setPriority] = useState<JobPriority>(job.priority);
  const [siteId, setSiteId] = useState(job.siteId ?? "");
  const [notes, setNotes] = useState(job.notes ?? "");
  const mySites = (sites.data ?? []).filter((s) => s.customerId === job.customerId);
  const types =
    JOB_TYPES.includes(jobType as never) || !jobType ? JOB_TYPES : [jobType, ...JOB_TYPES];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!description.trim()) return;
            update.mutate(
              {
                id: job.id,
                patch: {
                  description: description.trim(),
                  jobType: jobType || null,
                  priority,
                  siteId: siteId || null,
                  notes: notes.trim() || null,
                },
              },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {job.jobNumber ?? "job"}</DialogTitle>
          </DialogHeader>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job type">
              <select
                className={SELECT_CLASS}
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
              >
                <option value="">Not set</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className={SELECT_CLASS}
                value={priority}
                onChange={(e) => setPriority(e.target.value as JobPriority)}
              >
                {JOB_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Site">
            <select
              className={SELECT_CLASS}
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="">No site</option>
              {mySites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ? `${s.name} — ${s.address}` : s.address}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not save. Try again.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={update.isPending || !description.trim()}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
