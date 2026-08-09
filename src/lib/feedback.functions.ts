import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai.server";
import { z } from "zod";

const IngestInput = z.object({
  items: z.array(z.string().min(1)).min(1).max(200),
  source: z.string().default("manual"),
});

type Tag = {
  index: number;
  sentiment: "positive" | "negative" | "neutral";
  topic: string;
  urgency: "none" | "high";
  urgency_reason?: string;
};

export const ingestFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const items = data.items.map((t) => t.trim().slice(0, 2000)).filter(Boolean);

    const tags: Tag[] = [];
    const batchSize = 150;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const result = await callAiJson<{ tags: Tag[] }>(
        `You are a customer-feedback analyst. For each numbered feedback item, return sentiment (positive, negative or neutral), a short lowercase topic label chosen from: shipping, pricing, service, quality, product, website, communication, returns, other, and urgency ("high" only if the customer sounds angry, threatens to leave, reports a safety/legal/billing failure, or demands immediate action; otherwise "none"). If urgency is high, add a one-sentence urgency_reason. Respond as JSON: {"tags":[{"index":0,"sentiment":"...","topic":"...","urgency":"...","urgency_reason":"..."}]}`,
        batch.map((t, n) => `${n}. ${t}`).join("\n\n"),
      );
      for (const tag of result.tags ?? []) {
        if (typeof tag.index === "number" && batch[tag.index]) {
          tags.push({ ...tag, index: tag.index + i });
        }
      }
      
      // Delay to respect rate limits if there are more batches
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    const byIndex = new Map(tags.map((t) => [t.index, t]));
    const rows = items.map((content, index) => {
      const tag = byIndex.get(index);
      return {
        user_id: userId,
        content,
        source: data.source,
        sentiment: tag?.sentiment ?? "neutral",
        topic: tag?.topic ?? "other",
        urgency: tag?.urgency === "high" ? "high" : "none",
        urgency_reason: tag?.urgency === "high" ? (tag.urgency_reason ?? null) : null,
      };
    });

    const { error } = await supabase.from("feedback_items").insert(rows);
    if (error) throw new Error(error.message);

    return { inserted: rows.length, urgent: rows.filter((r) => r.urgency === "high").length };
  });

export const analyzeAndDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: feedback, error: fetchError } = await supabase
      .from("feedback_items")
      .select("id, content, sentiment, topic, urgency")
      .order("received_at", { ascending: false })
      .limit(300);
    if (fetchError) throw new Error(fetchError.message);
    if (!feedback || feedback.length === 0) throw new Error("Add some feedback before running an analysis.");

    // --- Clustering step ---
    const clustered = await callAiJson<{
      themes: Array<{ name: string; description: string; sentiment: string; items: number[] }>;
    }>(
      `You group customer feedback into themes. Read the numbered items and return 3-8 distinct themes. Each theme has a short human name (2-4 words, title case), a one-sentence description, a dominant sentiment (positive, negative or neutral), and the list of item numbers belonging to it. Every item must belong to exactly one theme. Respond as JSON: {"themes":[{"name":"...","description":"...","sentiment":"...","items":[0,3]}]}`,
      feedback.map((f, n) => `${n}. [${f.sentiment}/${f.topic}] ${f.content}`).join("\n"),
    );

    await supabase.from("feedback_items").update({ theme_id: null }).eq("user_id", userId);
    await supabase.from("themes").delete().eq("user_id", userId);

    const themeSummaries: Array<{ name: string; description: string; sentiment: string; count: number }> = [];

    for (const theme of clustered.themes ?? []) {
      const ids = (theme.items ?? []).map((i) => feedback[i]?.id).filter(Boolean) as string[];
      if (ids.length === 0) continue;
      const { data: inserted, error: themeError } = await supabase
        .from("themes")
        .insert({
          user_id: userId,
          name: theme.name,
          description: theme.description,
          sentiment: ["positive", "negative", "neutral"].includes(theme.sentiment) ? theme.sentiment : "neutral",
          mention_count: ids.length,
        })
        .select("id")
        .single();
      if (themeError || !inserted) continue;
      await supabase.from("feedback_items").update({ theme_id: inserted.id }).in("id", ids);
      themeSummaries.push({
        name: theme.name,
        description: theme.description,
        sentiment: theme.sentiment,
        count: ids.length,
      });
    }

    // --- Digest step ---
    const urgent = feedback.filter((f) => f.urgency === "high");
    const digest = await callAiJson<{
      headline: string;
      summary: string;
      top_complaints: string[];
      top_praises: string[];
      next_action: string;
    }>(
      `You are a friendly analyst writing a weekly customer-feedback digest for a busy small business owner. Write in plain English, no jargon, no bullet symbols. Return JSON: {"headline":"one short sentence","summary":"2-4 sentences on what customers are saying and what is trending","top_complaints":["up to 3 short phrases"],"top_praises":["up to 3 short phrases"],"next_action":"one concrete suggested next action"}`,
      JSON.stringify({
        total_items: feedback.length,
        sentiment_counts: {
          positive: feedback.filter((f) => f.sentiment === "positive").length,
          negative: feedback.filter((f) => f.sentiment === "negative").length,
          neutral: feedback.filter((f) => f.sentiment === "neutral").length,
        },
        themes: themeSummaries,
        urgent_examples: urgent.slice(0, 5).map((f) => f.content),
      }),
    );

    const now = new Date();
    const { error: digestError } = await supabase.from("digests").insert({
      user_id: userId,
      headline: digest.headline ?? "Weekly feedback digest",
      summary: digest.summary ?? "",
      top_complaints: digest.top_complaints ?? [],
      top_praises: digest.top_praises ?? [],
      next_action: digest.next_action ?? "",
      period_start: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
      period_end: now.toISOString(),
      item_count: feedback.length,
    });
    if (digestError) throw new Error(digestError.message);

    return { themes: themeSummaries.length, items: feedback.length };
  });
