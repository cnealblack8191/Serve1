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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-eci-navy p-10 text-zinc-100 lg:flex">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Company logo"
            width={40}
            height={40}
            className="size-10 rounded-full"
          />
          <span className="text-xl font-semibold tracking-tight">Serv1</span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            Field service platform
          </p>
          <h1 className="mt-2 max-w-md text-3xl font-semibold tracking-tight">
            From the call to the invoice, office and field on one record.
          </h1>
          <p className="mt-4 max-w-md text-sm text-zinc-400">
            Sign in with your company account. Your role decides what you see.
          </p>
        </div>
        <p className="text-xs text-zinc-500">Internal pilot</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img
              src="/logo.png"
              alt="Company logo"
              width={72}
              height={72}
              className="size-18 rounded-full"
            />
            <span className="mt-3 text-xl font-semibold tracking-tight">Serv1</span>
          </div>

          <form
            onSubmit={submit}
            className="space-y-4"
            aria-label={step === "signIn" ? "Sign in" : "Set a new password"}
          >
            {step === "signIn" ? (
              <>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use your company email and password.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
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
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Set a new password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your account was created with a temporary password. Choose your own to continue.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {busy ? "Please wait…" : step === "signIn" ? "Sign in" : "Save password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Need an account? Ask your administrator to create one.
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
    </div>
  );
}
