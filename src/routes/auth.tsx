import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "signup" ? "signup" : "signin",
  }),
  head: () => ({
    meta: [
      { title: "Sign in — FeedbackPulse" },
      { name: "description", content: "Sign in to FeedbackPulse to analyze your customer feedback with AI." },
      { property: "og:title", content: "Sign in — FeedbackPulse" },
      { property: "og:description", content: "Sign in to FeedbackPulse to analyze your customer feedback with AI." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode } = useSearch({ from: "/auth" });
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth/reset",
        });
        if (error) throw error;
        setResetSent(true);
        return;
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });
    if (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold">
          <Logo className="size-4 text-primary" />
          FeedbackPulse
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          {sent ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to {email}. Click it to activate your account.
              </p>
            </div>
          ) : resetSent ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a password reset link to {email}. Click it to choose a new password.
              </p>
              <button
                type="button"
                onClick={() => {
                  setResetSent(false);
                  setIsForgotPassword(false);
                }}
                className="mt-6 w-full text-center text-sm text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : isForgotPassword ? (
            <>
              <h1 className="text-lg font-semibold">Reset your password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email address and we'll send you a password reset link.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending link…" : "Send reset link"}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSignUp
                  ? "Start understanding your customers in minutes."
                  : "Sign in to see your latest digest."}
              </p>

              <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle}>
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(true)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
                </Button>
              </form>

              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
