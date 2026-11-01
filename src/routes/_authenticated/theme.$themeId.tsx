import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { feedbackQuery, sentimentTone, themesQuery, type FeedbackItem } from "@/lib/queries";
import { ArrowLeft, AlertTriangle, Sparkles, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReplyPanel } from "@/components/ReplyPanel";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/theme/$themeId")({
  head: () => ({
    meta: [
      { title: "Theme detail — FeedbackPulse" },
      { name: "description", content: "Read the actual customer quotes behind a detected feedback theme and draft replies." },
      { property: "og:title", content: "Theme detail — FeedbackPulse" },
      { property: "og:description", content: "Read the actual customer quotes behind a detected feedback theme and draft replies." },
    ],
  }),
  component: ThemeDetail,
});

function ThemeDetail() {
  const { themeId } = Route.useParams();
  const [category] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("feedback_pulse_category") || null : null
  );
  const themes = useQuery(themesQuery(category));
  const feedback = useQuery(feedbackQuery(category));

  const [selectedReview, setSelectedReview] = useState<FeedbackItem | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);

  const theme = (themes.data ?? []).find((t) => t.id === themeId);
  const quotes = (feedback.data ?? []).filter((f) => f.theme_id === themeId);

  const getItemStatus = (item: FeedbackItem): "needs_reply" | "drafted" | "replied" => {
    if (typeof window !== "undefined") {
      try {
        const local = JSON.parse(localStorage.getItem("feedback_pulse_review_replies") || "{}");
        if (local[item.id]?.status) {
          return local[item.id].status;
        }
      } catch {
        // ignore
      }
    }
    if (item.reply_status === "replied") return "replied";
    if (item.reply_status === "drafted" || item.reply_draft) return "drafted";
    return "needs_reply";
  };

  const getItemDraft = (item: FeedbackItem): string | null => {
    if (typeof window !== "undefined") {
      try {
        const local = JSON.parse(localStorage.getItem("feedback_pulse_review_replies") || "{}");
        if (local[item.id]?.draft) {
          return local[item.id].draft;
        }
      } catch {
        // ignore
      }
    }
    return item.reply_draft || null;
  };

  const openReplyModal = (item: FeedbackItem) => {
    setSelectedReview(item);
    setIsReplyOpen(true);
  };

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
        {quotes.map((item) => {
          const status = getItemStatus(item);
          const savedDraft = getItemDraft(item);

          return (
            <article
              key={item.id}
              className="rounded-xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/20"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-foreground/90 font-medium">“{item.content}”</p>
                  
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 capitalize text-[11px] ${
                        sentimentTone[item.sentiment ?? "neutral"] ?? sentimentTone["neutral"]
                      }`}
                    >
                      {item.sentiment ?? "neutral"}
                    </span>
                    {item.topic ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 capitalize text-muted-foreground text-[11px]">
                        {item.topic}
                      </span>
                    ) : null}
                    {item.urgency === "high" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-destructive text-[11px]">
                        <AlertTriangle className="size-3" /> Urgent
                      </span>
                    ) : null}
                    <span className="ml-auto text-muted-foreground text-[11px]">
                      {new Date(item.received_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.urgency_reason ? (
                    <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="size-3 shrink-0" />
                      <span>{item.urgency_reason}</span>
                    </p>
                  ) : null}

                  {savedDraft && (
                    <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/80 mr-1.5">Drafted reply:</span>
                      <span className="italic line-clamp-1">“{savedDraft}”</span>
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 pt-1 sm:pt-0">
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${
                      status === "replied"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : status === "drafted"
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {status === "replied" ? (
                      <CheckCircle2 className="size-3 mr-1 inline" />
                    ) : status === "drafted" ? (
                      <Clock className="size-3 mr-1 inline" />
                    ) : (
                      <AlertTriangle className="size-3 mr-1 inline" />
                    )}
                    {status === "replied" ? "Replied" : status === "drafted" ? "Drafted" : "Needs Reply"}
                  </Badge>

                  <Button
                    size="sm"
                    onClick={() => openReplyModal(item)}
                    className="h-8 gap-1.5 text-xs font-medium"
                    variant={status === "needs_reply" ? "default" : "outline"}
                  >
                    <Sparkles className="size-3.5" />
                    {status === "needs_reply" ? "Draft reply" : status === "drafted" ? "Edit draft" : "View reply"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
        {quotes.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No feedback found for this theme.
          </div>
        )}
      </div>

      <ReplyPanel
        item={selectedReview}
        isOpen={isReplyOpen}
        onClose={() => setIsReplyOpen(false)}
      />
    </AppShell>
  );
}
