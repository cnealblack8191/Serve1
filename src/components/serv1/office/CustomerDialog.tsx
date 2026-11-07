import { Link } from "@tanstack/react-router";
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
import { useCustomerMutations, useCustomers, type Customer } from "@/data";

import { possibleDuplicates } from "./duplicates";

/**
 * Add a customer (also quick-add on New Job), or edit one when `customer` is given.
 * Warns when the name, phone or email matches an existing customer; the office can still save.
 */
export function CustomerDialog({
  open,
  onOpenChange,
  onSaved,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (customer: Customer) => void;
  customer?: Customer | null;
}) {
  const { create, update } = useCustomerMutations();
  const all = useCustomers();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const editing = !!customer;

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setEmail(customer?.email ?? "");
    setBillingAddress(customer?.billingAddress ?? "");
    setNotes(customer?.notes ?? "");
    setError("");
  }, [open, customer]);

  const dupes = name.trim()
    ? possibleDuplicates(
        { name, phone: phone || null, email: email || null },
        all.data ?? [],
        customer?.id,
      )
    : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // dialogs render in a portal; keep the submit from reaching a surrounding form
    if (!name.trim()) return setError("Enter the customer's name.");
    const fields = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      billingAddress: billingAddress.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      const saved = customer
        ? await update.mutateAsync({ id: customer.id, patch: fields })
        : await create.mutateAsync(fields);
      onOpenChange(false);
      onSaved?.(saved);
    } catch {
      setError("Couldn't save the customer. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Change the details and save."
                : "Only the name is required. You can add sites next."}
            </DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Billing address">
            <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
          </Field>
          {editing ? (
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          ) : null}
          {dupes.length ? (
            <div
              role="alert"
              className="rounded-md border border-orange-600 bg-orange-50 p-3 text-sm text-orange-950 dark:bg-orange-950 dark:text-orange-50"
            >
              <p className="font-medium">This may already be a customer:</p>
              <ul className="mt-1 list-disc pl-5">
                {dupes.map((d) => (
                  <li key={d.customer.id}>
                    <Link
                      to="/customers/$id"
                      params={{ id: d.customer.id }}
                      className="underline"
                      onClick={() => onOpenChange(false)}
                    >
                      {d.customer.name}
                    </Link>{" "}
                    ({d.why})
                  </li>
                ))}
              </ul>
              <p className="mt-1">You can still save if it is a different customer.</p>
            </div>
          ) : null}
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
              {dupes.length ? "Save anyway" : editing ? "Save changes" : "Save customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
