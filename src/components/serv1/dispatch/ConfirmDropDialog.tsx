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
  onConfirm,
  onCancel,
}: {
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={!!message} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Schedule this job?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
