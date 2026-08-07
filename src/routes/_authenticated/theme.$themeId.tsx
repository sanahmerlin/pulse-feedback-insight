import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { feedbackQuery, sentimentTone, themesQuery } from "@/lib/queries";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/theme/$themeId")({
  head: () => ({
    meta: [
      { title: "Theme detail — FeedbackPulse" },
      { name: "description", content: "Read the actual customer quotes behind a detected feedback theme." },
      { property: "og:title", content: "Theme detail — FeedbackPulse" },
      { property: "og:description", content: "Read the actual customer quotes behind a detected feedback theme." },
    ],
  }),
  component: ThemeDetail,
});

function ThemeDetail() {
  const { themeId } = Route.useParams();
  const themes = useQuery(themesQuery);
  const feedback = useQuery(feedbackQuery);

  const theme = (themes.data ?? []).find((t) => t.id === themeId);
  const quotes = (feedback.data ?? []).filter((f) => f.theme_id === themeId);

  return (
    <AppShell
      title={theme?.name ?? "Theme"}
      description={theme?.description ?? "Feedback grouped under this theme."}
    >
      <Link
        to="/themes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All themes
      </Link>

      <div className="space-y-3">
        {quotes.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-border bg-card p-5 shadow-card"
          >
            <p className="text-sm leading-relaxed text-foreground/90">“{item.content}”</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full border px-2 py-0.5 capitalize ${
                  sentimentTone[item.sentiment ?? "neutral"] ?? sentimentTone["neutral"]
                }`}
              >
                {item.sentiment ?? "neutral"}
              </span>
              {item.topic ? (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 capitalize text-muted-foreground">
                  {item.topic}
                </span>
              ) : null}
              {item.urgency === "high" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-destructive">
                  <AlertTriangle className="size-3" /> Urgent
                </span>
              ) : null}
              <span className="ml-auto text-muted-foreground">
                {new Date(item.received_at).toLocaleDateString()}
              </span>
            </div>
            {item.urgency_reason ? (
              <p className="mt-2 text-xs text-destructive">{item.urgency_reason}</p>
            ) : null}
          </article>
        ))}
        {quotes.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No feedback found for this theme.
          </div>
        )}
      </div>
    </AppShell>
  );
}
