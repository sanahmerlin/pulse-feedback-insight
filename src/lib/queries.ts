import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type Digest = {
  id: string;
  headline: string;
  summary: string;
  top_complaints: string[];
  top_praises: string[];
  next_action: string;
  period_start: string;
  period_end: string;
  item_count: number;
  created_at: string;
  category: string | null;
};

export type Theme = {
  id: string;
  name: string;
  description: string | null;
  sentiment: string;
  mention_count: number;
  category: string | null;
};

export type FeedbackItem = {
  id: string;
  content: string;
  source: string;
  sentiment: string | null;
  topic: string | null;
  urgency: string;
  urgency_reason: string | null;
  theme_id: string | null;
  received_at: string;
  category: string | null;
};

export const digestsQuery = (category?: string | null) => queryOptions({
  queryKey: ["digests", category],
  queryFn: async () => {
    let query = supabase.from("digests").select("*").order("created_at", { ascending: false });
    if (category && category !== "all") {
      query = query.eq("category", category);
    } else {
      query = query.is("category", null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Digest[];
  },
});

export const themesQuery = (category?: string | null) => queryOptions({
  queryKey: ["themes", category],
  queryFn: async () => {
    let query = supabase.from("themes").select("*").order("mention_count", { ascending: false });
    if (category && category !== "all") {
      query = query.eq("category", category);
    } else {
      query = query.is("category", null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Theme[];
  },
});

export const feedbackQuery = (category?: string | null) => queryOptions({
  queryKey: ["feedback", category],
  queryFn: async () => {
    let query = supabase.from("feedback_items").select("*").order("received_at", { ascending: false }).limit(500);
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as FeedbackItem[];
  },
});

export const sentimentTone: Record<string, string> = {
  positive: "bg-success/10 text-success border-success/20",
  negative: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
};
