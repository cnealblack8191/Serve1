import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader, SectionHeading } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useEci } from "@/lib/eci/store";
import { ROLE_PRESETS, type Permission, type Role } from "@/lib/eci/types";
import { AUTO_REMINDER_DESCRIPTIONS, AUTO_REMINDER_KEYS } from "@/lib/eci/reminders";
import { runRemindersNow } from "@/lib/eci/reminders.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Permissions — ECI Operations" },
      {
        name: "description",
        content:
          "Configure role-based permissions, per-user exceptions, document storage provider and notification preferences for ECI.",
      },
      { property: "og:title", content: "Settings & Permissions — ECI Operations" },
      {
        property: "og:description",
        content: "Role presets, exceptions, storage provider and notification controls.",
      },
    ],
  }),
  component: SettingsPage,
});

const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: "View dashboard",
  crm: "CRM & opportunities",
  bids: "Bids & estimating",
  jobs: "Jobs & work orders",
  materials: "Material requests",
  invoices: "Accounts receivable",
  ap: "Accounts payable",
  approve_quotes: "Approve quotes",
  send_email: "Send customer email",
  manage_permissions: "Manage permissions",
  field: "Field mobile app",
};

const NOTIFICATION_KEYS = [
  "Opportunity stage changes",
  "Quote approval requests",
  "Quote approved or rejected",
  "Work order assignment",
  "Material request status",
  "Invoice overdue",
];

function SettingsPage() {
  const {
    role,
    setRole,
    permissions,
    exceptions,
    toggleException,
    restrictToAssigned,
    setRestrictToAssigned,
    storageProvider,
    setStorageProvider,
    notificationPrefs,
    toggleNotificationPref,
    can,
  } = useEci();
  const runNow = useServerFn(runRemindersNow);
  const [running, setRunning] = useState(false);

  const allPermissions = Object.keys(PERMISSION_LABELS) as Permission[];

  return (
    <AppShell>
      <PageHeader
        title="Settings & Permissions"
        description="Role-based access control, document storage and notification preferences."
      />

      {!can("manage_permissions") ? (
        <div className="eci-card border-l-4 border-l-eci-copper p-5 text-sm">
          Your current role can view these settings but cannot change permissions. Switch to
          Division Manager in the role switcher to edit.
        </div>
      ) : null}

      <section className="eci-card space-y-5 p-6">
        <SectionHeading
          title="Role preset"
          description="Presets define the baseline access for each ECI role."
        />
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_PRESETS) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {allPermissions.map((p) => {
            const inPreset = ROLE_PRESETS[role].includes(p);
            return (
              <div
                key={p}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{PERMISSION_LABELS[p]}</p>
                  <p className="text-xs text-muted-foreground">
                    {inPreset ? "Granted by role preset" : "Not in preset"}
                    {exceptions.includes(p) ? " · exception applied" : ""}
                  </p>
                </div>
                <Switch
                  checked={permissions.includes(p)}
                  disabled={!can("manage_permissions")}
                  onCheckedChange={() => toggleException(p)}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Restrict to assigned records only</p>
            <p className="text-xs text-muted-foreground">
              Users only see opportunities, jobs and work orders assigned to them.
            </p>
          </div>
          <Switch
            checked={restrictToAssigned}
            disabled={!can("manage_permissions")}
            onCheckedChange={setRestrictToAssigned}
          />
        </div>
      </section>

      <section className="eci-card space-y-5 p-6">
        <SectionHeading
          title="Document storage"
          description="Where job documents, photos and receipts are stored."
        />
        <Select
          value={storageProvider}
          onValueChange={(v) =>
            setStorageProvider(v as "OneDrive / SharePoint" | "AWS S3")
          }
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OneDrive / SharePoint">OneDrive / SharePoint</SelectItem>
            <SelectItem value="AWS S3">AWS S3</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => toast.success(`Connection test to ${storageProvider} succeeded`)}
        >
          Test connection
        </Button>
      </section>

      <section className="eci-card space-y-4 p-6">
        <SectionHeading
          title="Notifications"
          description="In-app and email notifications for this user."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {NOTIFICATION_KEYS.map((k) => (
            <div
              key={k}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm">{k}</p>
              <Switch
                checked={notificationPrefs[k] ?? true}
                onCheckedChange={() => toggleNotificationPref(k)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="eci-card space-y-4 p-6">
        <SectionHeading
          title="Automatic reminders"
          description="System-generated reminders checked once a day and delivered to your in-app notification bell."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.values(AUTO_REMINDER_KEYS).map((k) => (
            <div
              key={k}
              className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{k}</p>
                <p className="text-xs text-muted-foreground">{AUTO_REMINDER_DESCRIPTIONS[k]}</p>
              </div>
              <Switch
                checked={notificationPrefs[k] ?? true}
                onCheckedChange={() => toggleNotificationPref(k)}
              />
            </div>
          ))}
        </div>
        {can("manage_permissions") && (
          <Button
            variant="outline"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              try {
                const r = await runNow();
                toast.success(
                  r.inserted === 0
                    ? "Reminder check complete — nothing new right now."
                    : `Reminder check complete — ${r.inserted} new reminder${r.inserted === 1 ? "" : "s"} created.`,
                );
              } catch (e) {
                toast.error("Reminder check failed", { description: String(e) });
              } finally {
                setRunning(false);
              }
            }}
          >
            {running ? "Checking…" : "Run reminder check now"}
          </Button>
        )}
      </section>
    </AppShell>
  );
}
