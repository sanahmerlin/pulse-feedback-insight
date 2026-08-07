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

  async function submitItems(items: string[], source: string) {
    if (items.length === 0) {
      toast.error("No feedback found to analyze.");
      return;
    }
    setPending("upload");
    try {
      setStatus(`Tagging ${items.length} feedback items with AI…`);
      const result = await ingest({ data: { items: items.slice(0, 200), source } });

      setPending("analyze");
      setStatus("Grouping into themes and writing your digest…");
      await analyze({ data: undefined });

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
    const items = text
      .split(/\n{2,}|\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2);
    void submitItems(items, "manual");
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
        const items = rows
          .map((r) => (preferred ? (r[preferred] ?? "") : Object.values(r).join(" ")))
          .map((v) => String(v).trim())
          .filter((v) => v.length > 2);
        void submitItems(items, "csv");
      },
      error: () => toast.error("Could not read that CSV file."),
    });
  }

  async function runAnalysisOnly() {
    setPending("analyze");
    setStatus("Re-clustering themes and writing a fresh digest…");
    try {
      await analyze({ data: undefined });
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
