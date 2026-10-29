import { useState } from "react";
import { Loader2, Mail, MailPlus, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageComposer } from "./MessageComposer";
import { useRecordCommunications } from "@/lib/comms/useComms";
import {
  COMPOSE_LABELS,
  type CommsRecordTarget,
  type Message,
} from "@/lib/comms/types";
import { RECORD_TYPE_LABELS } from "@/lib/sharepoint/types";

const when = (m: Message) => {
  const raw = m.sentAt ?? m.receivedAt;
  if (!raw) return "Draft";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Will send once the mailbox is connected",
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  received: "Received",
};

/**
 * "Communications associated with this record" — one panel reused by CRM
 * clients and contacts, opportunities, bids, estimates, jobs, work orders and
 * invoices. All reads and sends go through the shared communications service.
 */
export function CommunicationsPanel({
  target,
  title,
  description,
  defaultTo,
}: {
  target: CommsRecordTarget;
  title?: string | undefined;
  description?: string | undefined;
  defaultTo?: string | undefined;
}) {
  const { data, isLoading } = useRecordCommunications(target);
  const [composeOpen, setComposeOpen] = useState(false);
  const recordLabel = RECORD_TYPE_LABELS[target.recordType].toLowerCase();
  const messages = data?.messages ?? [];
  const connected = data?.status.connected ?? false;

  return (
    <div className="eci-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <p className="font-medium">
            {title ?? `Communications associated with this ${recordLabel}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {description ??
              (connected
                ? "Email history from the company shared mailbox."
                : "Email is recorded here now and syncs with the company shared mailbox once Microsoft 365 is connected.")}
          </p>
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <MailPlus className="mr-2 size-4" /> {COMPOSE_LABELS[target.recordType]}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading communications…
        </div>
      ) : messages.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          No email associated with this {recordLabel} yet.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {messages.map((m) => (
            <li key={m.id} className="px-6 py-3">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.subject || "(no subject)"}
                    {m.hasAttachments ? (
                      <Paperclip className="ml-2 inline size-3.5 text-muted-foreground" />
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.direction === "inbound"
                      ? `From ${m.from.address}`
                      : `To ${m.to.map((a) => a.address).join(", ")}`}
                    {" · "}
                    {when(m)}
                    {" · "}
                    {STATUS_LABEL[m.deliveryStatus] ?? m.deliveryStatus}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {m.bodyPreview}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MessageComposer
        open={composeOpen}
        onOpenChange={setComposeOpen}
        target={target}
        defaultTo={defaultTo}
      />
    </div>
  );
}
