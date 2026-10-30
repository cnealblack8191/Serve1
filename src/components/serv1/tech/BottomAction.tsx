import type { ReactNode } from "react";

import { useCurrentUser } from "@/data";
import { cn } from "@/lib/utils";

/**
 * Holds the one primary button of a tech screen, always at the bottom (SPEC.md section 13).
 * On the tech phone layout it sits just above the bottom tabs; for office users who open
 * the tech screens it stays at the bottom of the content.
 */
export function BottomAction({ children }: { children: ReactNode }) {
  const { data: me } = useCurrentUser();
  const phone = me?.role === "Tech";
  return (
    <>
      {phone ? <div className="h-20" aria-hidden /> : null}
      <div
        className={cn(
          "z-10 border-t border-border bg-background/95 p-3 backdrop-blur",
          phone ? "fixed inset-x-0" : "sticky bottom-0 -mx-4 lg:-mx-8",
        )}
        style={phone ? { bottom: "calc(3.5rem + 1px + env(safe-area-inset-bottom))" } : undefined}
      >
        {children}
      </div>
    </>
  );
}

/** Classes for the big primary button inside BottomAction. */
export const PRIMARY_BUTTON = "h-14 w-full text-lg font-semibold";
