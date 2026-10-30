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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  // Accounts are created by an administrator; there is deliberately no
  // self-service sign-up path here.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      void navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error("Couldn't sign in", {
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

          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your ECI email and password.
              </p>
            </div>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait\u2026" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Need an account? Ask your ECI administrator to create one for you.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
