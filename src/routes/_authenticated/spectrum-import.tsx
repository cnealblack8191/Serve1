import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { EmptyState, Field, PageHeader } from "@/components/eci/primitives";
import { SELECT_CLASS } from "@/components/serv1/sales/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatAddress,
  importFromSpectrum,
  isRecordNumber,
  isStatusCode,
  keys,
  listSpectrumJobs,
  listSpectrumWorkOrders,
  recordMatch,
  SPECTRUM_TABLES,
  SpectrumError,
  useCurrentUser,
  useJobs,
  type SpectrumImportResult,
  type SpectrumJob,
  type SpectrumKind,
  type SpectrumWorkOrder,
} from "@/data";
import { OFFICE_EDIT, requireRole } from "@/lib/access";

/** Import jobs or work orders from Spectrum (Admin and Office; API.md section 5). */
export const Route = createFileRoute("/_authenticated/spectrum-import")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_EDIT),
  component: Page,
});

type Rec = SpectrumJob | SpectrumWorkOrder;
const numberOf = (r: Rec) => ("workOrderNumber" in r ? r.workOrderNumber : r.jobNumber);

function Page() {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const jobs = useJobs();
  const [kind, setKind] = useState<SpectrumKind>("jobs");
  const [status, setStatus] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [list, setList] = useState<{
    kind: SpectrumKind;
    records: Rec[];
    truncated: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<SpectrumImportResult | null>(null);
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null);

  const showError = (e: unknown) =>
    setError(
      e instanceof SpectrumError
        ? { text: e.message, setup: e.code === "not_configured" || e.code === "bad_credentials" }
        : { text: "Something went wrong. Try again.", setup: false },
    );

  async function look(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setList(null);
    const s = status.trim();
    const jn = jobNumber.trim();
    if (s && !isStatusCode(s))
      return setError({
        text: "Status is Spectrum's code: 1 to 3 letters or digits.",
        setup: false,
      });
    if (kind === "workOrders" && jn && !isRecordNumber(jn))
      return setError({
        text: "Job number is up to 30 letters, digits, spaces or . _ / - and starts with a letter or digit.",
        setup: false,
      });
    setLoading(true);
    try {
      const r =
        kind === "jobs"
          ? await listSpectrumJobs(s || undefined)
          : await listSpectrumWorkOrders({ status: s || undefined, jobNumber: jn || undefined });
      setList({ kind, records: r.records, truncated: r.truncated });
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  const known = jobs.data ?? [];
  const fresh = list?.records.filter((r) => !recordMatch(known, r)) ?? [];

  async function run() {
    if (!list || running || fresh.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await importFromSpectrum(fresh, (d, t) => setProgress([d, t])));
    } catch (err) {
      if (err instanceof SpectrumError) showError(err);
      else
        setError({
          text: "Import stopped part way. Run it again; records already imported are skipped.",
          setup: false,
        });
    } finally {
      setProgress(null);
      setRunning(false);
      for (const t of SPECTRUM_TABLES) void qc.invalidateQueries({ queryKey: keys.table(t) });
    }
  }

  const label = list?.kind === "workOrders" ? "work orders" : "jobs";

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Import from Spectrum"
        description="Look up jobs or work orders in Spectrum, then import the ones Serv1 doesn't have yet. Nothing is saved until you press Import."
      />
      <form onSubmit={look} className="eci-card flex flex-wrap items-end gap-3 p-5">
        <Field label="Import">
          <select
            className={SELECT_CLASS}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SpectrumKind);
              setList(null);
              setResult(null);
            }}
          >
            <option value="jobs">Jobs</option>
            <option value="workOrders">Work orders</option>
          </select>
        </Field>
        <Field label="Spectrum status (optional)">
          <Input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-28"
            spellCheck={false}
          />
        </Field>
        {kind === "workOrders" ? (
          <Field label="Spectrum job number (optional)">
            <Input
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="w-44"
              spellCheck={false}
            />
          </Field>
        ) : null}
        <Button type="submit" disabled={loading || running}>
          {loading ? "Looking up…" : "Look up in Spectrum"}
        </Button>
      </form>

      {error ? (
        <div
          role="alert"
          className="eci-card border-red-300 p-4 text-sm text-red-700 dark:text-red-400"
        >
          {error.text}
          {error.setup && me.data?.role === "Admin" ? (
            <>
              {" "}
              <Link to="/settings/integrations/spectrum" className="underline">
                Open Spectrum settings
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {list ? (
        <section className="space-y-3">
          {list.truncated ? (
            <p
              role="status"
              className="eci-card border-amber-300 p-4 text-sm text-amber-800 dark:text-amber-300"
            >
              Spectrum has more {label} than it can send at once, so this list is only part of them.
              Narrow it with a status
              {list.kind === "workOrders" ? " or a job number" : ""} and look up again.
            </p>
          ) : null}
          {list.records.length === 0 ? (
            <EmptyState title={`Spectrum sent no ${label}`} hint="Try another status, or none." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {list.records.length} {label} from Spectrum: <strong>{fresh.length}</strong> new,{" "}
                  {list.records.length - fresh.length} already in Serv1.
                </p>
                <Button onClick={run} disabled={running || fresh.length === 0}>
                  {running
                    ? progress
                      ? `Importing ${progress[0]} of ${progress[1]}…`
                      : "Importing…"
                    : `Import ${fresh.length} new ${label}`}
                </Button>
              </div>
              <div className="eci-card overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">Spectrum {label}</caption>
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Number</th>
                      <th className="px-4 py-2">{list.kind === "jobs" ? "Job" : "Work order"}</th>
                      <th className="px-4 py-2">{list.kind === "jobs" ? "Customer" : "Job"}</th>
                      <th className="px-4 py-2">Address</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">In Serv1</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {list.records.map((r) => {
                      const match = recordMatch(known, r);
                      return (
                        <tr key={`${r.companyCode}|${numberOf(r)}`}>
                          <td className="px-4 py-2 font-medium">{numberOf(r)}</td>
                          <td className="px-4 py-2">
                            {"workOrderNumber" in r ? r.description : r.jobName}
                          </td>
                          <td className="px-4 py-2">
                            {"workOrderNumber" in r ? r.jobNumber : r.customer.name}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {formatAddress("workOrderNumber" in r ? r.site : r.address) ?? "—"}
                          </td>
                          <td className="px-4 py-2">{r.status ?? "—"}</td>
                          <td className="px-4 py-2">
                            {match ? (
                              <Link
                                to="/jobs/$id"
                                params={{ id: match.id }}
                                className="text-eci-copper underline"
                              >
                                {match.jobNumber ?? "Open job"}
                              </Link>
                            ) : (
                              "New"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {result ? (
        <section role="status" className="eci-card space-y-1 p-5 text-sm">
          <p className="font-medium">Import finished</p>
          <p>
            {result.jobsCreated} jobs, {result.customersCreated} customers and {result.sitesCreated}{" "}
            sites added; {result.alreadyImported} already in Serv1.
          </p>
          {result.skipped.length ? (
            <ul className="list-disc pl-5 text-muted-foreground">
              {result.skipped.map((s) => (
                <li key={s.number}>
                  {s.number} not imported: {s.reason}.
                </li>
              ))}
            </ul>
          ) : null}
          <Link to="/jobs" className="text-eci-copper underline">
            Go to jobs
          </Link>
        </section>
      ) : null}
    </div>
  );
}
