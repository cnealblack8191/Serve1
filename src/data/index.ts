/**
 * src/data — the only place that talks to the backend (AGENTS.md).
 *
 * Screens import from "@/data" and nothing else backend-related:
 *   - configureBackend()          called once in main.tsx
 *   - auth: signIn, signOut, completeNewPassword, getCurrentUser
 *   - hooks: useCurrentUser, useCustomers, useSites, useJobs, useJob, useUsers,
 *            useAttachments, useSignatures, useInvoices, useMutation helpers
 *   - files: uploadJobPhoto, uploadSignature, uploadInvoicePdf, fileUrl
 *   - types: everything in ./types
 */
import { backend, setBackend } from "./backend";
import { createAmplifyBackend } from "./amplify";
import { createLocalBackend } from "./local";
import type { AuthUser, SignInResult } from "./types";

export * from "./types";
export * from "./hooks";
export * from "./files";
export * from "./billing";
export * from "./numbers";
export * from "./tech";
export { backendKind, onDataChange } from "./hooks";

/**
 * Picks the backend. `amplify_outputs.json` is written by `npx ampx sandbox`
 * (or by Amplify Hosting at build time) and is git-ignored. When it is absent
 * the app runs on the local demo store so it can be developed and tested
 * without AWS credentials.
 */
export function configureBackend(): "amplify" | "local" {
  const outputs = import.meta.glob("/amplify_outputs.json", {
    eager: true,
    import: "default",
  }) as Record<string, object>;
  const file = Object.values(outputs)[0];
  if (file) {
    setBackend(createAmplifyBackend(file));
    return "amplify";
  }
  setBackend(createLocalBackend());
  return "local";
}

// ---- auth -----------------------------------------------------------------
export const signIn = (email: string, password: string): Promise<SignInResult> =>
  backend().auth.signIn(email, password);
export const completeNewPassword = (newPassword: string): Promise<SignInResult> =>
  backend().auth.completeNewPassword(newPassword);
export const signOut = (): Promise<void> => backend().auth.signOut();
export const getCurrentUser = (): Promise<AuthUser | null> => backend().auth.currentUser();

// ---- repos (for non-hook code such as loaders and tests) -------------------
export const data = {
  get users() {
    return backend().users;
  },
  get customers() {
    return backend().customers;
  },
  get sites() {
    return backend().sites;
  },
  get jobs() {
    return backend().jobs;
  },
  get attachments() {
    return backend().attachments;
  },
  get signatures() {
    return backend().signatures;
  },
  get invoices() {
    return backend().invoices;
  },
};
