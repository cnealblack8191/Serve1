import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addJobPhoto, addJobSignature, fileUrl } from "./files";
import { keys, useAttachments, useSignatures } from "./hooks";
import type { Job } from "./types";

/** Tech lane helpers (docs/PLAN.md). Built only on the shared hooks and file helpers. */

/** Photos attached to one job, oldest first. */
export function useJobPhotos(jobId: string | undefined) {
  const all = useAttachments();
  const data = all.data
    ?.filter((a) => a.jobId === jobId && a.type === "Photo")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ...all, data };
}

/** The most recent signature saved for one job, or undefined. */
export function useJobSignature(jobId: string | undefined) {
  const all = useSignatures();
  const data = all.data
    ?.filter((s) => s.jobId === jobId)
    .sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0];
  return { ...all, data };
}

/**
 * Short-lived display link for a stored file. Amplify signed links last 15 minutes,
 * so the link is fetched again every 10 minutes and when the tab comes back into view.
 */
const URL_REFRESH_MS = 10 * 60_000;
export function useFileUrl(path: string | undefined) {
  return useQuery({
    queryKey: ["serv1", "fileUrl", path ?? ""],
    queryFn: () => fileUrl(path!),
    enabled: !!path,
    staleTime: URL_REFRESH_MS,
    refetchInterval: URL_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Upload a photo and record it on the job (addJobPhoto), then refresh the photo list. */
export function useAddJobPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { job: Job; file: Blob }) => addJobPhoto(v.job, v.file),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.table("attachments") }),
  });
}

/** Save the customer's signature (addJobSignature), then refresh signatures. */
export function useAddJobSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { job: Job; png: Blob; signerName: string }) =>
      addJobSignature(v.job, v.png, v.signerName),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.table("signatures") }),
  });
}
