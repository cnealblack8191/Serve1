import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import eciLogo from "@/assets/eci-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — ECI Operations" },
      {
        name: "description",
        content: "Sign in to the Electrical Contractor Incorporated operations platform.",
      },
      { property: "og:title", content: "Sign in — ECI Operations" },
      {
        property: "og:description",
        content: "Sign in to the Electrical Contractor Incorporated operations platform.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      void navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(mode === "signup" ? "Couldn't create account" : "Couldn't sign in", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-eci-navy p-10 text-zinc-100 lg:flex">
        <div className="flex flex-col items-center text-center">
          <img src={eciLogo.url} alt="ECI logo" width={128} height={128} className="size-32 rounded-full" />
          <span className="mt-4 text-2xl font-semibold tracking-tight">Electrical Contractor Inc.</span>
          <span className="mt-1 text-sm uppercase tracking-[0.3em] text-zinc-400">Serve One</span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Operations platform</p>
          <h1 className="mt-2 max-w-md text-3xl font-semibold tracking-tight">
            Opportunities to invoices, office to field — one shared record.
          </h1>
          <p className="mt-4 max-w-md text-sm text-zinc-400">
            Sign in with your ECI account. Your role controls which boards, bids and jobs you can see.
          </p>
        </div>
        <p className="text-xs text-zinc-500">8141 Technology Dr, Covington, GA 30014 · (770) 788-8082</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img src={eciLogo.url} alt="ECI logo" width={112} height={112} className="size-28 rounded-full" />
            <span className="mt-4 text-xl font-semibold tracking-tight">Electrical Contractor Inc.</span>
            <span className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">Serve One</span>
          </div>

          {checkEmail ? (
            <div className="rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                Open it to finish creating your account, then come back and sign in.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setCheckEmail(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {mode === "signin" ? "Sign in" : "Create your account"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "signin"
                    ? "Use your ECI email and password."
                    : "Use your ECI email. Your role is assigned from the team roster."}
                </p>
              </div>
              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
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
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-eci-copper hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
