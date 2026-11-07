import { useNavigate } from "@tanstack/react-router";
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
import { useCustomers, useSites, useWinOpportunity, type Opportunity } from "@/data";

import { SELECT_CLASS } from "./format";

/** Mark won: pick the customer (and site) once; the job is created from the opportunity. */
export function WinDialog({
  opportunity,
  open,
  onOpenChange,
}: {
  opportunity: Opportunity;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const customers = useCustomers();
  const sites = useSites();
  const win = useWinOpportunity();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(opportunity.customerId ?? "");
  const [siteId, setSiteId] = useState("");
  const mySites = (sites.data ?? []).filter((s) => s.customerId === customerId);
  const effectiveSite = siteId || (mySites.length === 1 ? mySites[0]!.id : "");

  const confirm = () =>
    win.mutate(
      { opportunityId: opportunity.id, customerId, siteId: effectiveSite || null },
      {
        onSuccess: (job) => {
          onOpenChange(false);
          void navigate({ to: "/jobs/$id", params: { id: job.id } });
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark won and create the job</DialogTitle>
          <DialogDescription>
            The job takes this opportunity&apos;s name, type and PO status. Quote, PO and work order
            numbers stay on the opportunity and show on the job page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Customer">
            <select
              className={SELECT_CLASS}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSiteId("");
              }}
            >
              <option value="">Choose a customer</option>
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
          {customerId && mySites.length > 0 ? (
            <Field label="Site">
              <select
                className={SELECT_CLASS}
                value={effectiveSite}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">No site yet</option>
                {mySites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ? `${s.name} — ${s.address}` : s.address}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {win.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not create the job. Try again.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!customerId || win.isPending}>
            {win.isPending ? "Creating job…" : "Mark won"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
