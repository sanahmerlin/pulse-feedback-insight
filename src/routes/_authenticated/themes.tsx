import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { feedbackQuery, sentimentTone, themesQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

import { useState } from "react";

export const Route = createFileRoute("/_authenticated/themes")({
  head: () => ({
    meta: [
      { title: "Themes — FeedbackPulse" },
      { name: "description", content: "Every theme detected in your customer feedback, with mention counts." },
      { property: "og:title", content: "Themes — FeedbackPulse" },
      { property: "og:description", content: "Every theme detected in your customer feedback, with mention counts." },
    ],
  }),
  component: ThemesPage,
});

function ThemesPage() {
  const [category] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("feedback_pulse_category") || null : null
  );
  const themes = useQuery(themesQuery(category));
  const feedback = useQuery(feedbackQuery(category));
  const total = feedback.data?.length ?? 0;

  return (
    <AppShell
      title="Themes"
      description="Similar feedback grouped together, most mentioned first."
    >
      {(themes.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No themes yet. Add feedback and run an analysis to see what customers keep bringing up.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/upload">Add feedback</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {(themes.data ?? []).map((theme) => (
            <Link
              key={theme.id}
              to="/theme/$themeId"
              params={{ themeId: theme.id }}
              className="flex items-center gap-6 p-5 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{theme.name}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
                      sentimentTone[theme.sentiment] ?? sentimentTone["neutral"]
                    }`}
                  >
                    {theme.sentiment}
                  </span>
                </div>
                {theme.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{theme.description}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold tabular-nums">{theme.mention_count}</p>
                <p className="text-xs text-muted-foreground">
                  {total > 0 ? `${Math.round((theme.mention_count / total) * 100)}% of all` : "mentions"}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
