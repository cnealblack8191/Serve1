import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/eci/primitives";
import { DIVISIONS } from "@/lib/eci/data";
import { money, useEci, type ImportedOpportunityInput } from "@/lib/eci/store";
import type { OpportunityStage } from "@/lib/eci/types";

type Field = Exclude<keyof ImportedOpportunityInput, "source">;

const FIELDS: { key: Field; label: string; required?: boolean; hint: string }[] = [
  { key: "name", label: "Opportunity name", required: true, hint: "Project / bid title" },
  { key: "customer", label: "Customer", required: true, hint: "Created if not already in the customer list" },
  { key: "contactName", label: "Contact name", hint: "" },
  { key: "address", label: "Project address", hint: "" },
  { key: "jobType", label: "Job type", hint: "" },
  { key: "division", label: "Division", hint: DIVISIONS.join(", ") },
  { key: "expectedBidDate", label: "Expected bid date", hint: "Dates are normalised to YYYY-MM-DD" },
  { key: "description", label: "Description", hint: "" },
  { key: "notes", label: "Notes", hint: "" },
  { key: "assignedTo", label: "Assigned to", hint: "" },
  { key: "value", label: "Estimated value", hint: "Currency symbols and commas are stripped" },
  { key: "stage", label: "Stage", hint: "Unrecognised stages default to New Opportunity" },
];

const STAGES: OpportunityStage[] = [
  "New Opportunity",
  "Bid or No-Bid Decision",
  "Approved to Estimate",
  "No-Bid",
];

/** Header aliases used to suggest a first-pass mapping. */
const ALIASES: Record<Field, string[]> = {
  name: ["name", "opportunity", "project", "project name", "title", "job name"],
  customer: ["customer", "client", "owner", "account", "company"],
  contactName: ["contact", "contact name", "primary contact"],
  address: ["address", "location", "site", "project address", "site address"],
  jobType: ["job type", "type", "work type", "scope"],
  division: ["division", "dept", "department", "group"],
  expectedBidDate: ["bid date", "due", "due date", "expected bid date", "bid due"],
  description: ["description", "summary", "details"],
  notes: ["notes", "comments", "remarks"],
  assignedTo: ["assigned", "assigned to", "estimator", "owner name", "salesperson"],
  value: ["value", "amount", "estimate", "estimated value", "budget", "contract value"],
  stage: ["stage", "status", "phase", "pipeline"],
};

const SKIP = "__skip__";
const MAPPING_KEY = "eci.smartsheet-import.mapping";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function suggestMapping(headers: string[]): Record<Field, string> {
  const saved = readSavedMapping();
  const out = {} as Record<Field, string>;
  for (const f of FIELDS) {
    const prev = saved?.[f.key];
    if (prev && headers.includes(prev)) {
      out[f.key] = prev;
      continue;
    }
    const hit =
      headers.find((h) => ALIASES[f.key].includes(norm(h))) ??
      headers.find((h) => ALIASES[f.key].some((a) => norm(h).includes(a)));
    out[f.key] = hit ?? SKIP;
  }
  return out;
}

function readSavedMapping(): Partial<Record<Field, string>> | null {
  try {
    const raw = window.localStorage.getItem(MAPPING_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<Field, string>>) : null;
  } catch {
    return null;
  }
}

function toDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toStage(v: unknown): OpportunityStage {
  const s = norm(String(v ?? ""));
  const match = STAGES.find((st) => norm(st) === s);
  if (match) return match;
  if (s.includes("no bid") || s.includes("nobid")) return s.includes("decision") ? "Bid or No-Bid Decision" : "No-Bid";
  if (s.includes("estimat") || s.includes("approved")) return "Approved to Estimate";
  if (s.includes("decision")) return "Bid or No-Bid Decision";
  return "New Opportunity";
}

function toDivision(v: unknown): string {
  const s = norm(String(v ?? ""));
  return DIVISIONS.find((d) => norm(d) === s) ?? String(v ?? "").trim();
}

type RawRow = Record<string, unknown>;

export function SmartsheetImportDialog() {
  const { importOpportunities, opportunities } = useEci();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string>>({} as Record<Field, string>);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setSelected(new Set());
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (!sheet) throw new Error("The file has no sheets.");
      const data = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
      if (data.length === 0) throw new Error("No data rows were found under the header row.");
      const hdrs = Object.keys(data[0]!).filter((h) => !h.startsWith("__EMPTY"));
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(data);
      setMapping(suggestMapping(hdrs));
      setStep("map");
    } catch (e) {
      toast.error("Couldn't read that file", { description: (e as Error).message });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const mapped = useMemo<ImportedOpportunityInput[]>(() => {
    const get = (r: RawRow, f: Field) => (mapping[f] && mapping[f] !== SKIP ? r[mapping[f]] : "");
    const str = (v: unknown) => String(v ?? "").trim();
    return rows.map((r) => ({
      name: str(get(r, "name")),
      customer: str(get(r, "customer")),
      contactName: str(get(r, "contactName")),
      address: str(get(r, "address")),
      jobType: str(get(r, "jobType")),
      division: toDivision(get(r, "division")),
      expectedBidDate: toDate(get(r, "expectedBidDate")),
      description: str(get(r, "description")),
      notes: str(get(r, "notes")),
      assignedTo: str(get(r, "assignedTo")),
      value: toNumber(get(r, "value")),
      stage: toStage(get(r, "stage")),
      source: /service/i.test(fileName) ? "Service" : "Sales",
    }));
  }, [rows, mapping, fileName]);

  const existingNames = useMemo(
    () => new Set(opportunities.map((o) => `${norm(o.name)}|${norm(o.customer)}`)),
    [opportunities],
  );
  const isDuplicate = (r: ImportedOpportunityInput) =>
    existingNames.has(`${norm(r.name)}|${norm(r.customer)}`);

  const goPreview = () => {
    if (mapping.name === SKIP || mapping.customer === SKIP) {
      toast.error("Opportunity name and Customer must be mapped.");
      return;
    }
    try {
      window.localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
    } catch {
      /* ignore */
    }
    const initial = new Set<number>();
    mapped.forEach((r, i) => {
      if (r.name && r.customer && !isDuplicate(r)) initial.add(i);
    });
    setSelected(initial);
    setStep("preview");
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const validIdx = mapped.map((r, i) => (r.name && r.customer ? i : -1)).filter((i) => i >= 0);
  const allSelected = validIdx.length > 0 && validIdx.every((i) => selected.has(i));

  const confirm = () => {
    const chosen = mapped.filter((_, i) => selected.has(i));
    const ids = importOpportunities(chosen);
    toast.success(`Imported ${ids.length} opportunit${ids.length === 1 ? "y" : "ies"} from Smartsheets`);
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Import from Smartsheets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import opportunities from Smartsheets</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV or Excel export. The first sheet's first row is treated as the column headers."}
            {step === "map" && `Match the columns in ${fileName} to opportunity fields. Your mapping is remembered for next time.`}
            {step === "preview" && "Review the rows below and untick anything that should be skipped before importing."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">Drop a Smartsheets export here</p>
              <p className="text-sm text-muted-foreground">.csv, .xlsx or .xls</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
              Choose file
            </Button>
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"} · {headers.length} columns detected
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="rounded-lg border border-border p-3">
                  <label className="text-sm font-medium">
                    {f.label}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                  </label>
                  <Select
                    value={mapping[f.key] ?? SKIP}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— Not in file —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {f.hint ? <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p> : null}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Choose a different file
              </Button>
              <Button onClick={goPreview}>Preview rows</Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {selected.size} of {mapped.length} rows selected. Likely duplicates and rows missing a name or customer are unticked by default.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(validIdx))
                }
              >
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Opportunity</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Division</th>
                    <th className="px-3 py-2">Bid date</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {mapped.map((r, i) => {
                    const invalid = !r.name || !r.customer;
                    const dup = !invalid && isDuplicate(r);
                    return (
                      <tr key={i} className={selected.has(i) ? "" : "opacity-60"}>
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={selected.has(i)}
                            disabled={invalid}
                            onCheckedChange={() => toggle(i)}
                            aria-label={`Include row ${i + 1}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{r.name || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2">{r.customer || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.division || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.expectedBidDate || "—"}</td>
                        <td className="px-3 py-2">{money(r.value)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={r.stage} />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {invalid ? "Missing name/customer" : dup ? "Possible duplicate" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("map")}>
                Back to mapping
              </Button>
              <Button onClick={confirm} disabled={selected.size === 0}>
                Import {selected.size} opportunit{selected.size === 1 ? "y" : "ies"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
