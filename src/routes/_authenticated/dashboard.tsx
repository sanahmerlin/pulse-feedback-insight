import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { digestsQuery, feedbackQuery, themesQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FeedbackPulse" },
      { name: "description", content: "Your latest AI feedback digest, urgent issues and sentiment trend." },
      { property: "og:title", content: "Dashboard — FeedbackPulse" },
      { property: "og:description", content: "Your latest AI feedback digest, urgent issues and sentiment trend." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    () => sessionStorage.getItem("feedback_pulse_category") || null
  );
  const [selectedDateRange, setSelectedDateRange] = useState<string>(
    () => sessionStorage.getItem("feedback_pulse_date_range") || "all"
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
  const urgent = items.filter((i) => i.urgency === "high");

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
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-primary cursor-pointer hover:bg-accent/30"
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
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-primary cursor-pointer hover:bg-accent/30"
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
      {urgent.length > 0 && (
        <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                {urgent.length} item{urgent.length > 1 ? "s" : ""} need urgent attention
              </p>
              <ul className="mt-2 space-y-1.5">
                {urgent.slice(0, 3).map((item) => (
                  <li key={item.id} className="truncate text-sm text-foreground/80">
                    “{item.content}”
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
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
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickMargin={8} />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} width={24} tickMargin={8} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "12px", paddingBottom: "10px" }} />
                    <Area name="Positive" activeDot={{ r: 4, strokeWidth: 0 }} type="monotone" dataKey="positive" stroke="var(--success)" fill="var(--success)" fillOpacity={0.14} />
                    <Area name="Negative" activeDot={{ r: 4, strokeWidth: 0 }} type="monotone" dataKey="negative" stroke="var(--destructive)" fill="var(--destructive)" fillOpacity={0.12} />
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
