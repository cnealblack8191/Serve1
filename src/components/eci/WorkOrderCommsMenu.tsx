import { useState } from "react";
import { MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageComposer, type ComposerLink } from "./MessageComposer";
import { PURPOSE_LABELS, templateFor, type CommPurpose } from "@/lib/comms/types";
import { useEci } from "@/lib/eci/store";

const WO_PURPOSES: CommPurpose[] = [
  "work_order_scheduling",
  "work_order_confirmation",
  "work_order_technician",
  "work_order_completion",
  "work_order_followup",
];

/**
 * Work-order communications. Every option opens the same shared composer with
 * different default wording; the email is filed against the customer, the job
 * and the work order by the one communications service.
 */
export function WorkOrderCommsMenu({
  workOrderId,
  number,
  jobId,
  customer,
  technician,
  scheduled,
  defaultTo,
}: {
  workOrderId: string;
  number: string;
  jobId: string;
  customer: string;
  technician?: string | undefined;
  scheduled?: string | undefined;
  defaultTo?: string | undefined;
}) {
  const { currentUser } = useEci();
  const [purpose, setPurpose] = useState<CommPurpose | null>(null);

  const tpl = templateFor(purpose ?? "general", {
    name: number,
    customer,
    ...(technician ? { technician } : {}),
    ...(scheduled ? { scheduled } : {}),
    sender: currentUser,
  });

  const links: ComposerLink[] = [
    { recordType: "customer", recordId: customer },
    { recordType: "job", recordId: jobId },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MailPlus className="mr-2 size-4" /> Communicate
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {WO_PURPOSES.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => setPurpose(p)}>
              {PURPOSE_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <MessageComposer
        open={purpose !== null}
        onOpenChange={(o) => !o && setPurpose(null)}
        title={`${PURPOSE_LABELS[purpose ?? "general"]} — work order ${number}`}
        target={{
          recordType: "work_order",
          recordId: workOrderId,
          name: number,
          customer,
        }}
        purpose={purpose ?? "general"}
        extraLinks={links}
        defaultTo={defaultTo}
        defaultSubject={tpl.subject}
        defaultBody={tpl.body}
      />
    </>
  );
}
