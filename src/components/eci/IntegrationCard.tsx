import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "./primitives";
import type { SyncState } from "@/lib/eci/types";

export interface IntegrationDef {
  name: string;
  purpose: string;
  state: SyncState;
  lastSync: string;
}

export function IntegrationCard({
  integration,
  onRetry,
}: {
  integration: IntegrationDef;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { name, purpose, state, lastSync } = integration;
  return (
    <div className="eci-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{purpose}</p>
        </div>
        <StatusBadge status={state === "Not Connected" ? "Pending" : state} />
      </div>
      <p className="text-xs text-muted-foreground">Last synchronized: {lastSync}</p>
      <div className="flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View integration details
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>
                Simulated integration state for this prototype. No live connection is made.
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Connection state</dt>
                <dd>{state}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Last synchronized</dt>
                <dd>{lastSync}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Endpoint</dt>
                <dd className="font-mono text-xs">https://placeholder.eci.local/{name.toLowerCase().replace(/\s+/g, "-")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Records in scope</dt>
                <dd>{purpose}</dd>
              </div>
            </dl>
          </DialogContent>
        </Dialog>
        {state === "Failed" && onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
