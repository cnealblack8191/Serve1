import { useRef, useState } from "react";

import { type Job, uploadSignature, useJobMutations, useSignatureMutations } from "@/data";
import { Field } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { BottomAction, PRIMARY_BUTTON } from "./BottomAction";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

/**
 * Customer signs, then the job is Complete (SPEC.md W3).
 * Order: save the PNG, create the Signature record, then mark the job Complete,
 * so a job is never Complete without its signature.
 */
export function SignatureStep({
  job,
  customerName,
  onBack,
  onDone,
}: {
  job: Job;
  customerName?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatures = useSignatureMutations();
  const jobs = useJobMutations();

  const canSave = hasInk && name.trim().length > 0 && !busy;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const png = await pad.current?.toBlob();
      if (!png) throw new Error("Could not read the signature. Try again.");
      const storagePath = await uploadSignature(job.id, png);
      const signedAt = new Date().toISOString();
      await signatures.create.mutateAsync({
        jobId: job.id,
        signerName: name.trim(),
        storagePath,
        signedAt,
      });
      await jobs.update.mutateAsync({
        id: job.id,
        patch: { status: "Complete", completedAt: signedAt },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-1">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 min-h-12 px-2 text-base font-medium text-primary"
        >
          ← Back to job
        </button>
        <h1 className="text-2xl font-semibold">Customer signature</h1>
        <p className="text-base text-muted-foreground">
          {customerName ? `${customerName}: ` : ""}please sign to confirm the work is done.
        </p>
      </div>

      <section className="space-y-2">
        <SignaturePad ref={pad} onInk={setHasInk} />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-12 px-5 text-base"
            onClick={() => pad.current?.clear()}
            disabled={!hasInk || busy}
          >
            Clear
          </Button>
        </div>
      </section>

      <Field label="Signer name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="h-12 text-base"
          placeholder="Full name"
        />
      </Field>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <BottomAction>
        <Button className={PRIMARY_BUTTON} disabled={!canSave} onClick={() => void save()}>
          {busy ? "Saving…" : "Save signature"}
        </Button>
      </BottomAction>
    </>
  );
}
