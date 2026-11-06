import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

function getFallbackClient(token?: string) {
  const url = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || "https://wziyxocwnwqeupkkutgr.supabase.co";
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] || process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || "sb_publishable_3JSJLIsZJcjtz4c2GeSWMA_kHIroIUP";
  return createClient<Database>(url, key, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

const IngestInput = z.object({
  items: z.array(z.string().min(1)).min(1).max(200),
  source: z.string().default("manual"),
  dates: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
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
  .validator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const items = data.items.map((t) => t.trim().slice(0, 2000)).filter(Boolean);
    const dates = data.dates ?? [];
    const category = data.category ?? null;

    const tags: Tag[] = [];
    const batchSize = 150;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const result = await callAiJson<{ tags: Tag[] }>(
        `You are a customer-feedback analyst. For each numbered feedback item, return sentiment (positive, negative or neutral), a short lowercase topic label chosen from: shipping, pricing, service, quality, product, website, communication, returns, other, and urgency ("high" ONLY if the customer sounds extremely angry, threatens to cancel or leave, reports a bug that completely blocks key features, or demands immediate action. DO NOT flag feature requests, suggestions, questions, or positive compliments as urgent under any circumstances. If in doubt, default to "none"). If urgency is high, add a one-sentence urgency_reason. Respond as JSON: {"tags":[{"index":0,"sentiment":"...","topic":"...","urgency":"...","urgency_reason":"..."}]}`,
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
      
      // Determine the timestamp (received_at)
      let receivedAt: string;
      if (dates[index]) {
        receivedAt = dates[index];
      } else {
        // Linear spacing over the last 14 days with random jitter for organic look
        const jitter = (Math.random() - 0.5) * 0.5; // +/- 6 hours jitter
        const daysAgo = Math.max(0, Math.min(14, (index / Math.max(1, items.length - 1)) * 14 + jitter));
        const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        receivedAt = date.toISOString();
      }

      return {
        user_id: userId,
        content,
        source: data.source,
        sentiment: tag?.sentiment ?? "neutral",
        topic: tag?.topic ?? "other",
        urgency: tag?.urgency === "high" ? "high" : "none",
        urgency_reason: tag?.urgency === "high" ? (tag.urgency_reason ?? null) : null,
        received_at: receivedAt,
        category,
      };
    });

    let { error } = await supabase.from("feedback_items").insert(rows);
    if (error && (error.message.includes("Invalid API key") || error.code === "PGRST301")) {
      console.warn("Retrying feedback_items insert with fallback client:", error.message);
      const fallback = getFallbackClient((context as any).token);
      const retry = await fallback.from("feedback_items").insert(rows);
      error = retry.error;
    }
    if (error) throw new Error(error.message);

    return { inserted: rows.length, urgent: rows.filter((r) => r.urgency === "high").length };
  });

export const analyzeAndDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ category: z.string().nullable().optional() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const category = data.category ?? null;

    let query = supabase
      .from("feedback_items")
      .select("id, content, sentiment, topic, urgency")
      .eq("user_id", userId);
    
    if (category) {
      query = query.eq("category", category);
    } else {
      query = query.is("category", null);
    }

    let { data: feedback, error: fetchError } = await query
      .order("received_at", { ascending: false })
      .limit(300);

    if (fetchError && (fetchError.message.includes("Invalid API key") || fetchError.code === "PGRST301")) {
      console.warn("Retrying feedback query with fallback client:", fetchError.message);
      const fallback = getFallbackClient((context as any).token);
      let retryQuery = fallback
        .from("feedback_items")
        .select("id, content, sentiment, topic, urgency")
        .eq("user_id", userId);
      if (category) {
        retryQuery = retryQuery.eq("category", category);
      } else {
        retryQuery = retryQuery.is("category", null);
      }
      const retryRes = await retryQuery.order("received_at", { ascending: false }).limit(300);
      feedback = retryRes.data;
      fetchError = retryRes.error;
    }

    if (fetchError) throw new Error(fetchError.message);
    if (!feedback || feedback.length === 0) return { themes: 0, items: 0 };

    // --- Clustering step ---
    const clustered = await callAiJson<{
      themes: Array<{ name: string; description: string; sentiment: string; items: number[] }>;
    }>(
      `You group customer feedback into themes. Read the numbered items and return 3-8 distinct themes. Each theme has a short human name (2-4 words, title case), a one-sentence description, a dominant sentiment (positive, negative or neutral), and the list of item numbers belonging to it. Every item must belong to exactly one theme. Respond as JSON: {"themes":[{"name":"...","description":"...","sentiment":"...","items":[0,3]}]}`,
      feedback.map((f, n) => `${n}. [${f.sentiment}/${f.topic}] ${f.content}`).join("\n"),
    );

    // Reset themes specifically for this category
    let updateQuery = supabase.from("feedback_items").update({ theme_id: null }).eq("user_id", userId);
    if (category) {
      updateQuery = updateQuery.eq("category", category);
    } else {
      updateQuery = updateQuery.is("category", null);
    }
    await updateQuery;

    let deleteQuery = supabase.from("themes").delete().eq("user_id", userId);
    if (category) {
      deleteQuery = deleteQuery.eq("category", category);
    } else {
      deleteQuery = deleteQuery.is("category", null);
    }
    await deleteQuery;

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
          category,
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

    // Delete old digests for this category
    let deleteDigestQuery = supabase.from("digests").delete().eq("user_id", userId);
    if (category) {
      deleteDigestQuery = deleteDigestQuery.eq("category", category);
    } else {
      deleteDigestQuery = deleteDigestQuery.is("category", null);
    }
    await deleteDigestQuery;

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
      category,
    });
    if (digestError) throw new Error(digestError.message);

    return { themes: themeSummaries.length, items: feedback.length };
  });
