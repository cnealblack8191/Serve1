import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  Forward,
  Loader2,
  Mail,
  MailPlus,
  Paperclip,
  RefreshCw,
  Reply,
  ReplyAll,
} from "lucide-react";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader } from "@/components/eci/primitives";
import { MessageComposer, type ComposeMode } from "@/components/eci/MessageComposer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEci } from "@/lib/eci/store";
import { useCommsActions, useThread, useThreads } from "@/lib/comms/useComms";
import { MAIL_FOLDERS, type MailFolder, type Message } from "@/lib/comms/types";
import { RECORD_TYPE_LABELS } from "@/lib/sharepoint/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/communications")({
  head: () => ({
    meta: [
      { title: "Communications — ECI Serve One" },
      {
        name: "description",
        content:
          "Company shared-mailbox email inside Serve One, filed automatically against clients, opportunities, bids, jobs, work orders and invoices.",
      },
      { property: "og:title", content: "Communications — ECI Serve One" },
      {
        property: "og:description",
        content:
          "Inbox, sent, drafts and archived mail for Electrical Contractor Inc., linked to every business record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommunicationsPage,
});

const fmt = (raw: string | null) => {
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

function CommunicationsPage() {
  const { currentUser } = useEci();
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [search, setSearch] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ mode: ComposeMode; message: Message | null } | null>(
    null,
  );

  const list = useThreads(folder, search);
  const thread = useThread(threadId);
  const { archive, markRead, sync } = useCommsActions();

  const status = list.data?.status;
  const threads = list.data?.threads ?? [];
  const messages = thread.data?.messages ?? [];

  const openThread = (id: string) => {
    setThreadId(id);
    markRead.mutate(id);
  };

  return (
    <AppShell>
      <PageHeader
        title="Communications"
        description={
          status?.connected
            ? `Company shared mailbox — ${status.mailboxAddress}`
            : "Company shared mailbox — preview. Mail and record links are recorded now and sync once Microsoft 365 is connected."
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync.mutate(currentUser)}
          disabled={sync.isPending}
        >
          {sync.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Sync mailbox
        </Button>
        <Button size="sm" onClick={() => setCompose({ mode: "new", message: null })}>
          <MailPlus className="mr-2 size-4" /> New email
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={folder} onValueChange={(v) => { setFolder(v as MailFolder); setThreadId(null); }}>
          <TabsList>
            {MAIL_FOLDERS.map((f) => (
              <TabsTrigger key={f.id} value={f.id}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subjects"
          className="h-9 max-w-xs"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="eci-card overflow-hidden">
          {list.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading mail…
            </div>
          ) : threads.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing in {MAIL_FOLDERS.find((f) => f.id === folder)?.label.toLowerCase()}.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openThread(t.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition hover:bg-muted/60",
                      threadId === t.id && "bg-muted",
                    )}
                  >
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {t.unreadCount > 0 ? (
                        <span className="size-2 shrink-0 rounded-full bg-eci-copper" />
                      ) : null}
                      <span className="truncate">{t.subject}</span>
                      {t.hasAttachments ? (
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.participants.map((p) => p.name || p.address).join(", ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.preview}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {fmt(t.lastMessageAt)}
                      {t.links.length > 0
                        ? ` · ${t.links
                            .map((l) => `${RECORD_TYPE_LABELS[l.recordType]} ${l.recordId}`)
                            .slice(0, 2)
                            .join(", ")}`
                        : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="eci-card overflow-hidden">
          {!threadId ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Mail className="size-6" />
              Select a conversation to read it.
            </div>
          ) : thread.isLoading ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading conversation…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
                <div>
                  <p className="font-medium">{thread.data?.thread?.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {thread.data?.thread?.links.length
                      ? `Filed against ${thread.data.thread.links
                          .map((l) => `${RECORD_TYPE_LABELS[l.recordType]} ${l.recordId}`)
                          .join(", ")}`
                      : "Not yet filed against a business record."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCompose({ mode: "reply", message: messages[messages.length - 1] ?? null })
                    }
                  >
                    <Reply className="mr-2 size-4" /> Reply
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCompose({
                        mode: "replyAll",
                        message: messages[messages.length - 1] ?? null,
                      })
                    }
                  >
                    <ReplyAll className="mr-2 size-4" /> Reply all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCompose({
                        mode: "forward",
                        message: messages[messages.length - 1] ?? null,
                      })
                    }
                  >
                    <Forward className="mr-2 size-4" /> Forward
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      archive.mutate(threadId);
                      setThreadId(null);
                    }}
                  >
                    <Archive className="mr-2 size-4" /> Archive
                  </Button>
                </div>
              </div>

              <ul className="divide-y divide-black/5">
                {messages.map((m) => (
                  <li key={m.id} className="px-6 py-4">
                    <p className="text-sm font-medium">
                      {m.from.name || m.from.address || "Electrical Contractor Inc."}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {fmt(m.sentAt ?? m.receivedAt)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To {m.to.map((a) => a.address).join(", ") || "—"}
                      {m.cc.length ? ` · CC ${m.cc.map((a) => a.address).join(", ")}` : ""}
                    </p>
                    <div
                      className="prose prose-sm mt-2 max-w-none text-sm text-foreground"
                      // Message bodies come from the shared mailbox mirror.
                      dangerouslySetInnerHTML={{ __html: m.bodyHtml || `<p>${m.bodyPreview}</p>` }}
                    />
                    {m.attachments.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs"
                          >
                            <Paperclip className="size-3" />
                            {a.webUrl ? (
                              <a href={a.webUrl} target="_blank" rel="noopener noreferrer">
                                {a.name}
                              </a>
                            ) : (
                              a.name
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <MessageComposer
        open={compose !== null}
        onOpenChange={(open) => !open && setCompose(null)}
        mode={compose?.mode ?? "new"}
        replyTo={compose?.message ?? null}
      />
    </AppShell>
  );
}
