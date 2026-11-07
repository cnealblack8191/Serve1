import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** "Are you sure?" after a drop, so an accidental drag doesn't move a job (SPEC.md 11). */
export function ConfirmDropDialog({
  message,
  warning,
  onConfirm,
  onCancel,
}: {
  message: string | null;
  /** A double-booking warning: the dialog always asks when there is one. */
  warning?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={!!message} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{warning ? "Double booking" : "Schedule this job?"}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
          {warning ? (
            <p
              role="alert"
              className="rounded-md border border-orange-600 bg-orange-50 p-3 text-sm text-orange-950 dark:bg-orange-950 dark:text-orange-50"
            >
              {warning}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {warning ? "Schedule anyway" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
