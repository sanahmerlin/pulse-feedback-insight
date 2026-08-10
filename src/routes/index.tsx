import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FeedbackPulse — Understand your customer feedback in 2 minutes" },
      {
        name: "description",
        content:
          "Paste or upload customer reviews, emails and survey answers. FeedbackPulse uses AI to write a plain-English weekly digest of what customers are saying.",
      },
      { property: "og:title", content: "FeedbackPulse — Understand your customer feedback in 2 minutes" },
      {
        property: "og:description",
        content:
          "AI-written weekly digests of your customer feedback: top complaints, top praises and one clear next action.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Sparkles,
    title: "A digest, not a dashboard maze",
    body: "Every analysis produces a short written summary: what's trending, what customers love, and one concrete next action.",
  },
  {
    icon: Layers,
    title: "Themes with the receipts",
    body: "Similar feedback is grouped automatically. Click any theme to read the real customer quotes behind it.",
  },
  {
    icon: AlertTriangle,
    title: "Urgent issues surface first",
    body: "Angry customers and urgent complaints get flagged and pinned to the top of your dashboard.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we arrived here via a password reset/recovery link fallback
    const hash = window.location.hash;
    if (hash && (hash.includes("type=recovery") || hash.includes("access_token"))) {
      navigate({ to: "/auth/reset", search: { mode: "signin" }, hash, replace: true });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" />
            FeedbackPulse
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-24 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Customer feedback, decoded
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Know what your customers are saying — in under two minutes
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            Paste reviews, emails, survey answers or DMs. FeedbackPulse tags every item, groups it
            into themes, and writes you a plain-English weekly summary.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 pb-24 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-4 font-medium">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <p className="text-center text-xs text-muted-foreground">
          FeedbackPulse · Your feedback stays private to your account.
        </p>
      </footer>
    </div>
  );
}
