import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        // If not authenticated, redirect to signin
        navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold animate-pulse">Completing sign-in...</h2>
        <p className="mt-2 text-sm text-muted-foreground">Please wait while we redirect you.</p>
      </div>
    </div>
  );
}
