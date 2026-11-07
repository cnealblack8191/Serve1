import { redirect } from "@tanstack/react-router";

import type { Role } from "@/data";

/** Who may open which screen (SPEC.md section 2). One list so every route checks the same way. */
export const OFFICE_VIEW: Role[] = ["Admin", "Office", "Owner"]; // read office screens
export const OFFICE_EDIT: Role[] = ["Admin", "Office"]; // change office records
export const TECH_ONLY: Role[] = ["Tech"]; // the tech's own job screens
export const ADMIN_ONLY: Role[] = ["Admin"]; // users and settings

/** Each role's home screen. */
export const homeFor = (role: Role) => (role === "Tech" ? "/tech" : "/");

/**
 * Use in a route's beforeLoad: sends anyone whose role is not allowed to their own home screen.
 * The backend still enforces access; this keeps people off screens they cannot use.
 */
export function requireRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) throw redirect({ to: homeFor(role), replace: true });
}

/** Dollar amounts are shown to office and owner roles only. */
export const canSeeMoney = (role: Role | undefined | null) =>
  role === "Admin" || role === "Office" || role === "Owner";
