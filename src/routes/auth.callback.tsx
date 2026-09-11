import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // getSession() will automatically parse the hash fragment from the URL and establish the session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Auth callback error:", error);
        navigate({ to: "/auth/", search: { mode: "signin" }, replace: true });
        return;
      }
      
      if (session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        // If no session after parsing hash, redirect to login
        navigate({ to: "/auth/", search: { mode: "signin" }, replace: true });
      }
    });
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
