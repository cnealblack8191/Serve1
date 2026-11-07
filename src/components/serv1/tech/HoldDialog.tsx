import { useState } from "react";

import { Field } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Asks for a reason, then saves. Used for On hold (tech or office), Send back and Cancel. */
export function HoldDialog({
  open,
  onOpenChange,
  onSave,
  busy,
  title = "Put the job on hold",
  description = "Say why, so the office knows what is needed (for example: waiting on a part).",
  label = "Reason",
  saveLabel = "Put on hold",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (reason: string) => void;
  busy: boolean;
  title?: string;
  description?: string;
  label?: string;
  saveLabel?: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label={label}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-base"
            rows={3}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            className="h-12"
            disabled={!reason.trim() || busy}
            onClick={() => onSave(reason.trim())}
          >
            {busy ? "Saving…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
