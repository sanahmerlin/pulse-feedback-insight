import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { digestsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Digest history — FeedbackPulse" },
      { name: "description", content: "Every weekly customer feedback digest generated for your business." },
      { property: "og:title", content: "Digest history — FeedbackPulse" },
      { property: "og:description", content: "Every weekly customer feedback digest generated for your business." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const digests = useQuery(digestsQuery);
  const list = digests.data ?? [];

  return (
    <AppShell title="History" description="Every digest we've written for you, newest first.">
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No digests yet.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/upload">Add feedback</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((digest) => (
            <article key={digest.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{digest.headline}</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date(digest.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {digest.item_count} items
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">{digest.summary}</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-destructive">
                    Top complaints
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground/80">
                    {digest.top_complaints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-success">
                    Top praises
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-foreground/80">
                    {digest.top_praises.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {digest.next_action ? (
                <p className="mt-5 rounded-lg border border-border bg-accent/60 p-4 text-sm text-foreground/85">
                  <span className="font-medium">Next action: </span>
                  {digest.next_action}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
