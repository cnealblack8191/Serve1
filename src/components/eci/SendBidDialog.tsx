import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageComposer, type ComposerAttachment, type ComposerLink } from "./MessageComposer";
import { useRecordDocuments } from "@/lib/sharepoint/useDocuments";
import { templateFor } from "@/lib/comms/types";
import { useEci } from "@/lib/eci/store";

/**
 * Send bid / proposal. A thin wrapper over the shared composer: it only picks
 * recipients, documents and default wording — sending, logging and record
 * association all happen in the one communications service.
 */
export function SendBidDialog({
  open,
  onOpenChange,
  bidId,
  bidName,
  customer,
  opportunityId,
  defaultTo,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bidId: string;
  bidName: string;
  customer: string;
  opportunityId?: string | undefined;
  defaultTo?: string | undefined;
  onSent?: ((info: { to: string[]; subject: string; body: string }) => void) | undefined;
}) {
  const { currentUser } = useEci();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [composeOpen, setComposeOpen] = useState(false);

  const target = { recordType: "bid" as const, recordId: bidId, name: bidName, customer };
  const docs = useRecordDocuments(target, open);

  const attachments: ComposerAttachment[] = useMemo(
    () =>
      docs.documents
        .filter((d) => picked[d.linkId])
        .map((d) => ({
          documentId: d.id,
          name: d.name,
          extension: d.extension,
          sizeBytes: d.sizeBytes,
          webUrl: d.webUrl,
        })),
    [docs.documents, picked],
  );

  const links: ComposerLink[] = [
    { recordType: "customer", recordId: customer },
    ...(opportunityId ? [{ recordType: "opportunity" as const, recordId: opportunityId }] : []),
  ];

  const tpl = templateFor("bid_sent", { name: bidName, customer, sender: currentUser });

  return (
    <>
      <Dialog open={open && !composeOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send bid — {bidName}</DialogTitle>
            <DialogDescription>
              Choose the proposal and bid documents to include, then edit the message and
              preview it before sending.
            </DialogDescription>
          </DialogHeader>

          {docs.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading documents…</p>
          ) : docs.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents are filed against this bid yet. You can still attach files in the
              next step.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {docs.documents.map((d) => (
                <li key={d.linkId} className="flex items-start gap-3">
                  <Checkbox
                    id={`bd-${d.linkId}`}
                    checked={Boolean(picked[d.linkId])}
                    onCheckedChange={(v) =>
                      setPicked((p) => ({ ...p, [d.linkId]: v === true }))
                    }
                  />
                  <label htmlFor={`bd-${d.linkId}`} className="text-sm leading-tight">
                    {d.name}
                    <span className="block text-xs text-muted-foreground">{d.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => setComposeOpen(true)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MessageComposer
        open={composeOpen}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) onOpenChange(false);
        }}
        title={`Send bid — ${bidName}`}
        target={target}
        purpose="bid_sent"
        extraLinks={links}
        preselectedDocuments={attachments}
        defaultTo={defaultTo}
        defaultSubject={tpl.subject}
        defaultBody={tpl.body}
        onSent={onSent}
      />
    </>
  );
}
