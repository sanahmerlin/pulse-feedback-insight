import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      try {
        // Check for error in query params (e.g. access_denied from OAuth)
        const urlParams = new URLSearchParams(window.location.search);
        const errorParam = urlParams.get("error");
        const errorDesc = urlParams.get("error_description");
        if (errorParam) {
          throw new Error(errorDesc || errorParam);
        }

        // 1. Check for PKCE code in query params
        const code = urlParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data?.session && isMounted) {
            navigate({ to: "/dashboard", replace: true });
            return;
          }
        }

        // 2. Check for hash tokens (implicit flow)
        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            if (data?.session && isMounted) {
              navigate({ to: "/dashboard", replace: true });
              return;
            }
          }
        }

        // 3. Fallback: check existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session && isMounted) {
          navigate({ to: "/dashboard", replace: true });
        } else if (isMounted) {
          navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        if (isMounted) {
          toast.error(err instanceof Error ? err.message : "Authentication failed");
          navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        }
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
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
