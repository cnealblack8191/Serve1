import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { DataRow, Field, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { SELECT_CLASS } from "@/components/serv1/sales/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  isAuthorizationId,
  isCompanyCode,
  isOperatorCode,
  isSpectrumAddress,
  loadRemovalPlan,
  removeTestImports,
  SPECTRUM_TABLES,
  SpectrumError,
  keys,
  saveSpectrumCredentials,
  spectrumStatusKey,
  useSpectrumChecks,
  useSpectrumStatus,
  useTestSpectrumConnection,
  type RemovalPlan,
  type SpectrumAuthMode,
} from "@/data";
import { ADMIN_ONLY, requireRole } from "@/lib/access";

/** Settings › Integrations › Spectrum (Admin only; API.md section 5). Write-only credentials. */
export const Route = createFileRoute("/_authenticated/settings/integrations/spectrum")({
  beforeLoad: ({ context }) => requireRole(context.user.role, ADMIN_ONLY),
  component: Page,
});

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Page() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          Settings › Integrations › Spectrum
        </p>
        <PageHeader
          title="Spectrum"
          description="Connects Serv1 to Spectrum so the office can import jobs and work orders. Credentials are sent to the Spectrum connector and never shown again."
        >
          <Button asChild variant="outline">
            <Link to="/spectrum-import">Import from Spectrum</Link>
          </Button>
        </PageHeader>
      </div>
      <StatusSection />
      <CredentialsForm />
      <RemoveTestImports />
    </div>
  );
}

function StatusSection() {
  const status = useSpectrumStatus();
  const checks = useSpectrumChecks();
  const test = useTestSpectrumConnection();
  const last = checks.data?.[0];
  const s = status.data;

  return (
    <section className="eci-card space-y-4 p-5" aria-labelledby="spectrum-status">
      <div id="spectrum-status">
        <SectionHeading title="Connection" />
      </div>
      <div>
        <DataRow
          label="Credentials"
          value={
            status.isLoading
              ? "Checking…"
              : status.error
                ? status.error instanceof SpectrumError
                  ? status.error.message
                  : "Could not read the connection status."
                : s?.configured
                  ? `Saved by ${s.savedBy} on ${when(s.savedAt)} (${s.authMode === "enhanced" ? "enhanced" : "basic"} sign-in)`
                  : s && "unreadable" in s && s.unreadable
                    ? "Saved credentials can't be read. Save them again below."
                    : "Not saved yet"
          }
        />
        <DataRow
          label="Last test"
          value={
            last ? (
              <span>
                <span
                  className={
                    last.result === "connected"
                      ? "font-medium text-emerald-700 dark:text-emerald-400"
                      : "font-medium text-red-700 dark:text-red-400"
                  }
                >
                  {last.result === "connected" ? "Connected" : "Failed"}
                </span>
                {last.message ? ` — ${last.message}` : ""} ({when(last.createdAt)}, by{" "}
                {last.checkedBy}
                {last.durationMs !== null ? `, ${last.durationMs} ms` : ""})
              </span>
            ) : (
              "Not tested yet"
            )
          }
        />
      </div>
      <Button onClick={() => test.mutate()} disabled={test.isPending}>
        {test.isPending ? "Testing…" : "Test connection"}
      </Button>
      {test.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not record the test. Try again.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Write-only: the values live only in this form until Save, then go to the connector and the
 * form is emptied. Nothing is kept in the page, the cache or the browser's storage.
 */
function CredentialsForm() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [authorizationId, setAuthorizationId] = useState("");
  const [authMode, setAuthMode] = useState<SpectrumAuthMode>("basic");
  const [operatorCode, setOperatorCode] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const clear = () => {
    setAddress("");
    setCompanyCode("");
    setAuthorizationId("");
    setOperatorCode("");
    setAuthMode("basic");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved("");
    const a = address.trim().replace(/\/+$/, "");
    if (!isSpectrumAddress(a))
      return setError(
        "Enter the Spectrum web address, starting with https:// (a name, not an IP).",
      );
    if (!isCompanyCode(companyCode.trim()))
      return setError("Company code is 1 to 6 letters or digits.");
    if (!isAuthorizationId(authorizationId.trim()))
      return setError("Authorization ID is 8 to 128 letters, digits or dashes.");
    if (authMode === "enhanced" && !isOperatorCode(operatorCode.trim()))
      return setError("Enhanced sign-in needs an operator code: 1 to 10 letters or digits.");
    if (authMode === "basic" && operatorCode.trim() && !isOperatorCode(operatorCode.trim()))
      return setError("Operator code is 1 to 10 letters or digits.");
    setError("");
    if (saving) return;
    setSaving(true);
    try {
      // Called directly, not as a cached mutation, so the values are not kept in memory.
      const r = await saveSpectrumCredentials({
        address: a,
        companyCode,
        authorizationId,
        authMode,
        operatorCode: operatorCode || undefined,
      });
      clear();
      setSaved(`Saved by ${r.savedBy} on ${when(r.savedAt)}. Press Test connection to check them.`);
    } catch (err) {
      // Fixed text only; the connector never says which value failed.
      setError(err instanceof SpectrumError ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
      void qc.invalidateQueries({ queryKey: spectrumStatusKey });
    }
  }

  return (
    <section className="eci-card space-y-4 p-5" aria-labelledby="spectrum-credentials">
      <div id="spectrum-credentials">
        <SectionHeading
          title="Save credentials"
          description="Saving replaces the credentials saved before. Serv1 never shows them again."
        />
      </div>
      <form onSubmit={submit} className="space-y-4" autoComplete="off">
        <Field label="Spectrum web address" hint="For example https://spectrum.example.com">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company code">
            <Input
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Sign-in type">
            <select
              className={SELECT_CLASS}
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value as SpectrumAuthMode)}
            >
              <option value="basic">Basic</option>
              <option value="enhanced">Enhanced (needs operator code)</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Authorization ID">
            <Input
              type="password"
              value={authorizationId}
              onChange={(e) => setAuthorizationId(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
          </Field>
          <Field label={authMode === "enhanced" ? "Operator code" : "Operator code (optional)"}>
            <Input
              type="password"
              value={operatorCode}
              onChange={(e) => setOperatorCode(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
          </Field>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {saved}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save credentials"}
        </Button>
      </form>
    </section>
  );
}

/** Deletes Serv1's own records imported from one company code. The count comes first. */
function RemoveTestImports() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const total = plan ? plan.jobs.length + plan.sites.length + plan.customers.length : 0;

  async function count(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setPlan(null);
    if (!isCompanyCode(code.trim())) return setError("Company code is 1 to 6 letters or digits.");
    setBusy(true);
    try {
      setPlan(await loadRemovalPlan(code.trim()));
    } catch {
      setError("Couldn't count the records. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await removeTestImports(plan);
      if (r.changed) {
        setPlan(await loadRemovalPlan(plan.companyCode));
        setError("The records changed since they were counted. Check the new count and try again.");
      } else {
        setMessage(`Removed ${r.removed} records imported from company ${plan.companyCode}.`);
        setPlan(null);
        setCode("");
      }
    } catch {
      setError("Removal stopped part way. Count again to see what is left, then remove again.");
    } finally {
      setBusy(false);
      setConfirming(false);
      setTyped("");
      for (const t of SPECTRUM_TABLES) void qc.invalidateQueries({ queryKey: keys.table(t) });
    }
  }

  return (
    <section className="eci-card space-y-4 p-5" aria-labelledby="spectrum-remove">
      <div id="spectrum-remove">
        <SectionHeading
          title="Remove test imports"
          description="Deletes the jobs, sites and customers Serv1 imported from one Spectrum company code. Nothing in Spectrum changes."
        />
      </div>
      <form onSubmit={count} className="flex flex-wrap items-end gap-3">
        <Field label="Company code to remove">
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setPlan(null);
            }}
            className="w-40"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          Count records
        </Button>
      </form>
      {plan ? (
        <div className="space-y-3 text-sm" role="status">
          <p>
            Company {plan.companyCode}: <strong>{plan.jobs.length}</strong> jobs,{" "}
            <strong>{plan.sites.length}</strong> sites and <strong>{plan.customers.length}</strong>{" "}
            customers would be removed.
          </p>
          {plan.kept.length ? (
            <div>
              <p className="font-medium">Kept, because work in Serv1 still uses them:</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {plan.kept.map((k) => (
                  <li key={k.label}>
                    {k.label}: {k.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {total > 0 ? (
            <Button variant="destructive" onClick={() => setConfirming(true)} disabled={busy}>
              Remove {total} records
            </Button>
          ) : (
            <p className="text-muted-foreground">Nothing to remove for this company code.</p>
          )}
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <Dialog open={confirming} onOpenChange={(o) => !o && !busy && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {total} records?</DialogTitle>
            <DialogDescription>
              This deletes them from Serv1 for good. Type the company code {plan?.companyCode} to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Field label="Company code">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Keep them
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={busy || typed.trim() !== plan?.companyCode}
            >
              {busy ? "Removing…" : "Remove for good"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
