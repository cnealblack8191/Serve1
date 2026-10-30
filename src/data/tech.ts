import { useQuery } from "@tanstack/react-query";

import { fileUrl } from "./files";
import { useAttachments, useSignatures } from "./hooks";

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

/** Short-lived display link for a stored file. Refreshed before signed links expire. */
export function useFileUrl(path: string | undefined) {
  return useQuery({
    queryKey: ["serv1", "fileUrl", path ?? ""],
    queryFn: () => fileUrl(path!),
    enabled: !!path,
    staleTime: 10 * 60_000,
  });
}
