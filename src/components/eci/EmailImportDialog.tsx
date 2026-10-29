import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusBadge } from "@/components/eci/primitives";
import { DIVISIONS, JOB_TYPES } from "@/lib/eci/data";
import { useEci } from "@/lib/eci/store";
import {
  EMAIL_IMPORT_STORAGE_KEY,
  parseBidEmail,
  type EmailImportResult,
} from "@/lib/eci/email-import.functions";
import type { RateType } from "@/lib/eci/types";

export interface EmailImportDraft extends EmailImportResult {
  confirmedRateType: RateType;
}

export function EmailImportDialog() {
  const { customerRecords } = useEci();
  const navigate = useNavigate();
  const parse = useServerFn(parseBidEmail);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EmailImportResult | null>(null);
  const [rate, setRate] = useState<RateType>("Contract");

  const reset = () => {
    setText("");
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = await parse({
        data: {
          emailText: text,
          customers: customerRecords.map((c) => ({ name: c.name, rateType: c.rateType })),
          jobTypes: JOB_TYPES,
          divisions: DIVISIONS,
        },
      });
      setResult(r);
      setRate(r.suggestedRateType);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse this email.");
    } finally {
      setBusy(false);
    }
  };

  const continueToForm = () => {
    if (!result) return;
    const draft: EmailImportDraft = { ...result, confirmedRateType: rate };
    sessionStorage.setItem(EMAIL_IMPORT_STORAGE_KEY, JSON.stringify(draft));
    setOpen(false);
    reset();
    navigate({ to: "/crm/new", search: { source: "email" } });
  };

  const rows: [string, string][] = result
    ? [
        ["Customer", result.customerName || "—"],
        ["Contact", [result.contactName, result.contactEmail, result.contactPhone].filter(Boolean).join(" · ") || "—"],
        ["Project address", result.projectAddress || "—"],
        ["Job type", result.jobType || "—"],
        ["Division", result.division || "—"],
        ["Expected bid date", result.expectedBidDate || "—"],
      ]
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="size-4" />
          Import from email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import opportunity from email</DialogTitle>
          <DialogDescription>
            Paste a forwarded bid request. AI extracts the customer, contact, address, job type, division and bid
            date — you review everything before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <Textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"From: Ellen Vargas <evargas@...>\nSubject: RFP — Gym lighting retrofit\n\nHi ECI, we're requesting a proposal for…"}
            className="font-mono text-xs"
            disabled={busy}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-2 text-sm font-medium">
                {result.opportunityName || "Untitled opportunity"}
              </div>
              <dl className="divide-y divide-border text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="col-span-2 flex items-center gap-2">
                      {v}
                      {k === "Customer" ? (
                        <StatusBadge status={result.isNewCustomer ? "New customer" : "Existing"} />
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
              {result.description ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{result.description}</p>
              ) : null}
            </div>

            <div className="rounded-lg bg-muted/60 p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Rate type</p>
                {!result.needsRateConfirmation ? <StatusBadge status={result.suggestedRateType} /> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{result.rateReason}</p>
              {result.needsRateConfirmation ? (
                <RadioGroup
                  value={rate}
                  onValueChange={(v) => setRate(v as RateType)}
                  className="mt-3 flex flex-wrap gap-6"
                >
                  {(["Contract", "Non-Contract"] as RateType[]).map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={r} />
                      {r} rate
                    </label>
                  ))}
                </RadioGroup>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!result ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={run} disabled={busy || text.trim().length < 20} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy ? "Parsing…" : "Parse with AI"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setResult(null)}>
                Back to email
              </Button>
              <Button type="button" onClick={continueToForm}>
                Review in form
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
