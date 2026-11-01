import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ingestFeedback, analyzeAndDigest } from "@/lib/feedback.functions";
import { feedbackQuery } from "@/lib/queries";
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

  const [text, setText] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pulse_upload_draft") || "";
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (text) {
        localStorage.setItem("pulse_upload_draft", text);
      } else {
        localStorage.removeItem("pulse_upload_draft");
      }
    }
  }, [text]);

  const [pending, setPending] = useState<null | "upload" | "analyze">(null);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Query all feedback to dynamically extract unique categories for the dropdown
  const allFeedback = useQuery(feedbackQuery("all"));
  const allItems = allFeedback.data ?? [];
  const categories = Array.from(
    new Set(allItems.map((i) => i.category).filter(Boolean))
  ) as string[];

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(true);

  // Sync default selection once categories list loads
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0] || "");
      setIsCreatingNew(false);
    }
  }, [categories, selectedCategory]);

  async function submitItems(
    items: string[],
    source: string,
    dates?: string[],
    categoryName?: string
  ) {
    if (items.length === 0) {
      toast.error("No feedback found to analyze.");
      return;
    }
    const finalCat = categoryName?.trim();
    if (!finalCat) {
      toast.error("Please specify a project/category for this feedback.");
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
          category: finalCat,
        },
      });

      setPending("analyze");
      setStatus("Grouping into themes and writing your digest…");
      await analyze({ data: { category: finalCat } });

      await queryClient.invalidateQueries();
      if (typeof window !== "undefined") {
        localStorage.removeItem("pulse_upload_draft");
      }
      toast.success(
        `Analyzed ${result.inserted} items${result.urgent > 0 ? ` · ${result.urgent} urgent` : ""}`,
      );
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      if (
        msg.toLowerCase().includes("unauthorized") ||
        msg.toLowerCase().includes("session") ||
        msg.toLowerCase().includes("token")
      ) {
        toast.error("Your session has expired. Please sign out and sign back in — your feedback draft is saved!");
      } else {
        toast.error(msg);
      }
    } finally {
      setPending(null);
      setStatus("");
    }
  }

  function handlePaste() {
    const items = text
      .split(/\n{2,}|\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    const finalCategory = isCreatingNew ? newCategoryName : selectedCategory;
    void submitItems(items, "manual", undefined, finalCategory);
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

        const items: string[] = [];
        const dates: string[] = [];

        for (const row of rows) {
          const rawContent = String(preferred ? (row[preferred] ?? "") : Object.values(row).join(" ")).trim();
          if (rawContent.length > 2) {
            items.push(rawContent);

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
        const finalCategory = isCreatingNew ? newCategoryName : selectedCategory;
        void submitItems(
          items,
          "csv",
          dates.length > 0 ? dates : undefined,
          finalCategory
        );
      },
      error: () => toast.error("Could not read that CSV file."),
    });
  }

  async function runAnalysisOnly() {
    setPending("analyze");
    setStatus("Re-clustering themes and writing a fresh digest…");
    try {
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
      <div className="mb-6 space-y-3 rounded-xl border border-border bg-card p-6 shadow-card">
        <label className="text-sm font-medium block">Select Project / Business Stream</label>
        <p className="text-xs text-muted-foreground">
          Choose an existing project or create a new one to keep these customer reviews separated.
        </p>
        
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {categories.length > 0 && (
            <select
              value={isCreatingNew ? "new" : selectedCategory}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "new") {
                  setIsCreatingNew(true);
                } else {
                  setIsCreatingNew(false);
                  setSelectedCategory(val);
                }
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer hover:bg-accent/30"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="new">+ Create a new project...</option>
            </select>
          )}

          {(isCreatingNew || categories.length === 0) && (
            <input
              type="text"
              required
              placeholder="e.g. SaaS App, Coffee Shop, Tailoring Service"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          )}
        </div>
      </div>

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
