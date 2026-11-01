import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai.server";
import { z } from "zod";

const GenerateReplyInput = z.object({
  reviewId: z.string().optional(),
  content: z.string().min(1).max(3000),
  sentiment: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  urgency: z.string().nullable().optional(),
  urgencyReason: z.string().nullable().optional(),
  starRating: z.number().min(1).max(5).nullable().optional(),
  quickOption: z.enum(["standard", "shorter", "more_empathetic", "more_formal"]).default("standard"),
  settings: z
    .object({
      business_name: z.string().optional(),
      tone: z.enum(["Warm", "Professional", "Apologetic-but-firm"]).optional(),
      sign_off: z.string().optional(),
      contact_info: z.string().optional(),
    })
    .optional(),
});

export const generateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateReplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch user's business reply settings if not passed or partially passed
    let businessSettings = data.settings;
    if (!businessSettings?.business_name) {
      try {
        const { data: dbSettings } = await supabase
          .from("reply_settings")
          .select("business_name, tone, sign_off, contact_info")
          .eq("user_id", userId)
          .maybeSingle();

        if (dbSettings) {
          businessSettings = {
            business_name: dbSettings.business_name || businessSettings?.business_name || "",
            tone: (dbSettings.tone as any) || businessSettings?.tone || "Warm",
            sign_off: dbSettings.sign_off || businessSettings?.sign_off || "Owner",
            contact_info: dbSettings.contact_info || businessSettings?.contact_info || "",
          };
        }
      } catch (err) {
        console.warn("Could not load reply_settings from DB, continuing with defaults:", err);
      }
    }

    const businessName = businessSettings?.business_name?.trim() || "Our Business";
    const tone = businessSettings?.tone || "Warm";
    const signOff = businessSettings?.sign_off?.trim() || "Owner";
    const contactInfo = businessSettings?.contact_info?.trim() || "";

    const quickOption = data.quickOption;
    let quickModifierGuidance = "";
    if (quickOption === "shorter") {
      quickModifierGuidance =
        "MAKE IT STRICTLY SHORTER: Cut to the chase in 1-2 tight sentences, maximum 35-40 words total.";
    } else if (quickOption === "more_empathetic") {
      quickModifierGuidance =
        "MAKE IT MORE EMPATHETIC: Show profound human warmth, deep listening, genuine care, and validate their feelings sincerely.";
    } else if (quickOption === "more_formal") {
      quickModifierGuidance =
        "MAKE IT MORE FORMAL: Maintain high corporate courtesy, objective dignity, and structured professional phrasing.";
    }

    const systemPrompt = `You are an expert customer-relations specialist assisting a business owner in drafting direct, authentic replies to customer reviews.

CORE BUSINESS SETTINGS:
- Business Name: ${businessName}
- Desired Tone: ${tone} (Options: Warm, Professional, or Apologetic-but-firm)
- Sign-off: ${signOff}
${contactInfo ? `- Owner Offline Contact (use when asking them to reach out directly): ${contactInfo}` : ""}

STRICT AI PROMPT RULES:
1. LANGUAGE: Reply in the EXACT SAME LANGUAGE as the review. If the review is in Malayalam, reply in natural Malayalam. If in Manglish (Malayalam written using the English alphabet), reply in authentic Manglish. If in English, Hindi, or any other language, reply in that exact language.
2. LENGTH: Keep it between 2 and 4 sentences. Under NO circumstance exceed 80 words.
3. STRUCTURE:
   - Genuinely thank the customer for sharing their feedback.
   - Specifically acknowledge the exact problem or praise they mentioned (e.g. food quality, delivery delay, staff attitude, app crash). Never speak in vague abstractions.
   - For negative/complaint reviews: Apologize sincerely only where appropriate. Never blame the customer, argue, or be defensive.
   - For positive reviews: Provide a short, genuine, grateful thank-you mentioning the specific item or service they loved.
   - Next step: Offer a constructive next step or invite them to reach out directly${contactInfo ? ` at ${contactInfo}` : ""}.
   - Sign-off: Conclude naturally with "- ${signOff}".
4. NO INVENTED PROMISES: NEVER invent facts, discounts, refunds, vouchers, free replacements, or policy changes that the owner has not explicitly confirmed.
5. NO CLICHE FILLER: NEVER use generic filler phrases like "We value your feedback" or "Your satisfaction is our utmost priority" on their own. Be personal, human, and direct.
6. SENSITIVE TOPICS (CRITICAL SAFETY):
   If the review mentions health risks, food poisoning, physical injury, legal threats, police, lawsuits, discrimination, or financial fraud:
   - Keep the reply strictly minimal, calm, polite, and neutral.
   - Do NOT admit legal fault or liability.
   - Direct them immediately to contact the owner directly offline${contactInfo ? ` at ${contactInfo}` : ""}.
   - In the JSON output, populate "caution_note" with: "Review this before replying: this review mentions health, safety, fraud, or legal matters."
   Otherwise, "caution_note" should be null.
${quickModifierGuidance ? `\n7. QUICK MODIFIER: ${quickModifierGuidance}` : ""}

RESPOND STRICTLY AS JSON:
{
  "draft": "Your drafted reply text ready to copy-paste",
  "caution_note": "Optional caution note string if sensitive topic, else null"
}`;

    const userContent = JSON.stringify({
      review_text: data.content,
      star_rating: data.starRating ?? (data.sentiment === "positive" ? 5 : data.sentiment === "negative" ? 1 : 3),
      detected_sentiment: data.sentiment ?? "neutral",
      detected_topic: data.topic ?? "general",
      urgency: data.urgency ?? "none",
      urgency_reason: data.urgencyReason ?? null,
    });

    const aiResult = await callAiJson<{ draft: string; caution_note?: string | null }>(
      systemPrompt,
      `Customer Review to Reply to:\n${userContent}`
    );

    const draft = aiResult.draft?.trim() || "";
    const cautionNote = aiResult.caution_note || null;

    // Persist draft to feedback_items if reviewId is present
    if (data.reviewId) {
      try {
        await supabase
          .from("feedback_items")
          .update({
            reply_draft: draft,
            reply_status: "drafted",
            reply_updated_at: new Date().toISOString(),
          } as any)
          .eq("id", data.reviewId)
          .eq("user_id", userId);
      } catch (err) {
        console.warn("Could not persist draft to database, returning in-memory:", err);
      }
    }

    return {
      draft,
      cautionNote,
      status: "drafted" as const,
    };
  });

export const updateReplyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      reviewId: z.string(),
      status: z.enum(["needs_reply", "drafted", "replied"]),
      draft: z.string().optional(),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    try {
      const updatePayload: Record<string, any> = {
        reply_status: data.status,
        reply_updated_at: new Date().toISOString(),
      };
      if (typeof data.draft === "string") {
        updatePayload.reply_draft = data.draft;
      }

      const { error } = await supabase
        .from("feedback_items")
        .update(updatePayload as any)
        .eq("id", data.reviewId)
        .eq("user_id", userId);

      if (error) {
        console.warn("Supabase update error:", error.message);
      }
    } catch (err) {
      console.warn("Could not update reply status in DB:", err);
    }

    return { success: true, status: data.status };
  });

export const saveReplySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_name: z.string().min(1, "Business name is required"),
      tone: z.enum(["Warm", "Professional", "Apologetic-but-firm"]),
      sign_off: z.string().min(1, "Sign-off is required"),
      contact_info: z.string().optional().default(""),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    try {
      const { error } = await supabase
        .from("reply_settings")
        .upsert({
          user_id: userId,
          business_name: data.business_name.trim(),
          tone: data.tone,
          sign_off: data.sign_off.trim(),
          contact_info: (data.contact_info || "").trim(),
          updated_at: new Date().toISOString(),
        } as any);

      if (error) {
        console.warn("Supabase saveReplySettings error:", error.message);
      }
    } catch (err) {
      console.warn("Could not save reply settings to DB:", err);
    }

    return { success: true };
  });
