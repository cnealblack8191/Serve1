import { useEffect, useRef, useState } from "react";

import { type Job, useJobMutations } from "@/data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Notes textarea saved to the job (on "Save notes" or when the field loses focus).
 * The draft is local: a refresh of the job only replaces it while nothing unsaved is typed.
 */
export function JobNotes({ job }: { job: Job }) {
  const { update } = useJobMutations();
  const [text, setText] = useState(job.notes ?? "");
  const [saved, setSaved] = useState(true);
  const draft = useRef(text);

  useEffect(() => {
    if (!saved) return;
    draft.current = job.notes ?? "";
    setText(draft.current);
  }, [job.id, job.notes, saved]);

  const save = async () => {
    const submitted = draft.current;
    if ((job.notes ?? "") === submitted) return setSaved(true);
    await update.mutateAsync({
      id: job.id,
      patch: { notes: submitted.trim() ? submitted : null },
    });
    // Typing that happened while the save was running stays unsaved.
    if (draft.current === submitted) setSaved(true);
  };

  return (
    <section className="space-y-3">
      <label htmlFor="job-notes" className="block text-lg font-semibold">
        Notes
      </label>
      <Textarea
        id="job-notes"
        value={text}
        rows={4}
        className="text-base"
        placeholder="What did you find? What did you do?"
        onChange={(e) => {
          draft.current = e.target.value;
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={() => void save()}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {update.isPending ? "Saving…" : saved ? "Saved" : "Not saved yet"}
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-12 px-5 text-base"
          disabled={saved || update.isPending}
          onClick={() => void save()}
        >
          Save notes
        </Button>
      </div>
    </section>
  );
}
