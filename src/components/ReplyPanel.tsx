import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Copy,
  Check,
  RotateCw,
  AlertTriangle,
  Settings,
  MessageSquare,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { generateReply, updateReplyState } from "@/lib/reply.functions";
import {
  type FeedbackItem,
  replySettingsQuery,
  sentimentTone,
} from "@/lib/queries";

interface ReplyPanelProps {
  item: FeedbackItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updatedItem: FeedbackItem) => void;
}

export function ReplyPanel({ item, isOpen, onClose, onUpdate }: ReplyPanelProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(replySettingsQuery());
  const settings = settingsQuery.data;

  const [draft, setDraft] = useState("");
  const [cautionNote, setCautionNote] = useState<string | null>(null);
  const [status, setStatus] = useState<"needs_reply" | "drafted" | "replied">("needs_reply");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeModifier, setActiveModifier] = useState<
    "standard" | "shorter" | "more_empathetic" | "more_formal"
  >("standard");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize draft and status when an item is opened
  useEffect(() => {
    if (!item) return;

    // Check localStorage fallback for stored draft/status
    let storedDraft = item.reply_draft || "";
    let storedStatus = (item.reply_status as any) || "needs_reply";

    if (typeof window !== "undefined") {
      try {
        const localStore = JSON.parse(
          localStorage.getItem("feedback_pulse_review_replies") || "{}"
        );
        if (localStore[item.id]) {
          storedDraft = localStore[item.id].draft || storedDraft;
          storedStatus = localStore[item.id].status || storedStatus;
        }
      } catch {
        // ignore JSON error
      }
    }

    setDraft(storedDraft);
    setStatus(storedStatus);
    setCautionNote(null);
    setErrorMsg(null);
    setCopied(false);
    setActiveModifier("standard");

    // If there is no draft yet, automatically trigger generation
    if (!storedDraft) {
      handleGenerate("standard");
    }
  }, [item?.id, isOpen]);

  // Count words
  const wordCount = draft
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  async function handleGenerate(
    modifier: "standard" | "shorter" | "more_empathetic" | "more_formal"
  ) {
    if (!item) return;
    setLoading(true);
    setErrorMsg(null);
    setActiveModifier(modifier);

    try {
      const res = await generateReply({
        data: {
          reviewId: item.id,
          content: item.content,
          sentiment: item.sentiment,
          topic: item.topic,
          urgency: item.urgency,
          urgencyReason: item.urgency_reason,
          starRating: item.star_rating,
          quickOption: modifier,
          settings: settings
            ? {
                business_name: settings.business_name,
                tone: settings.tone,
                sign_off: settings.sign_off,
                contact_info: settings.contact_info,
              }
            : undefined,
        },
      });

      setDraft(res.draft);
      setCautionNote(res.cautionNote || null);
      setStatus("drafted");

      // Save locally as backup
      saveLocal(item.id, res.draft, "drafted");

      // Notify parent
      if (onUpdate) {
        onUpdate({
          ...item,
          reply_draft: res.draft,
          reply_status: "drafted",
          reply_updated_at: new Date().toISOString(),
        });
      }

      // Invalidate queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    } catch (err: any) {
      console.error("AI reply generation failed:", err);
      setErrorMsg(err.message || "Failed to generate reply. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: "needs_reply" | "drafted" | "replied") {
    if (!item) return;
    setStatus(newStatus);
    saveLocal(item.id, draft, newStatus);

    try {
      await updateReplyState({
        data: {
          reviewId: item.id,
          status: newStatus,
          draft,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      if (onUpdate) {
        onUpdate({
          ...item,
          reply_draft: draft,
          reply_status: newStatus,
          reply_updated_at: new Date().toISOString(),
        });
      }
      toast.success(
        newStatus === "replied"
          ? "Marked as Replied!"
          : newStatus === "drafted"
          ? "Saved as Drafted"
          : "Marked as Needs Reply"
      );
    } catch (err) {
      console.warn("Error updating reply state in DB:", err);
    }
  }

  function saveLocal(reviewId: string, currentDraft: string, currentStatus: string) {
    if (typeof window === "undefined") return;
    try {
      const existing = JSON.parse(
        localStorage.getItem("feedback_pulse_review_replies") || "{}"
      );
      existing[reviewId] = {
        draft: currentDraft,
        status: currentStatus,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem("feedback_pulse_review_replies", JSON.stringify(existing));
    } catch {
      // ignore
    }
  }

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success("Reply copied to clipboard!");

      // If status is still 'needs_reply' or 'drafted', offer a quick transition
      if (status !== "replied" && item) {
        handleStatusChange("replied");
      }

      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast.error("Failed to copy. Please copy manually.");
    }
  }

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto sm:rounded-xl">
        <DialogHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold">Reply Workflow</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5">
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
                  <CheckCircle2 className="mr-1 size-3 inline" />
                ) : status === "drafted" ? (
                  <Clock className="mr-1 size-3 inline" />
                ) : (
                  <AlertTriangle className="mr-1 size-3 inline" />
                )}
                {status === "replied" ? "Replied" : status === "drafted" ? "Drafted" : "Needs Reply"}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Review AI draft, fine-tune the tone, and copy to paste on your review platform.
          </DialogDescription>
        </DialogHeader>

        {/* Original Review Context Box */}
        <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[11px]">
              Customer Review
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 capitalize text-[11px] ${
                sentimentTone[item.sentiment ?? "neutral"] ?? sentimentTone["neutral"]
              }`}
            >
              {item.sentiment ?? "neutral"}
            </span>
            {item.topic ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 capitalize text-muted-foreground text-[11px]">
                {item.topic}
              </span>
            ) : null}
            {item.urgency === "high" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-destructive font-medium text-[11px]">
                <AlertTriangle className="size-3" /> Flagged Urgent
              </span>
            ) : null}
            <span className="ml-auto text-muted-foreground">
              {new Date(item.received_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <p className="text-sm italic leading-relaxed text-foreground/90">
            “{item.content}”
          </p>
          {item.urgency_reason && (
            <p className="mt-2 text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3 shrink-0" />
              <span>{item.urgency_reason}</span>
            </p>
          )}
        </div>

        {/* Caution Warning if review mentions sensitive topics */}
        {cautionNote && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">{cautionNote}</p>
              <p className="mt-0.5 text-[11px] opacity-90">
                Keep your reply strictly neutral. Avoid admitting legal liability or promising unapproved compensations.
              </p>
            </div>
          </div>
        )}

        {/* Business Settings Info Snippet */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            <span>
              Tone: <strong>{settings?.tone || "Warm"}</strong>
            </span>
            <span>•</span>
            <span>
              Sign-off: <strong>{settings?.sign_off || "Owner"}</strong>
            </span>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={onClose}
          >
            <Settings className="size-3" />
            Edit Reply Settings
          </Link>
        </div>

        {/* Draft Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              Generated Reply Draft
            </label>
            <span
              className={`text-[11px] ${
                wordCount > 80 ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
            >
              {wordCount} words {wordCount > 80 ? "(Target: ≤ 80 words)" : "(Max: 80 words)"}
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
              <RotateCw className="size-5 animate-spin text-primary" />
              <p className="mt-2 text-xs font-medium text-foreground">
                Crafting personalized response…
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Analyzing language, sentiment, and your brand tone
              </p>
            </div>
          ) : errorMsg ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
              <p className="text-xs text-destructive">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => handleGenerate(activeModifier)}
              >
                <RotateCw className="mr-1 size-3" /> Retry Generation
              </Button>
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (item) saveLocal(item.id, e.target.value, status);
              }}
              rows={4}
              placeholder="Your drafted reply will appear here. You can freely edit before copying."
              className="resize-y text-sm leading-relaxed"
            />
          )}
        </div>

        {/* Quick Tone Modifiers / Regeneration Options */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">
            Quick tone:
          </span>
          <Button
            type="button"
            variant={activeModifier === "standard" ? "secondary" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleGenerate("standard")}
            className="h-7 text-xs px-2.5 rounded-full"
          >
            Standard
          </Button>
          <Button
            type="button"
            variant={activeModifier === "shorter" ? "secondary" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleGenerate("shorter")}
            className="h-7 text-xs px-2.5 rounded-full"
          >
            Shorter
          </Button>
          <Button
            type="button"
            variant={activeModifier === "more_empathetic" ? "secondary" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleGenerate("more_empathetic")}
            className="h-7 text-xs px-2.5 rounded-full"
          >
            More empathetic
          </Button>
          <Button
            type="button"
            variant={activeModifier === "more_formal" ? "secondary" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleGenerate("more_formal")}
            className="h-7 text-xs px-2.5 rounded-full"
          >
            More formal
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => handleGenerate(activeModifier)}
            className="h-7 text-xs ml-auto text-muted-foreground hover:text-foreground"
          >
            <RotateCw className={`mr-1 size-3 ${loading ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
        </div>

        {/* Review Status Selector & Action Buttons */}
        <div className="border-t border-border pt-4 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mark Status:</span>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => handleStatusChange("needs_reply")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  status === "needs_reply"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Needs reply
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("drafted")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  status === "drafted"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Drafted
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("replied")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  status === "replied"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Replied
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              disabled={!draft || loading}
              className="text-xs bg-primary text-primary-foreground font-medium gap-1.5"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy reply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
