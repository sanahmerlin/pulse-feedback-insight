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
  reply_draft?: string | null;
  reply_status?: "needs_reply" | "drafted" | "replied" | string | null;
  reply_updated_at?: string | null;
  star_rating?: number | null;
};

export type ReplySettings = {
  business_name: string;
  tone: "Warm" | "Professional" | "Apologetic-but-firm";
  sign_off: string;
  contact_info: string;
};

export const defaultReplySettings: ReplySettings = {
  business_name: "",
  tone: "Warm",
  sign_off: "Owner",
  contact_info: "",
};

export const replySettingsQuery = () => queryOptions({
  queryKey: ["reply_settings"],
  queryFn: async (): Promise<ReplySettings> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return getLocalReplySettings();
      }
      const { data, error } = await supabase
        .from("reply_settings")
        .select("business_name, tone, sign_off, contact_info")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        return getLocalReplySettings();
      }
      return {
        business_name: data.business_name ?? "",
        tone: (data.tone as any) || "Warm",
        sign_off: data.sign_off ?? "",
        contact_info: data.contact_info ?? "",
      };
    } catch {
      return getLocalReplySettings();
    }
  },
});

function getLocalReplySettings(): ReplySettings {
  if (typeof window === "undefined") return defaultReplySettings;
  try {
    const raw = localStorage.getItem("feedback_pulse_reply_settings");
    if (!raw) return defaultReplySettings;
    return { ...defaultReplySettings, ...JSON.parse(raw) };
  } catch {
    return defaultReplySettings;
  }
}

export const digestsQuery = (category?: string | null, days?: number | null) => queryOptions({
  queryKey: ["digests", category, days],
  queryFn: async () => {
    let query = supabase.from("digests").select("*").order("created_at", { ascending: false });
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", cutoff);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Digest[];
  },
});

export const themesQuery = (category?: string | null, days?: number | null) => queryOptions({
  queryKey: ["themes", category, days],
  queryFn: async () => {
    let query = supabase.from("themes").select("*").order("mention_count", { ascending: false });
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", cutoff);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Theme[];
  },
});

export const feedbackQuery = (category?: string | null, days?: number | null) => queryOptions({
  queryKey: ["feedback", category, days],
  queryFn: async () => {
    let query = supabase.from("feedback_items").select("*").order("received_at", { ascending: false }).limit(500);
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("received_at", cutoff);
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
