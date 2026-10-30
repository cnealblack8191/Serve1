import { toast } from "sonner";

import { EmptyState } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { useCreateInvoiceFromJob, type Customer, type Job } from "@/data";
import { useNavigate } from "@tanstack/react-router";

export function ReadyToInvoice({
  jobs,
  customers,
  canCreate,
}: {
  jobs: Job[];
  customers: Customer[];
  canCreate: boolean;
}) {
  const create = useCreateInvoiceFromJob();
  const navigate = useNavigate();
  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? "Unknown customer";

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="Nothing to invoice"
        hint="Completed jobs without an invoice show up here."
      />
    );
  }
  return (
    <ul className="eci-card divide-y divide-border">
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">
              {job.jobNumber} · {customerName(job.customerId)}
            </p>
            <p className="truncate text-sm text-muted-foreground">{job.description}</p>
          </div>
          {canCreate ? (
            <Button
              disabled={create.isPending}
              onClick={() =>
                create.mutate(job, {
                  onSuccess: (inv) => {
                    toast.success(`${inv.invoiceNumber} created`);
                    void navigate({ to: "/invoices/$id", params: { id: inv.id } });
                  },
                  onError: () => toast.error("Could not create the invoice. Please try again."),
                })
              }
            >
              Create invoice
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Office creates invoices</span>
          )}
        </li>
      ))}
    </ul>
  );
}
