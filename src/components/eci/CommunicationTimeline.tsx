import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useRecordTimeline } from "@/lib/comms/useComms";
import {
  PURPOSE_LABELS,
  type CommsRecordTarget,
  type TimelineEntry,
} from "@/lib/comms/types";
import { RECORD_TYPE_LABELS } from "@/lib/sharepoint/types";
import { safeHref } from "@/lib/untrusted-content";

const when = (raw: string) => {
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
};

const Icon = ({ entry }: { entry: TimelineEntry }) => {
  if (entry.kind === "document") return <FileText className="size-4" />;
  return entry.kind === "email_in" ? (
    <ArrowDownLeft className="size-4" />
  ) : (
    <ArrowUpRight className="size-4" />
  );
};

/**
 * One history for a record: incoming and outgoing email, bids sent, invoices
 * sent, reminders, work-order communications and the documents that went with
 * them — read from the shared communications service.
 */
export function CommunicationTimeline({
  target,
  title,
}: {
  target: CommsRecordTarget;
  title?: string | undefined;
}) {
  const { data, isLoading } = useRecordTimeline(target);
  const entries = data?.entries ?? [];
  const label = RECORD_TYPE_LABELS[target.recordType].toLowerCase();

  return (
    <div className="eci-card overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <p className="font-medium">{title ?? "Activity timeline"}</p>
        <p className="text-xs text-muted-foreground">
          Email, bids, invoices, reminders and documents for this {label}, newest first.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading history…
        </div>
      ) : entries.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          No activity recorded against this {label} yet.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-6 py-3">
              <span className="mt-0.5 text-muted-foreground">
                <Icon entry={e} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{e.title || "(untitled)"}</span>
                  {e.purpose && e.purpose !== "general" ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {PURPOSE_LABELS[e.purpose]}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[e.detail, e.actor, when(e.at)].filter(Boolean).join(" · ")}
                </p>
                {e.attachmentNames.length > 0 ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Documents: {e.attachmentNames.join(", ")}
                  </p>
                ) : null}
              </div>
              {safeHref(e.webUrl) ? (
                <a
                  href={safeHref(e.webUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Open ${e.title}`}
                >
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
