import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { type Attachment, type Job, addJobPhoto, keys, useFileUrl, useJobPhotos } from "@/data";
import { cn } from "@/lib/utils";

function Thumb({ photo }: { photo: Attachment }) {
  const url = useFileUrl(photo.storagePath);
  return (
    <a
      href={url.data || undefined}
      target="_blank"
      rel="noreferrer"
      className="block aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border"
    >
      {url.data ? (
        <img
          src={url.data}
          alt={photo.caption ?? "Job photo"}
          className="size-full object-cover"
          data-testid="job-photo"
        />
      ) : null}
    </a>
  );
}

/** Photo list plus a camera button. `canAdd` is false once the job is finished. */
export function JobPhotos({ job, canAdd }: { job: Job; canAdd: boolean }) {
  const jobId = job.id;
  const photos = useJobPhotos(jobId);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        // addJobPhoto uploads the file and records it, tagged with the job's tech.
        await addJobPhoto(job, file);
        await qc.invalidateQueries({ queryKey: keys.table("attachments") });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const list = photos.data ?? [];
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Photos</h2>
      {list.length ? (
        <div className="grid grid-cols-3 gap-2">
          {list.map((p) => (
            <Thumb key={p.id} photo={p} />
          ))}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">No photos yet.</p>
      )}
      {canAdd ? (
        <label
          className={cn(
            "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background text-base font-medium shadow-sm active:bg-muted",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-5" aria-hidden />
          )}
          {busy ? "Uploading…" : "Add photo"}
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            aria-label="Add photo"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
