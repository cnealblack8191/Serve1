import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, SectionHeading } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEci } from "@/lib/eci/store";
import {
  getMs365Status,
  saveMs365Settings,
  clearMs365Settings,
  testMs365Connection,
  type Ms365TestResult,
} from "@/lib/integrations/ms365.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Microsoft 365 Connection — ECI Operations" },
      {
        name: "description",
        content:
          "Connect ECI's own Microsoft 365 tenant directly: shared mailbox for bid intake and communications, SharePoint library for documents.",
      },
      { property: "og:title", content: "Microsoft 365 Connection — ECI Operations" },
      {
        property: "og:description",
        content: "Enter your Microsoft app registration to connect the shared mailbox and SharePoint library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

type FormState = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
  mailbox: string;
};

const EMPTY: FormState = {
  tenantId: "",
  clientId: "",
  clientSecret: "",
  siteId: "",
  driveId: "",
  mailbox: "",
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "outline"} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function IntegrationsPage() {
  const { isOwner, roleReady, currentUser } = useEci();
  const qc = useQueryClient();
  const status = useServerFn(getMs365Status);
  const save = useServerFn(saveMs365Settings);
  const clear = useServerFn(clearMs365Settings);
  const test = useServerFn(testMs365Connection);

  const allowed = isOwner;

  const statusQuery = useQuery({
    queryKey: ["ms365-status"],
    queryFn: () => status({ data: undefined }),
    enabled: allowed,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<Ms365TestResult | null>(null);

  useEffect(() => {
    const s = statusQuery.data;
    if (!s) return;
    setForm({
      tenantId: s.tenantId,
      clientId: s.clientId,
      clientSecret: "",
      siteId: s.siteId,
      driveId: s.driveId,
      mailbox: s.mailbox,
    });
  }, [statusQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({ data: { ...form, updatedBy: currentUser || "" } }),
    onSuccess: () => {
      toast.success("Microsoft 365 connection saved.");
      setForm((f) => ({ ...f, clientSecret: "" }));
      void qc.invalidateQueries({ queryKey: ["ms365-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test({ data: undefined }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({ data: undefined }),
    onSuccess: () => {
      toast.success("Connection removed. The app is back on sample data.");
      setForm(EMPTY);
      setResult(null);
      void qc.invalidateQueries({ queryKey: ["ms365-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title="Microsoft 365 Connection"
          description={
            roleReady
              ? "This connection is restricted to the account owner."
              : "Checking your access…"
          }
        />
      </AppShell>
    );
  }

  const s = statusQuery.data;
  const managed = s?.managedByEnvironment ?? false;

  const field = (
    key: keyof FormState,
    label: string,
    placeholder: string,
    hint?: string,
    type: "text" | "password" = "text",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
        value={form[key]}
        placeholder={placeholder}
        disabled={managed}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <AppShell>
      <PageHeader
        title="Microsoft 365 Connection"
        description="Connect ECI's own Microsoft 365 directly to this app — no third-party service in between."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusPill ok={Boolean(s?.mailboxConnected)} label="Shared mailbox" />
        <StatusPill ok={Boolean(s?.documentsConnected)} label="SharePoint documents" />
        {s?.updatedAt ? (
          <span className="text-xs text-muted-foreground">
            Last updated {new Date(s.updatedAt).toLocaleString()}
            {s.updatedBy ? ` by ${s.updatedBy}` : ""}
          </span>
        ) : null}
      </div>

      {managed ? (
        <p className="mb-6 rounded-md border border-border bg-muted/40 p-3 text-sm">
          This connection is currently supplied by the hosting configuration, so the fields below
          are read-only.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border p-4">
            <SectionHeading title="Your Microsoft app registration" />
            {field(
              "tenantId",
              "Directory (tenant) ID",
              "00000000-0000-0000-0000-000000000000",
              "Found on the app registration Overview page in Microsoft Entra ID.",
            )}
            {field("clientId", "Application (client) ID", "00000000-0000-0000-0000-000000000000")}
            {field(
              "clientSecret",
              "Client secret value",
              s?.hasSecret ? "•••••••• (stored — leave blank to keep)" : "Paste the secret value",
              "Stored on the server only. It is never sent back to this screen.",
              "password",
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            <SectionHeading title="Shared mailbox" />
            {field(
              "mailbox",
              "Shared mailbox address",
              "service@electricalcontractorinc.com",
              "Bid invitations and all app email flow through this one mailbox.",
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            <SectionHeading title="SharePoint document library" />
            {field(
              "siteId",
              "Site ID",
              "ecinc.sharepoint.com,<site-guid>,<web-guid>",
              "The single site that holds ECI's documents.",
            )}
            {field("driveId", "Drive (document library) ID", "b!xxxxxxxxxxxxxxxxxxxx")}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={managed || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save connection
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test connection
            </Button>
            {s?.hasSecret && !managed ? (
              <Button
                variant="ghost"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                Remove connection
              </Button>
            ) : null}
          </div>

          {result ? (
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
              <SectionHeading title="Test results" />
              {(
                [
                  ["Microsoft sign-in", result.signIn],
                  ["Document library", result.documents],
                  ["Shared mailbox", result.mailbox],
                ] as const
              ).map(([label, r]) => (
                <div key={label} className="flex items-start gap-2">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="break-words text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 rounded-lg border border-border p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" /> What to set up in Microsoft
          </div>
          <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
            <li>
              In Microsoft Entra ID, create one app registration (for example "Serve One") and copy
              the directory and application IDs.
            </li>
            <li>Create a client secret and paste its value here. Nothing else is stored.</li>
            <li>
              Add application permissions: <strong>Mail.ReadWrite</strong>,{" "}
              <strong>Mail.Send</strong> and <strong>Sites.Selected</strong>, then grant admin
              consent.
            </li>
            <li>
              Restrict mail access to the one shared mailbox with an Exchange
              ApplicationAccessPolicy, so the app can never read any other mailbox.
            </li>
            <li>
              Grant the app write access to the single document library only (Sites.Selected), not
              the whole tenant.
            </li>
            <li>Paste the site and library IDs above, save, then press Test connection.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            The secret and all Microsoft calls stay on the server. The app never puts Microsoft
            credentials in the browser, and access is limited to the mailbox and library named
            above.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
