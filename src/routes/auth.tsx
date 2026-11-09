import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backendKind, completeNewPassword, getCurrentUser, signIn } from "@/data";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"signIn" | "newPassword">("signIn");
  const [busy, setBusy] = useState(false);
  const local = backendKind() === "local";

  useEffect(() => {
    void getCurrentUser().then((u) => {
      if (u) void navigate({ to: redirect ?? "/", replace: true });
    });
  }, [navigate, redirect]);

  const finish = () => void navigate({ to: redirect ?? "/", replace: true });

  // Accounts are created by an administrator; there is deliberately no self sign-up.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result =
        step === "signIn" ? await signIn(email, password) : await completeNewPassword(newPassword);
      if (result.kind === "done") finish();
      else if (result.kind === "newPasswordRequired") setStep("newPassword");
      else toast.error("Couldn't sign in", { description: result.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    // Option B (owner's pick, 2026-11-08): one centered card on a light ground. In version 1 the
    // live form becomes a single "Sign in with your ECI Microsoft account" button (Central);
    // the demo keeps this form (docs: the Central sign-in proposal).
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-zinc-100 px-5 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.06)]">
        <div className="flex h-1.5" aria-hidden="true">
          <div className="flex-1 bg-zinc-950 dark:bg-zinc-700" />
          <div className="flex-1 bg-eci-red" />
          <div className="flex-1 bg-zinc-950 dark:bg-zinc-700" />
        </div>
        <div className="space-y-6 px-6 pb-8 pt-9 sm:px-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src="/logo.png"
              alt="Electrical Contractor Inc. logo"
              width={64}
              height={64}
              className="size-16 rounded-full"
            />
            <div className="space-y-1">
              <h1 className="text-[28px] font-bold tracking-tight">
                {step === "signIn" ? "Sign in to Serv1" : "Set a new password"}
              </h1>
              <p className="text-[15px] text-muted-foreground">
                {step === "signIn"
                  ? "Use your username (or company email) and password."
                  : "Your account was created with a temporary password. Choose your own to continue."}
              </p>
            </div>
          </div>

          {/* Owner, 2026-11-09: the pilot holds demo data only until Serv1 joins the ECI ecosystem. */}
          <p
            role="note"
            data-testid="demo-only-notice"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Demo only. Do not enter real customer, employee or pricing information.
          </p>

          <form
            onSubmit={submit}
            className="space-y-4"
            aria-label={step === "signIn" ? "Sign in" : "Set a new password"}
          >
            {step === "signIn" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Username or email</Label>
                  <Input
                    id="email"
                    type="text"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-12 text-[15px]"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    className="h-12 text-[15px]"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    className="h-12 text-[15px]"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}
            <Button
              type="submit"
              className="h-12 w-full bg-zinc-950 text-base text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              disabled={busy}
            >
              {busy ? "Please wait…" : step === "signIn" ? "Sign in" : "Save password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Your role decides what you see. Need an account? Ask your administrator.
            </p>
            {local ? (
              <p
                className="rounded-md bg-muted p-3 text-center text-xs text-muted-foreground"
                data-testid="local-mode-note"
              >
                Demo mode (no cloud backend connected). Sign in as admin@serv1.demo,
                office@serv1.demo, owner@serv1.demo or tech1@serv1.demo with password{" "}
                <code>serv1demo</code>.
              </p>
            ) : null}
          </form>
        </div>
      </div>
      <p className="text-center text-xs uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
        Electrical Contractor Inc. · Est. 1984
        <br />
        Internal pilot
      </p>
    </div>
  );
}
