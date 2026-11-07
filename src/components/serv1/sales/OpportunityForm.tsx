import { useState, type FormEvent } from "react";

import { Field } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_CONTRACTS,
  OPPORTUNITY_STAGES,
  WORK_TYPES,
  useCustomers,
  type NewOpportunity,
} from "@/data";
import { CONTRACT_LABEL, STAGE_LABEL, WORK_TYPE_LABEL } from "@/lib/status";

import { MONEY_FIELDS, SELECT_CLASS } from "./format";

type Draft = NewOpportunity;

/**
 * Add or edit an opportunity. Closing as Won goes through the "Mark won" button instead,
 * so the job is created at the same moment (one record, no re-entry).
 */
export function OpportunityForm({
  initial,
  reps,
  showMoney,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  reps: string[];
  showMoney: boolean;
  saving: boolean;
  submitLabel: string;
  onSubmit: (d: Draft) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const customers = useCustomers();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const text = (k: keyof Draft) => ({
    value: (d[k] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) =>
      set(k, (e.target.value.trim() === "" ? null : e.target.value) as never),
  });
  const date = (k: keyof Draft) => ({ type: "date", ...text(k) });
  const num = (k: keyof Draft) => ({
    type: "number",
    inputMode: "decimal" as const,
    step: "any",
    value: d[k] === null || d[k] === undefined ? "" : String(d[k]),
    onChange: (e: { target: { value: string } }) =>
      set(k, (e.target.value === "" ? null : Number(e.target.value)) as never),
  });

  // Won is set by "Mark won" (it creates the job), so the stage list here leaves it out
  // unless the record is already won.
  const stages = OPPORTUNITY_STAGES.filter(
    (s) => s !== "ClosedWon" || initial.stage === "ClosedWon",
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) {
      setError("Give the opportunity a name.");
      return;
    }
    if (d.nextStepRemind && !d.nextStepDue) {
      setError("A reminder needs a next-step due date.");
      return;
    }
    setError(null);
    onSubmit({ ...d, name: d.name.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="eci-card space-y-4 p-5">
        <h2 className="eci-panel-title">Opportunity</h2>
        <Field label="Opportunity name">
          <Input {...text("name")} value={d.name} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Stage">
            <select
              className={SELECT_CLASS}
              value={d.stage}
              disabled={initial.stage === "ClosedWon"}
              onChange={(e) => set("stage", e.target.value as Draft["stage"])}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className={SELECT_CLASS}
              value={d.type}
              onChange={(e) => set("type", e.target.value as Draft["type"])}
            >
              {WORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WORK_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Customer contract">
            <select
              className={SELECT_CLASS}
              value={d.customerContract}
              onChange={(e) => set("customerContract", e.target.value as Draft["customerContract"])}
            >
              {CUSTOMER_CONTRACTS.map((c) => (
                <option key={c} value={c}>
                  {CONTRACT_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" hint="Needed when it is won; you can pick it then.">
            <select
              className={SELECT_CLASS}
              value={d.customerId ?? ""}
              onChange={(e) => set("customerId", e.target.value || null)}
            >
              <option value="">Not chosen yet</option>
              {(customers.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Sales rep">
            <Input {...text("salesRep")} list="sales-reps" autoComplete="off" />
          </Field>
          <Field label="Customer contact">
            <Input {...text("customerContact")} />
          </Field>
          <Field label="Invoice contact">
            <Input {...text("invoiceContact")} />
          </Field>
          <Field label="Priority">
            <Input {...text("priority")} placeholder="e.g. High" />
          </Field>
        </div>
        <datalist id="sales-reps">
          {reps.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </section>

      <section className="eci-card space-y-4 p-5">
        <h2 className="eci-panel-title">Numbers and dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ECI quote #">
            <Input {...text("eciQuoteNumber")} />
          </Field>
          <Field label="Work order #">
            <Input {...text("workOrderNumber")} />
          </Field>
          <Field label="Customer PO #">
            <Input {...text("customerPoNumber")} />
          </Field>
          <Field label="Quote due">
            <Input {...date("quoteDue")} />
          </Field>
          <Field label="Site visit">
            <Input {...date("siteVisitDate")} />
          </Field>
          <Field label="Expected close">
            <Input {...date("expectedClose")} />
          </Field>
        </div>
      </section>

      {showMoney ? (
        <section className="eci-card space-y-4 p-5">
          <h2 className="eci-panel-title">Amounts</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            {MONEY_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input {...num(f.key)} />
              </Field>
            ))}
          </div>
        </section>
      ) : null}

      <section className="eci-card space-y-4 p-5">
        <h2 className="eci-panel-title">Next step</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Next step">
            <Input {...text("nextStep")} placeholder="e.g. Call to book the site visit" />
          </Field>
          <Field label="Next step due">
            <Input {...date("nextStepDue")} />
          </Field>
        </div>
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--eci-copper)]"
            checked={d.nextStepRemind}
            onChange={(e) => set("nextStepRemind", e.target.checked)}
          />
          Remind me: list it under Needs attention when it is due
        </label>
        <Field label="Notes">
          <Textarea {...text("notes")} rows={4} />
        </Field>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
