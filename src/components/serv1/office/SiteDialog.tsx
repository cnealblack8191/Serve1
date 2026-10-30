import { useEffect, useState, type FormEvent } from "react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSiteMutations, type Site } from "@/data";

/** Add a site to a customer, or edit an existing one when `site` is given. */
export function SiteDialog({
  open,
  onOpenChange,
  customerId,
  site,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  site?: Site | null;
  onSaved?: (site: Site) => void;
}) {
  const { create, update } = useSiteMutations();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(site?.name ?? "");
    setAddress(site?.address ?? "");
    setAccessNotes(site?.accessNotes ?? "");
    setError("");
  }, [open, site]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // dialogs render in a portal; keep the submit from reaching a surrounding form
    if (!address.trim()) return setError("Enter the site address.");
    const values = {
      name: name.trim() || null,
      address: address.trim(),
      accessNotes: accessNotes.trim() || null,
    };
    try {
      const saved = site
        ? await update.mutateAsync({ id: site.id, patch: values })
        : await create.mutateAsync({ customerId, ...values });
      onOpenChange(false);
      onSaved?.(saved);
    } catch {
      setError("Couldn't save the site. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{site ? "Edit site" : "Add site"}</DialogTitle>
            <DialogDescription>
              Where the work happens. Access notes help the tech get in.
            </DialogDescription>
          </DialogHeader>
          <Field label="Site name" hint="For example: Main office, Building A.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Access notes">
            <Textarea
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              placeholder="Gate codes, where to park, who to ask for"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Save site
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
