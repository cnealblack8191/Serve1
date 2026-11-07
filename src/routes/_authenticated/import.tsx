import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState, PageHeader, SectionHeading } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { runImport, type ImportResult } from "@/data";
import { OFFICE_EDIT, requireRole } from "@/lib/access";
import { buildImportPlan, type ImportPlan } from "@/lib/import/smartsheet";
import { readCsv, readXlsx, type Sheet } from "@/lib/import/xlsx";
import { CONTRACT_LABEL, STAGE_LABEL } from "@/lib/status";

/** One-time import of the Business Services Smartsheet exports (Admin and Office only). */
export const Route = createFileRoute("/_authenticated/import")({
  beforeLoad: ({ context }) => requireRole(context.user.role, OFFICE_EDIT),
  component: Page,
});

async function readFile(f: File): Promise<{ file: string; sheets: Sheet[] }> {
  if (/\.csv$/i.test(f.name)) return { file: f.name, sheets: [readCsv(await f.text(), f.name)] };
  return { file: f.name, sheets: await readXlsx(new Uint8Array(await f.arrayBuffer())) };
}

function Page() {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const choose = async (files: FileList | null) => {
    setError(null);
    setResult(null);
    setPlan(null);
    if (!files?.length) return;
    try {
      setPlan(buildImportPlan(await Promise.all([...files].map(readFile))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the files.");
    }
  };

  const [running, setRunning] = useState(false);
  const run = async () => {
    // Busy from the first moment: a second click must never start a second import.
    if (!plan || running) return;
    setRunning(true);
    setError(null);
    try {
      const r = await runImport(plan, (d, t) => setProgress([d, t]));
      setResult(r);
      void qc.invalidateQueries();
    } catch (e) {
      setError(
        `Import stopped: ${e instanceof Error ? e.message : "unknown error"}. Run it again; rows already imported are skipped.`,
      );
    } finally {
      setProgress(null);
      setRunning(false);
    }
  };

  const stageCounts = new Map<string, number>();
  for (const o of plan?.opportunities ?? [])
    stageCounts.set(o.data.stage, (stageCounts.get(o.data.stage) ?? 0) + 1);
  const jobCount =
    (plan?.jobs.length ?? 0) + (plan?.opportunities.filter((o) => o.job).length ?? 0);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Import from Smartsheet"
        description="One-time import of the Sales Pipeline, Service Pipeline and Task Tracker Excel exports."
      />
      <section className="eci-card space-y-3 p-5">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>In Smartsheet, export each sheet: File › Export › Export to Microsoft Excel.</li>
          <li>Choose all the files here at once. Nothing is saved until you press Import.</li>
          <li>
            Check the summary, then press Import. Running it again skips rows already imported.
          </li>
        </ol>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Smartsheet export files (.xlsx or .csv)
          <input
            type="file"
            multiple
            accept=".xlsx,.csv"
            className="text-sm"
            onChange={(e) => void choose(e.target.files)}
          />
        </label>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {plan ? (
        <>
          <section className="space-y-3" aria-label="Import summary">
            <SectionHeading title="What will be imported" />
            <div className="eci-card space-y-3 p-5 text-sm">
              <ul className="space-y-1">
                {plan.sheets.map((s) => (
                  <li key={`${s.file}/${s.sheet}`}>
                    {s.file} / {s.sheet}:{" "}
                    {s.kind ? (
                      <span>
                        {s.kind === "sales"
                          ? "Sales Pipeline"
                          : s.kind === "service"
                            ? "Service Pipeline"
                            : "Task Tracker"}
                        , {s.rows} rows
                      </span>
                    ) : (
                      <span className="text-muted-foreground">not recognised, skipped</span>
                    )}
                  </li>
                ))}
              </ul>
              <p>
                <strong>{plan.opportunities.length}</strong> opportunities ({plan.mergedServiceRows}{" "}
                Service Pipeline rows merged into the sales row with the same name) and{" "}
                <strong>{jobCount}</strong> jobs.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {[...stageCounts].map(([stage, n]) => (
                  <li key={stage}>
                    {STAGE_LABEL[stage as keyof typeof STAGE_LABEL]}: {n}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {plan.contractSpellings.length ? (
            <section className="space-y-3">
              <SectionHeading title="Customer contract spellings cleaned" />
              <div className="eci-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3">In the sheet</th>
                      <th className="p-3">Becomes</th>
                      <th className="p-3 text-right">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.contractSpellings.map((c) => (
                      <tr key={c.raw} className="border-b border-border/70 last:border-0">
                        <td className="p-3">{c.raw}</td>
                        <td className="p-3">{CONTRACT_LABEL[c.contract]}</td>
                        <td className="p-3 text-right tabular-nums">{c.rows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {plan.warnings.length ? (
            <section className="space-y-3">
              <SectionHeading title={`Check these (${plan.warnings.length})`} />
              <ul className="eci-card max-h-72 list-disc space-y-1 overflow-y-auto p-5 pl-9 text-sm">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {result ? (
            <section className="eci-card space-y-2 p-5 text-sm" role="status">
              <p className="font-medium">Import finished.</p>
              <p>
                {result.opportunitiesCreated} opportunities, {result.jobsCreated} jobs and{" "}
                {result.customersCreated} customers added; {result.skipped} already imported and
                skipped.
              </p>
              <Link to="/opportunities" className="text-eci-copper hover:underline">
                Open Opportunities
              </Link>
            </section>
          ) : (
            <Button
              onClick={() => void run()}
              disabled={running || plan.opportunities.length + plan.jobs.length === 0}
            >
              {running
                ? progress
                  ? `Importing ${progress[0]} of ${progress[1]}…`
                  : "Starting import…"
                : `Import ${plan.opportunities.length + plan.jobs.length} records`}
            </Button>
          )}
        </>
      ) : (
        <EmptyState title="No files chosen yet" hint="Choose the Smartsheet Excel exports above." />
      )}
    </div>
  );
}
