import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload } from "lucide-react";
import { EMAIL_IMPORT_STORAGE_KEY } from "@/lib/eci/email-import.functions";
import type { EmailImportDraft } from "@/components/eci/EmailImportDialog";
import { AppShell } from "@/components/eci/AppShell";
import { Field, PageHeader } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/eci/primitives";
import { DIVISIONS, JOB_TYPES } from "@/lib/eci/data";
import { useEci } from "@/lib/eci/store";
import type { QuoteFormat } from "@/lib/eci/types";

const NEW_CUSTOMER_VALUE = "__new__";
const OTHER_EMPLOYEE_VALUE = "__other__";
const ASSIGNED_EMPLOYEE_OPTIONS = ["Brad Christian", "Nathan Butler", "Other"];

export const Route = createFileRoute("/_authenticated/crm/new")({
  validateSearch: (s: Record<string, unknown>): { source?: "email" } =>
    s["source"] === "email" ? { source: "email" } : {},
  head: () => ({
    meta: [
      { title: "New Opportunity — ECI Operations" },
      {
        name: "description",
        content:
          "Capture a new electrical construction opportunity with customer, project address, division, bid date and documents.",
      },
      { property: "og:title", content: "New Opportunity — ECI Operations" },
      {
        property: "og:description",
        content: "Start the ECI opportunity-to-job workflow with a single simple form.",
      },
    ],
  }),
  component: NewOpportunity,
});

function NewOpportunity() {
  const { customers, customerRecords, addCustomer, createOpportunity } = useEci();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer: customers[0] ?? "",
    newCustomerName: "",
    newCustomerBillingAddress: "",
    newCustomerQuoteFormat: "Lump Sum",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    name: "",
    address: "",
    jobType: JOB_TYPES[1]!,
    division: DIVISIONS[0]!,
    expectedBidDate: "",
    description: "",
    notes: "",
    assignedTo: ASSIGNED_EMPLOYEE_OPTIONS[0]!,
    assignedToOther: "",
    value: "",
    documentName: "",
  });
  const [useNonContractRate, setUseNonContractRate] = useState(false);
  const { source } = Route.useSearch();
  const [imported, setImported] = useState<EmailImportDraft | null>(null);

  // Pre-fill from the AI email import draft (read in an effect to stay hydration-safe).
  useEffect(() => {
    if (source !== "email") return;
    const raw = sessionStorage.getItem(EMAIL_IMPORT_STORAGE_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as EmailImportDraft;
      setImported(d);
      setForm((f) => ({
        ...f,
        customer: d.matchedCustomer ?? NEW_CUSTOMER_VALUE,
        newCustomerName: d.matchedCustomer ? "" : d.customerName,
        contactName: d.contactName,
        contactEmail: d.contactEmail,
        contactPhone: d.contactPhone,
        name: d.opportunityName,
        address: d.projectAddress,
        jobType: d.jobType || f.jobType,
        division: d.division || f.division,
        expectedBidDate: d.expectedBidDate,
        description: d.description,
        value: d.estimatedValue ? String(d.estimatedValue) : "",
      }));
      const baseRate = d.matchedCustomer
        ? (customerRecords.find((c) => c.name === d.matchedCustomer)?.rateType ?? "Contract")
        : "Contract";
      setUseNonContractRate(d.confirmedRateType === "Non-Contract" && baseRate === "Contract");
    } catch {
      /* ignore a corrupt draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const isNewCustomer = form.customer === NEW_CUSTOMER_VALUE;
  // New customers start on the standard contract schedule.
  const customerRateType = isNewCustomer
    ? "Contract"
    : (customerRecords.find((c) => c.name === form.customer)?.rateType ?? "Contract");
  const effectiveRateType = useNonContractRate ? "Non-Contract" : customerRateType;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isOtherEmployee = form.assignedTo === OTHER_EMPLOYEE_VALUE;
  const assignedEmployeeName = isOtherEmployee ? form.assignedToOther.trim() : form.assignedTo;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address) {
      toast.error("Opportunity name and project address are required.");
      return;
    }
    const customerName = isNewCustomer ? form.newCustomerName.trim() : form.customer;
    if (isNewCustomer && !customerName) {
      toast.error("Company name is required for a new customer.");
      return;
    }
    if (isNewCustomer) {
      addCustomer(customerName, {
        rateType: customerRateType,
        quoteFormat: form.newCustomerQuoteFormat as QuoteFormat,
      });
    }
    if (isOtherEmployee && !assignedEmployeeName) {
      toast.error("Employee name is required when selecting Other.");
      return;
    }
    const id = createOpportunity({
      name: form.name,
      customer: customerName,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      address: form.address,
      jobType: form.jobType,
      division: form.division,
      expectedBidDate: form.expectedBidDate,
      description: form.description,
      notes: form.notes,
      assignedTo: assignedEmployeeName,
      value: Number(form.value.replace(/[^0-9.]/g, "")) || 0,
      documentName: form.documentName,
      newCustomer: isNewCustomer,
      rateType: effectiveRateType,
      ...(imported ? { source: "ai-email-import" as const } : {}),
    });
    if (imported) sessionStorage.removeItem(EMAIL_IMPORT_STORAGE_KEY);
    toast.success("Opportunity created");
    navigate({ to: "/crm/$id", params: { id } });
  };

  return (
    <AppShell>
      <PageHeader
        title="New Opportunity"
        description="Step 1 of the ECI workflow. Capture the lead, then make the bid or no-bid decision."
      />

      {imported ? (
        <div className="mb-6 flex max-w-4xl items-start gap-3 rounded-lg border border-border bg-muted/60 p-4 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Pre-filled from an email by AI — review before saving.</p>
            <p className="text-muted-foreground">
              {imported.isNewCustomer
                ? `"${imported.customerName}" was not found in ECI records and will be created as a new customer.`
                : `Matched existing customer ${imported.customerName}.`}{" "}
              Rate: {imported.confirmedRateType}. Nothing is saved until you click Create opportunity.
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="eci-card max-w-4xl space-y-8 p-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field label="Customer">
            <Select value={form.customer} onValueChange={(v) => set("customer", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_CUSTOMER_VALUE}>+ New customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Rate type"
            hint={
              useNonContractRate
                ? "Overridden for this opportunity only — the customer record is unchanged."
                : "From the customer record."
            }
          >
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={customerRateType} />
                {useNonContractRate ? (
                  <span className="text-sm text-muted-foreground">
                    → using {effectiveRateType} rate
                  </span>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={useNonContractRate}
                  onCheckedChange={(v) => setUseNonContractRate(v === true)}
                />
                Use non-contract rate for this opportunity
              </label>
            </div>
          </Field>

          {isNewCustomer ? (
            <>
              <Field label="Company name">
                <Input
                  value={form.newCustomerName}
                  onChange={(e) => set("newCustomerName", e.target.value)}
                  placeholder="e.g. Lincoln High School"
                  required={isNewCustomer}
                />
              </Field>

              <Field label="Billing address">
                <Input
                  value={form.newCustomerBillingAddress}
                  onChange={(e) => set("newCustomerBillingAddress", e.target.value)}
                  placeholder="1600 Emerald St, Covington, GA 30014"
                />
              </Field>

              <Field
                label="Quote format"
                hint="Itemized quotes break out labor hours by role and materials."
              >
                <Select
                  value={form.newCustomerQuoteFormat}
                  onValueChange={(v) => set("newCustomerQuoteFormat", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lump Sum">Lump Sum</SelectItem>
                    <SelectItem value="Itemized">Itemized</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : null}

          <Field label="Customer contact">
            <Input
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="e.g. Ellen Vargas"
            />
          </Field>

          {isNewCustomer ? (
            <>
              <Field label="Contact email">
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                  placeholder="contact@school.edu"
                />
              </Field>

              <Field label="Contact phone">
                <Input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  placeholder="(770) 555-0100"
              />
              </Field>
            </>
          ) : null}

          <Field label="Opportunity name">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Meridian Tower — Floor 14 Retrofit"
            />
          </Field>

          <Field label="Project address">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="1400 Meridian Ave, Covington, GA"
            />
          </Field>

          <Field label="Job type">
            <Select value={form.jobType} onValueChange={(v) => set("jobType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Division">
            <Select value={form.division} onValueChange={(v) => set("division", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIVISIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Expected bid date">
            <Input
              type="date"
              value={form.expectedBidDate}
              onChange={(e) => set("expectedBidDate", e.target.value)}
            />
          </Field>

          <Field label="Estimated value">
            <Input
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder="$120,000"
            />
          </Field>

          <Field label="Assigned employee">
            <Select value={form.assignedTo} onValueChange={(v) => set("assignedTo", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNED_EMPLOYEE_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e === "Other" ? OTHER_EMPLOYEE_VALUE : e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isOtherEmployee ? (
            <Field label="Other employee name">
              <Input
                value={form.assignedToOther}
                onChange={(e) => set("assignedToOther", e.target.value)}
                placeholder="e.g. Alex Rivera"
                required={isOtherEmployee}
              />
            </Field>
          ) : null}

          <Field label="Uploaded documents" hint="Stored in the company document provider.">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  set("documentName", "Customer-RFP.pdf");
                  toast.success("Customer-RFP.pdf attached");
                }}
              >
                <Upload className="size-4" />
                Upload document
              </Button>
              {form.documentName ? (
                <span className="text-sm text-muted-foreground">{form.documentName}</span>
              ) : null}
            </div>
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Scope summary, service voltage, phasing requirements…"
          />
        </Field>

        <Field label="Notes">
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Internal notes for the estimating team"
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          <Button type="submit">Create opportunity</Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
