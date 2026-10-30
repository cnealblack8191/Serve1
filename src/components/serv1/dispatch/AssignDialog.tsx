import { useEffect, useState } from "react";

import { Field } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DISPATCH_DEFAULT_HOURS,
  atMinutes,
  dispatchSlots,
  formatSlot,
  fromDateInput,
  jobDurationMinutes,
  minutesOfDay,
  toDateInput,
  type Job,
  type User,
} from "@/data";

import { jobLabel } from "./board";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const LENGTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const DEFAULT_SLOT = 8 * 60;

/**
 * Keyboard-friendly way to schedule a job: pick a tech, a day, a start time and
 * a length. Works without drag and drop (and in browser tests).
 */
export function AssignDialog({
  job,
  techs,
  day,
  busy,
  onClose,
  onSubmit,
  onUnschedule,
}: {
  job: Job | null;
  techs: User[];
  day: Date;
  busy: boolean;
  onClose: () => void;
  onSubmit: (job: Job, techIdentityId: string, start: Date, minutes: number) => void;
  onUnschedule: (job: Job) => void;
}) {
  const slots = dispatchSlots();
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(DEFAULT_SLOT);
  const [hours, setHours] = useState(DISPATCH_DEFAULT_HOURS);

  // Reset the form each time a different job opens the dialog.
  useEffect(() => {
    if (!job) return;
    const start = job.scheduledStart ? new Date(job.scheduledStart) : null;
    const startSlot = start ? minutesOfDay(start) : DEFAULT_SLOT;
    setTechId(job.assignedTechId ?? techs[0]?.identityId ?? "");
    setDate(toDateInput(start ?? day));
    setSlot(slots.includes(startSlot) ? startSlot : DEFAULT_SLOT);
    setHours(start ? jobDurationMinutes(job) / 60 : DISPATCH_DEFAULT_HOURS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  const parsedDay = fromDateInput(date);
  const valid = !!job && !!techId && !!parsedDay;
  const lengths = LENGTHS.includes(hours) ? LENGTHS : [...LENGTHS, hours].sort((a, b) => a - b);

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSubmit(job, techId, atMinutes(parsedDay, slot), Math.round(hours * 60));
          }}
        >
          <DialogHeader>
            <DialogTitle>Assign {job ? jobLabel(job) : ""}</DialogTitle>
            <DialogDescription>{job?.description}</DialogDescription>
          </DialogHeader>

          <Field label="Tech">
            <select
              className={SELECT_CLASS}
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
              required
            >
              {techs.map((t) => (
                <option key={t.id} value={t.identityId ?? ""}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Start time">
              <select
                className={SELECT_CLASS}
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
              >
                {slots.map((m) => (
                  <option key={m} value={m}>
                    {formatSlot(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <select
                className={SELECT_CLASS}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                {lengths.map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "hour" : "hours"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {job?.assignedTechId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onUnschedule(job)}
              >
                Move back to Unscheduled
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                Schedule
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
