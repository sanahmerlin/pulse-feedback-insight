import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { digestsQuery, feedbackQuery, themesQuery, sentimentTone, type FeedbackItem } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReplyPanel } from "@/components/ReplyPanel";
import {
  AlertTriangle,
  ArrowRight,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Clock,
  Sliders,
  ChevronRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FeedbackPulse" },
      { name: "description", content: "Your latest AI feedback digest, urgent issues, reply workflow and sentiment trend." },
      { property: "og:title", content: "Dashboard — FeedbackPulse" },
      { property: "og:description", content: "Your latest AI feedback digest, urgent issues, reply workflow and sentiment trend." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    () => (typeof window !== "undefined" ? sessionStorage.getItem("feedback_pulse_category") : null) || null
  );
  const [selectedDateRange, setSelectedDateRange] = useState<string>(
    () => (typeof window !== "undefined" ? sessionStorage.getItem("feedback_pulse_date_range") : null) || "all"
  );
  const days = selectedDateRange === "all" ? null : parseInt(selectedDateRange, 10);

  const digests = useQuery(digestsQuery(selectedCategory, days));
  const feedback = useQuery(feedbackQuery(selectedCategory, days));
  const themes = useQuery(themesQuery(selectedCategory, days));

  // Query all feedback to dynamically extract unique categories for the filter
  const allFeedback = useQuery(feedbackQuery("all", null));
  const allItems = allFeedback.data ?? [];
  const categories = Array.from(
    new Set(allItems.map((i) => i.category).filter(Boolean))
  ) as string[];

  const digest = digests.data?.[0];
  const items = feedback.data ?? [];

  // Reply workflow modal state
  const [selectedReview, setSelectedReview] = useState<FeedbackItem | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [replyFilter, setReplyFilter] = useState<"all" | "needs_reply" | "drafted" | "replied">("all");

  // Helper to determine accurate status checking item + localStorage cache
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

  const urgent = items.filter((i) => i.urgency === "high");
  const flagged = items.filter((i) => i.urgency === "high" || i.sentiment === "negative");

  // Counter of unanswered flagged reviews
  const needsReplyCount = useMemo(() => {
    return flagged.filter((i) => getItemStatus(i) === "needs_reply").length;
  }, [items]);

  const draftedCount = useMemo(() => {
    return items.filter((i) => getItemStatus(i) === "drafted").length;
  }, [items]);

  const repliedCount = useMemo(() => {
    return items.filter((i) => getItemStatus(i) === "replied").length;
  }, [items]);

  // Filtered reviews list for the Reply Workflow section
  const actionableReviews = useMemo(() => {
    return items.filter((item) => {
      const status = getItemStatus(item);
      if (replyFilter === "needs_reply") return status === "needs_reply" && (item.urgency === "high" || item.sentiment === "negative");
      if (replyFilter === "drafted") return status === "drafted";
      if (replyFilter === "replied") return status === "replied";
      return true;
    });
  }, [items, replyFilter]);

  const trend = buildTrend(items);

  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    if (cat) {
      sessionStorage.setItem("feedback_pulse_category", cat);
    } else {
      sessionStorage.removeItem("feedback_pulse_category");
    }
  };

  const handleDateRangeChange = (range: string) => {
    setSelectedDateRange(range);
    sessionStorage.setItem("feedback_pulse_date_range", range);
  };

  const openReplyModal = (item: FeedbackItem) => {
    setSelectedReview(item);
    setIsReplyOpen(true);
  };

  return (
    <AppShell
      title="Dashboard"
      description="What your customers are saying right now."
      action={
        <div className="flex items-center gap-3">
          {categories.length > 0 && (
            <select
              value={selectedCategory || "all"}
              onChange={(e) => {
                const val = e.target.value;
                handleCategoryChange(val === "all" ? null : val);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer hover:bg-accent/30"
            >
              <option value="all">All Projects</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
          <select
            value={selectedDateRange}
            onChange={(e) => handleDateRangeChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer hover:bg-accent/30"
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <Button asChild>
            <Link to="/upload">
              <Sparkles className="size-4" />
              Add feedback
            </Link>
          </Button>
        </div>
      }
    >
      {/* 5. Top Bar Counter for Unanswered Flagged Reviews */}
      {flagged.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-lg ${
              needsReplyCount > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }`}>
              <MessageSquare className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {needsReplyCount > 0 ? (
                    <span>
                      <strong className="text-amber-600 dark:text-amber-400 font-bold">{needsReplyCount}</strong> flagged review{needsReplyCount > 1 ? "s" : ""} need reply
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      All flagged reviews answered!
                    </span>
                  )}
                </h3>
                {needsReplyCount > 0 && (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
                    Action required
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {draftedCount} drafted · {repliedCount} marked replied · {flagged.length} total negative or urgent
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={replyFilter === "needs_reply" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setReplyFilter("needs_reply");
                const section = document.getElementById("actionable-reviews");
                if (section) section.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-xs gap-1.5"
            >
              <Clock className="size-3.5" />
              {replyFilter === "needs_reply" ? "Viewing Needs Reply" : "Filter Needs Reply"}
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <Link to="/settings">
                <Sliders className="size-3.5 mr-1" /> Reply Settings
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Urgent Attention Alert Box with Direct "Draft reply" buttons */}
      {urgent.length > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/25 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="w-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-destructive">
                  {urgent.length} review{urgent.length > 1 ? "s" : ""} need urgent attention
                </p>
                <span className="text-xs text-destructive/80 font-medium">Priority triage</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Customers reporting severe bugs, cancellation threats, or acute dissatisfaction.
              </p>

              <div className="space-y-2.5">
                {urgent.slice(0, 3).map((item) => {
                  const status = getItemStatus(item);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-background/80 p-3 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground/90 font-medium line-clamp-2">
                          “{item.content}”
                        </p>
                        {item.urgency_reason && (
                          <p className="mt-1 text-xs text-destructive">
                            {item.urgency_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
                          variant={status === "replied" ? "outline" : "default"}
                        >
                          <Sparkles className="size-3.5" />
                          {status === "replied" ? "View reply" : status === "drafted" ? "Edit draft" : "Draft reply"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Digest and Charts */}
      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Latest digest
          </p>
          {digest ? (
            <div className="mt-3">
              <h2 className="text-lg font-semibold">{digest.headline}</h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">{digest.summary}</p>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <List title="Top complaints" items={digest.top_complaints} tone="text-destructive" />
                <List title="Top praises" items={digest.top_praises} tone="text-success" />
              </div>

              {digest.next_action ? (
                <div className="mt-6 rounded-lg border border-border bg-accent/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent-foreground">
                    Suggested next action
                  </p>
                  <p className="mt-1.5 text-sm text-foreground/85">{digest.next_action}</p>
                </div>
              ) : null}

              <p className="mt-5 text-xs text-muted-foreground">
                Based on {digest.item_count} feedback items ·{" "}
                {new Date(digest.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No digest yet. Add some feedback and run an analysis to get your first summary.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/upload">Get started</Link>
              </Button>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sentiment over time
            </p>
            {trend.length > 1 ? (
              <div className="mt-4 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} width={24} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="positive" stroke="var(--success)" fill="var(--success)" fillOpacity={0.14} />
                    <Area type="monotone" dataKey="negative" stroke="var(--destructive)" fill="var(--destructive)" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Trend appears once you have feedback across a few days.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Top themes
            </p>
            <ul className="mt-4 space-y-3">
              {(themes.data ?? []).slice(0, 5).map((theme) => (
                <li key={theme.id} className="flex items-center justify-between gap-3">
                  <Link
                    to="/theme/$themeId"
                    params={{ themeId: theme.id }}
                    className="truncate text-sm hover:text-primary"
                  >
                    {theme.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{theme.mention_count}</span>
                </li>
              ))}
              {(themes.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No themes detected yet.</li>
              )}
            </ul>
            <Link
              to="/themes"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              All themes <ArrowRight className="size-3.5" />
            </Link>
          </section>
        </div>
      </div>

      {/* Actionable Reviews & Replies Section */}
      <section id="actionable-reviews" className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Review Reply Workflow</h2>
              <Badge variant="outline" className="text-xs font-normal">
                {actionableReviews.length} shown
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Draft empathetic, on-brand responses in 1-click and track answering status.
            </p>
          </div>

          {/* Filter options */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={replyFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setReplyFilter("all")}
              className="h-8 text-xs rounded-full"
            >
              All ({items.length})
            </Button>
            <Button
              variant={replyFilter === "needs_reply" ? "default" : "outline"}
              size="sm"
              onClick={() => setReplyFilter("needs_reply")}
              className="h-8 text-xs rounded-full"
            >
              Needs Reply ({needsReplyCount})
            </Button>
            <Button
              variant={replyFilter === "drafted" ? "default" : "outline"}
              size="sm"
              onClick={() => setReplyFilter("drafted")}
              className="h-8 text-xs rounded-full"
            >
              Drafted ({draftedCount})
            </Button>
            <Button
              variant={replyFilter === "replied" ? "default" : "outline"}
              size="sm"
              onClick={() => setReplyFilter("replied")}
              className="h-8 text-xs rounded-full"
            >
              Replied ({repliedCount})
            </Button>
          </div>
        </div>

        {/* Reviews Cards List */}
        <div className="space-y-3.5">
          {actionableReviews.slice(0, 15).map((item) => {
            const status = getItemStatus(item);
            const savedDraft = getItemDraft(item);

            return (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground/90 font-medium">
                      “{item.content}”
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full border px-2 py-0.5 capitalize text-[11px] ${
                          sentimentTone[item.sentiment ?? "neutral"] ?? sentimentTone["neutral"]
                        }`}
                      >
                        {item.sentiment ?? "neutral"}
                      </span>
                      {item.topic && (
                        <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 capitalize text-muted-foreground text-[11px]">
                          {item.topic}
                        </span>
                      )}
                      {item.urgency === "high" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-destructive text-[11px]">
                          <AlertTriangle className="size-3" /> Urgent
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {new Date(item.received_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    {/* If a draft is already saved, show quick teaser */}
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
              </div>
            );
          })}

          {actionableReviews.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No reviews matching this filter.
            </div>
          )}
        </div>
      </section>

      {/* Global Reply Modal Panel */}
      <ReplyPanel
        item={selectedReview}
        isOpen={isReplyOpen}
        onClose={() => setIsReplyOpen(false)}
      />
    </AppShell>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className={`text-xs font-medium uppercase tracking-wider ${tone}`}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {(items ?? []).map((item, i) => (
          <li key={i} className="text-sm text-foreground/80">
            {item}
          </li>
        ))}
        {(items ?? []).length === 0 && <li className="text-sm text-muted-foreground">None noted.</li>}
      </ul>
    </div>
  );
}

function buildTrend(items: Array<{ received_at: string; sentiment: string | null }>) {
  const byDay = new Map<string, { date: string; positive: number; negative: number; neutral: number }>();
  for (const item of items) {
    const key = item.received_at.slice(0, 10);
    const bucket = byDay.get(key) ?? { date: key.slice(5), positive: 0, negative: 0, neutral: 0 };
    if (item.sentiment === "positive") bucket.positive += 1;
    else if (item.sentiment === "negative") bucket.negative += 1;
    else bucket.neutral += 1;
    byDay.set(key, bucket);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}
