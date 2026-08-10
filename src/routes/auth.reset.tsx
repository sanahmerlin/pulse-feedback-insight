import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/reset")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        // Manually parse tokens from URL hash if they are present
        const hash = window.location.hash;
        if (hash) {
          // Remove the leading '#'
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session) {
          setCheckingSession(false);
        } else {
          toast.error("Invalid or expired password reset session.");
          navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }
      } catch (err) {
        console.error("Session verification error:", err);
        if (isMounted) {
          toast.error("An error occurred verifying your session.");
          navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }
      }
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Password reset successfully. Welcome back!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <div className="text-center">
          <h2 className="text-lg font-semibold animate-pulse">Verifying reset session...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary" />
          FeedbackPulse
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-lg font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please enter your new password below.
          </p>

          <form onSubmit={handleReset} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating password..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
