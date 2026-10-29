import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  archiveThread,
  getRecordCommunications,
  getRecordTimeline,
  getThread,
  linkMessage,
  listThreads,
  markThreadRead,
  sendMessage,
  syncMailbox,
  unlinkMessage,
} from "./comms.functions";
import type { CommsRecordTarget, MailFolder } from "./types";

const fail = (e: unknown) =>
  toast.error("Communications error", {
    description: e instanceof Error ? e.message : String(e),
  });

/** Mailbox folder listing (Inbox / Sent / Drafts / Archived). */
export function useThreads(folder: MailFolder, search = "") {
  return useQuery({
    queryKey: ["comms", "threads", folder, search],
    staleTime: 30_000,
    queryFn: () => listThreads({ data: { folder, search } }),
  });
}

/** One conversation and its messages. */
export function useThread(threadId: string | null) {
  return useQuery({
    queryKey: ["comms", "thread", threadId],
    enabled: Boolean(threadId),
    staleTime: 15_000,
    queryFn: () => getThread({ data: { threadId: threadId! } }),
  });
}

/** Communication history filed against one business record. */
export function useRecordCommunications(target: CommsRecordTarget, enabled = true) {
  return useQuery({
    queryKey: ["comms", "record", target.recordType, target.recordId],
    enabled: enabled && Boolean(target.recordId),
    staleTime: 30_000,
    queryFn: () =>
      getRecordCommunications({
        data: { recordType: target.recordType, recordId: target.recordId },
      }),
  });
}

/** Combined business timeline (email + documents) for one record. */
export function useRecordTimeline(target: CommsRecordTarget, enabled = true) {
  return useQuery({
    queryKey: ["comms", "timeline", target.recordType, target.recordId],
    enabled: enabled && Boolean(target.recordId),
    staleTime: 30_000,
    queryFn: () =>
      getRecordTimeline({
        data: { recordType: target.recordType, recordId: target.recordId },
      }),
  });
}

/** Actions shared by every module — the one write path for email. */
export function useCommsActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["comms"] });

  const send = useMutation({
    mutationFn: (input: Parameters<typeof sendMessage>[0]["data"]) =>
      sendMessage({ data: input }),
    onSuccess: (res) => {
      invalidate();
      toast.success(res.status === "sent" ? "Email sent" : "Email recorded", {
        description: res.detail,
      });
    },
    onError: fail,
  });

  const archive = useMutation({
    mutationFn: (threadId: string) => archiveThread({ data: { threadId } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const markRead = useMutation({
    mutationFn: (threadId: string) => markThreadRead({ data: { threadId } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const link = useMutation({
    mutationFn: (input: Parameters<typeof linkMessage>[0]["data"]) =>
      linkMessage({ data: input }),
    onSuccess: invalidate,
    onError: fail,
  });

  const unlink = useMutation({
    mutationFn: (linkId: string) => unlinkMessage({ data: { linkId } }),
    onSuccess: invalidate,
    onError: fail,
  });

  const sync = useMutation({
    mutationFn: (userName: string) => syncMailbox({ data: { userName } }),
    onSuccess: invalidate,
    onError: fail,
  });

  return { send, archive, markRead, link, unlink, sync };
}
