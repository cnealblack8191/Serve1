import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  attachDocument,
  browseDocuments,
  detachDocument,
  ensureRecordFolder,
  getRecordDocuments,
  registerGeneratedDocument,
  uploadRecordDocument,
} from "./documents.functions";
import type { DocumentRecordType } from "./types";

export interface RecordTarget {
  recordType: DocumentRecordType;
  recordId: string;
  /** Record name, used to derive the SharePoint folder path. */
  name?: string;
  /** Owning client, used to derive the SharePoint folder path. */
  customer?: string;
}

const recordKey = (t: RecordTarget) => ["sharepoint", "record", t.recordType, t.recordId] as const;

/** Documents associated with one business record (plus its folder location). */
export function useRecordDocuments(target: RecordTarget, enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: recordKey(target),
    enabled: enabled && Boolean(target.recordId),
    staleTime: 30_000,
    queryFn: () => getRecordDocuments({ data: target }),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: recordKey(target) });
  const fail = (e: unknown) =>
    toast.error("Couldn't update documents", {
      description: e instanceof Error ? e.message : String(e),
    });

  const attach = useMutation({
    mutationFn: (input: Parameters<typeof attachDocument>[0]["data"]) =>
      attachDocument({ data: input }),
    onSuccess: invalidate,
    onError: fail,
  });

  const detach = useMutation({
    mutationFn: (linkId: string) => detachDocument({ data: { linkId } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: (input: { fileName: string; contentBase64?: string; label?: string; uploadedBy?: string }) =>
      uploadRecordDocument({ data: { ...target, ...input } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const ensureFolder = useMutation({
    mutationFn: () => ensureRecordFolder({ data: target }),
    onSuccess: invalidate,
    onError: fail,
  });

  const generate = useMutation({
    mutationFn: (input: { fileName: string; generatedKind: string; label?: string; createdBy?: string }) =>
      registerGeneratedDocument({ data: { ...target, ...input } }),
    onSuccess: invalidate,
    onError: fail,
  });

  return {
    connected: query.data?.connected ?? false,
    location: query.data?.location ?? null,
    documents: query.data?.documents ?? [],
    isLoading: query.isLoading,
    attach,
    detach,
    upload,
    ensureFolder,
    generate,
  };
}

/** Browse the designated SharePoint library. */
export function useBrowseFolder(path: string) {
  return useQuery({
    queryKey: ["sharepoint", "browse", path],
    staleTime: 30_000,
    queryFn: () => browseDocuments({ data: { path } }),
  });
}
