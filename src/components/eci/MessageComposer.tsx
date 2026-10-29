import { useMemo, useRef, useState } from "react";
import { Loader2, Paperclip, Send, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SharePointBrowser } from "./SharePointBrowser";
import { useEci } from "@/lib/eci/store";
import { useCommsActions } from "@/lib/comms/useComms";
import {
  defaultSubjectFor,
  parseAddresses,
  type CommPurpose,
  type CommsRecordTarget,
  type MailAddress,
  type Message,
} from "@/lib/comms/types";
import { useRecordDocuments } from "@/lib/sharepoint/useDocuments";
import type { BrowseItem } from "@/lib/sharepoint/types";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposerAttachment {
  documentId: string | null;
  name: string;
  extension: string;
  sizeBytes: number | null;
  webUrl: string;
}

type Attachment = ComposerAttachment;

export interface ComposerLink {
  recordType: CommsRecordTarget["recordType"];
  recordId: string;
}

const addressText = (list: MailAddress[]) => list.map((a) => a.address).join(", ");

/**
 * The single compose surface — used from the Communications area and directly
 * from CRM, bid, job, work order and invoice records. Everything is sent
 * through the shared communications service, so each email is logged once with
 * its business-record associations and attachments.
 */
export function MessageComposer({
  open,
  onOpenChange,
  mode = "new",
  target,
  replyTo,
  defaultTo,
  defaultSubject,
  defaultBody,
  defaultCc,
  purpose = "general",
  extraLinks,
  preselectedDocuments,
  title,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: ComposeMode;
  /** The business record this email belongs to. */
  target?: CommsRecordTarget | undefined;
  /** Message being replied to or forwarded. */
  replyTo?: Message | null | undefined;
  defaultTo?: string | undefined;
  defaultSubject?: string | undefined;
  defaultBody?: string | undefined;
  defaultCc?: string | undefined;
  /** Why this email exists — drives the badge shown in history. */
  purpose?: CommPurpose | undefined;
  /** Additional records this email should be filed against. */
  extraLinks?: ComposerLink[] | undefined;
  /** Documents attached when the composer opens. */
  preselectedDocuments?: ComposerAttachment[] | undefined;
  title?: string | undefined;
  /** Called after a message is actually sent (not saved as a draft). */
  onSent?: ((info: { to: string[]; subject: string; body: string }) => void) | undefined;
}) {
  const { currentUser } = useEci();
  const { send } = useCommsActions();
  const docs = useRecordDocuments(
    target ?? { recordType: "customer", recordId: "" },
    Boolean(target?.recordId) && open,
  );

  const seed = useMemo(() => {
    if (replyTo && mode !== "new") {
      const to =
        mode === "forward"
          ? ""
          : addressText(
              mode === "replyAll"
                ? [replyTo.from, ...replyTo.to, ...replyTo.cc]
                : [replyTo.from],
            );
      const prefix = mode === "forward" ? "FW: " : "RE: ";
      const subject = replyTo.subject.startsWith(prefix)
        ? replyTo.subject
        : `${prefix}${replyTo.subject}`;
      const quoted = `\n\n---------- ${
        mode === "forward" ? "Forwarded message" : "Original message"
      } ----------\nFrom: ${replyTo.from.address}\nSubject: ${replyTo.subject}\n\n${
        replyTo.bodyPreview
      }`;
      return { to, subject, body: quoted };
    }
    return {
      to: defaultTo ?? "",
      subject: defaultSubject ?? (target ? defaultSubjectFor(target) : ""),
      body: defaultBody ?? "",
    };
  }, [mode, replyTo, defaultTo, defaultSubject, defaultBody, target]);

  const [to, setTo] = useState(seed.to);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(seed.subject);
  const [body, setBody] = useState(seed.body);
  const [attachments, setAttachments] = useState<Attachment[]>(preselectedDocuments ?? []);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [seeded, setSeeded] = useState(open);
  const fileInput = useRef<HTMLInputElement>(null);

  // Re-seed each time the dialog is opened.
  if (open && !seeded) {
    setSeeded(true);
    setTo(seed.to);
    setSubject(seed.subject);
    setBody(seed.body);
    setCc(defaultCc ?? "");
    setBcc("");
    setAttachments(preselectedDocuments ?? []);
    setPreview(false);
  }
  if (!open && seeded) setSeeded(false);

  const addAttachment = (a: Attachment) =>
    setAttachments((prev) =>
      prev.some((p) => p.name === a.name && p.webUrl === a.webUrl) ? prev : [...prev, a],
    );

  const attachBrowsed = (item: BrowseItem) => {
    addAttachment({
      documentId: null,
      name: item.name,
      extension: item.extension,
      sizeBytes: null,
      webUrl: item.webUrl,
    });
    setBrowseOpen(false);
  };

  const onPickFile = async (file: File) => {
    if (!target?.recordId) return;
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
    // Uploads land in the record's SharePoint folder, then attach by reference.
    await docs.upload.mutateAsync({
      fileName: file.name,
      contentBase64: btoa(binary),
      label: "Communication",
      uploadedBy: currentUser,
    });
    addAttachment({
      documentId: null,
      name: file.name,
      extension: file.name.split(".").pop() ?? "",
      sizeBytes: file.size,
      webUrl: "",
    });
  };

  const submit = async (isDraft: boolean) => {
    await send.mutateAsync({
      to: parseAddresses(to),
      cc: parseAddresses(cc),
      bcc: parseAddresses(bcc),
      subject,
      bodyHtml: body
        .split("\n")
        .map((line) => `<p>${line || "&nbsp;"}</p>`)
        .join(""),
      threadId: mode === "new" ? "" : (replyTo?.threadId ?? ""),
      inReplyTo: replyTo?.graphMessageId ?? "",
      isDraft,
      purpose,
      sentByName: currentUser,
      attachments,
      // Every record this email belongs to is filed in the one send call.
      links: [
        ...(target ? [{ recordType: target.recordType, recordId: target.recordId }] : []),
        ...(extraLinks ?? []).filter(
          (l) =>
            l.recordId &&
            !(target && l.recordType === target.recordType && l.recordId === target.recordId),
        ),
      ],
    });
    if (!isDraft) onSent?.({ to: parseAddresses(to).map((a) => a.address), subject, body });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {title ??
              (mode === "reply"
                ? "Reply"
                : mode === "replyAll"
                  ? "Reply all"
                  : mode === "forward"
                    ? "Forward"
                    : "New email")}
          </DialogTitle>
          <DialogDescription>
            Sent from the company shared mailbox and logged against
            {target ? ` ${target.name ?? target.recordId}` : " this conversation"}.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="space-y-3 rounded-md border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Preview — this is exactly what will be sent
            </p>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">To: </span>
                {to || "—"}
              </p>
              {cc ? (
                <p>
                  <span className="text-muted-foreground">CC: </span>
                  {cc}
                </p>
              ) : null}
              {bcc ? (
                <p>
                  <span className="text-muted-foreground">BCC: </span>
                  {bcc}
                </p>
              ) : null}
              <p className="font-medium">{subject || "(no subject)"}</p>
            </div>
            <div className="whitespace-pre-wrap border-t border-border pt-3 text-sm">
              {body || "(no message)"}
            </div>
            {attachments.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Attached
                </p>
                <ul className="space-y-1 text-sm">
                  {attachments.map((a) => (
                    <li key={`p-${a.name}-${a.webUrl}`} className="flex items-center gap-2">
                      <Paperclip className="size-3.5 text-muted-foreground" /> {a.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={preview ? "hidden" : "space-y-3"}>
          <div className="space-y-1.5">
            <Label htmlFor="comp-to">To</Label>
            <Input
              id="comp-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="comp-cc">CC</Label>
              <Input id="comp-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-bcc">BCC</Label>
              <Input id="comp-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-subject">Subject</Label>
            <Input
              id="comp-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-body">Message</Label>
            <Textarea
              id="comp-body"
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setBrowseOpen(true)}>
              <Paperclip className="mr-2 size-4" /> Attach from SharePoint
            </Button>
            {target?.recordId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={docs.upload.isPending}
              >
                {docs.upload.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                Upload file
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPickFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {target?.recordId && docs.documents.length > 0 ? (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Files already on this record
              </p>
              <div className="flex flex-wrap gap-2">
                {docs.documents.slice(0, 8).map((d) => (
                  <Button
                    key={d.linkId}
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      addAttachment({
                        documentId: d.id,
                        name: d.name,
                        extension: d.extension,
                        sizeBytes: d.sizeBytes,
                        webUrl: d.webUrl,
                      })
                    }
                  >
                    <Paperclip className="mr-1.5 size-3.5" /> {d.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li
                  key={`${a.name}-${a.webUrl}`}
                  className="flex items-center justify-between rounded bg-muted px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{a.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${a.name}`}
                    onClick={() =>
                      setAttachments((prev) => prev.filter((p) => p !== a))
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button variant="outline" onClick={() => void submit(true)} disabled={send.isPending}>
            Save draft
          </Button>
          <Button onClick={() => void submit(false)} disabled={send.isPending || !to.trim()}>
            {send.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Send
          </Button>
        </DialogFooter>

        <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Attach a document</DialogTitle>
              <DialogDescription>
                Files stay in SharePoint and are attached by reference.
              </DialogDescription>
            </DialogHeader>
            <SharePointBrowser onAttach={attachBrowsed} />
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
