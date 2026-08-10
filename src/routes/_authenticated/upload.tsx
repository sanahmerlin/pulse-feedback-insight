import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ingestFeedback, analyzeAndDigest } from "@/lib/feedback.functions";
import { toast } from "sonner";
import { FileUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Add feedback — FeedbackPulse" },
      { name: "description", content: "Paste customer feedback or upload a CSV and let AI analyze it." },
      { property: "og:title", content: "Add feedback — FeedbackPulse" },
      { property: "og:description", content: "Paste customer feedback or upload a CSV and let AI analyze it." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ingest = useServerFn(ingestFeedback);
  const analyze = useServerFn(analyzeAndDigest);

  const [text, setText] = useState("");
  const [pending, setPending] = useState<null | "upload" | "analyze">(null);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submitItems(
    items: string[],
    source: string,
    dates?: string[],
    categories?: string[]
  ) {
    if (items.length === 0) {
      toast.error("No feedback found to analyze.");
      return;
    }
    setPending("upload");
    try {
      setStatus(`Tagging ${items.length} feedback items with AI…`);
      const result = await ingest({
        data: {
          items: items.slice(0, 200),
          source,
          dates: dates?.slice(0, 200),
          categories: categories?.slice(0, 200),
        },
      });

      setPending("analyze");
      
      // Generate separate digests and themes for each unique category uploaded
      const uniqueCats = Array.from(new Set(categories?.slice(0, 200) ?? [])).filter(Boolean);
      if (uniqueCats.length > 0) {
        for (const cat of uniqueCats) {
          setStatus(`Grouping themes and writing digest for ${cat}…`);
          await analyze({ data: { category: cat } });
        }
      } else {
        setStatus("Grouping into themes and writing your digest…");
        await analyze({ data: { category: null } });
      }

      await queryClient.invalidateQueries();
      toast.success(
        `Analyzed ${result.inserted} items${result.urgent > 0 ? ` · ${result.urgent} urgent` : ""}`,
      );
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPending(null);
      setStatus("");
    }
  }

  function handlePaste() {
    const lines = text
      .split(/\n{2,}|\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    const items: string[] = [];
    const categories: string[] = [];

    for (const line of lines) {
      const parsed = parsePrefix(line);
      items.push(parsed.content);
      categories.push(parsed.category ?? "");
    }

    void submitItems(items, "manual", undefined, categories.length > 0 ? categories : undefined);
  }

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const first = rows[0] ?? {};
        const keys = Object.keys(first);
        const preferred =
          keys.find((k) => /feedback|review|comment|text|message|body|response/i.test(k)) ?? keys[0];
        const dateKey = keys.find((k) => /date|time|timestamp|received|created/i.test(k));
        const categoryKey = keys.find((k) => /category|project|product|type/i.test(k));

        const items: string[] = [];
        const dates: string[] = [];
        const categories: string[] = [];

        for (const row of rows) {
          const rawContent = String(preferred ? (row[preferred] ?? "") : Object.values(row).join(" ")).trim();
          if (rawContent.length > 2) {
            const parsed = parsePrefix(rawContent);
            items.push(parsed.content);

            const categoryVal = categoryKey ? (row[categoryKey] ?? "").trim() : null;
            categories.push(categoryVal || parsed.category || "");

            if (dateKey && row[dateKey]) {
              const parsedDate = Date.parse(row[dateKey]);
              if (!isNaN(parsedDate)) {
                dates.push(new Date(parsedDate).toISOString());
              } else {
                dates.push("");
              }
            }
          }
        }
        void submitItems(
          items,
          "csv",
          dates.length > 0 ? dates : undefined,
          categories.length > 0 ? categories : undefined
        );
      },
      error: () => toast.error("Could not read that CSV file."),
    });
  }

  async function runAnalysisOnly() {
    setPending("analyze");
    setStatus("Re-clustering themes and writing a fresh digest…");
    try {
      // Find what category is currently viewed or default to null
      const currentCategory = sessionStorage.getItem("feedback_pulse_category") || null;
      await analyze({ data: { category: currentCategory } });
      await queryClient.invalidateQueries();
      toast.success("New digest ready");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPending(null);
      setStatus("");
    }
  }

  const busy = pending !== null;

  return (
    <AppShell
      title="Add feedback"
      description="Paste raw feedback or upload a CSV. Each line or row is treated as one piece of feedback."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-card">
          <label htmlFor="feedback" className="text-sm font-medium">
            Paste feedback
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            Reviews, emails, survey answers, DMs — one per line.
          </p>
          <Textarea
            id="feedback"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            disabled={busy}
            className="mt-4 resize-none font-normal"
            placeholder={
              "Order arrived three days late and the box was crushed.\nLove the new packaging, felt premium.\nSupport never replied to my refund request — very frustrated."
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={handlePaste} disabled={busy || text.trim().length === 0}>
              <Sparkles className="size-4" />
              {busy ? "Analyzing…" : "Analyze feedback"}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <p className="text-sm font-medium">Upload a CSV</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We use the column named feedback, review, comment or text — otherwise the first column.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              className="mt-4 w-full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="size-4" />
              Choose CSV file
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <p className="text-sm font-medium">Already have feedback?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Regenerate themes and a fresh digest from everything stored.
            </p>
            <Button variant="secondary" className="mt-4 w-full" disabled={busy} onClick={runAnalysisOnly}>
              Generate new digest
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function parsePrefix(line: string): { category: string | null; content: string } {
  const trimmed = line.trim();
  
  // Match 1: "Category", "Content"
  const matchCsv = trimmed.match(/^"([^"]+)"\s*,\s*"(.+)"$/);
  if (matchCsv && matchCsv[1] && matchCsv[2]) {
    return { category: matchCsv[1], content: matchCsv[2] };
  }

  // Match 2: "Category", Content
  const matchCsv2 = trimmed.match(/^"([^"]+)"\s*,\s*(.+)$/);
  if (matchCsv2 && matchCsv2[1] && matchCsv2[2]) {
    let content = matchCsv2[2].trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    return { category: matchCsv2[1], content };
  }

  // Match 3: Category: Content (where Category is short, under 30 chars, and not a URL)
  const matchColon = trimmed.match(/^([^:]+)\s*:\s*(.+)$/);
  if (matchColon && matchColon[1] && matchColon[2]) {
    const category = matchColon[1].trim();
    if (category.length < 30 && !category.includes("http")) {
      let content = matchColon[2].trim();
      if (content.startsWith('"') && content.endsWith('"')) {
        content = content.slice(1, -1);
      }
      return { category, content };
    }
  }

  // Fallback: no category prefix
  let content = trimmed;
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }
  return { category: null, content };
}
