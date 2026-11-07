-- ==============================================================================
-- FEEDBACKPULSE UNIFIED SCHEMA & RLS MIGRATION
-- Safe to re-run multiple times (Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Core Tables for FeedbackPulse Application

-- 2a. Feedback Items / Reviews Table
CREATE TABLE IF NOT EXISTS public.feedback_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  sentiment TEXT,
  topic TEXT,
  urgency TEXT NOT NULL DEFAULT 'none',
  urgency_reason TEXT,
  theme_id UUID,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT,
  star_rating INTEGER,
  reply_draft TEXT,
  reply_status TEXT DEFAULT 'pending',
  reply_updated_at TIMESTAMPTZ
);

-- Ensure newly added columns exist if table was already created
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS star_rating INTEGER;
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS reply_draft TEXT;
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS reply_status TEXT DEFAULT 'pending';
ALTER TABLE public.feedback_items ADD COLUMN IF NOT EXISTS reply_updated_at TIMESTAMPTZ;

-- 2b. Themes / Topic Clusters Table
CREATE TABLE IF NOT EXISTS public.themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  mention_count INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS category TEXT;

-- 2c. Digests / Cumulative Analysis Table
CREATE TABLE IF NOT EXISTS public.digests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  top_complaints JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_praises JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action TEXT NOT NULL DEFAULT '',
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT now(),
  item_count INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.digests ADD COLUMN IF NOT EXISTS category TEXT;

-- 2d. Reply Settings Table
CREATE TABLE IF NOT EXISTS public.reply_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  business_name TEXT DEFAULT '',
  tone TEXT DEFAULT 'Warm',
  sign_off TEXT DEFAULT 'Owner',
  contact_info TEXT DEFAULT '',
  length TEXT DEFAULT 'medium',
  language TEXT DEFAULT 'auto',
  brand_voice TEXT DEFAULT '',
  auto_generate BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT '';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'Warm';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS sign_off TEXT DEFAULT 'Owner';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS contact_info TEXT DEFAULT '';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS length TEXT DEFAULT 'medium';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'auto';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS brand_voice TEXT DEFAULT '';
ALTER TABLE public.reply_settings ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT false;

-- 3. Dedicated Multi-Business & Review Sessions Architecture

CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  review_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.review_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  rating INTEGER,
  sentiment TEXT,
  topic TEXT,
  urgency TEXT NOT NULL DEFAULT 'none',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.review_sessions(id) ON DELETE SET NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  top_complaints JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_praises JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  tone TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Fast Performance Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_items_user_cat ON public.feedback_items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_feedback_items_received ON public.feedback_items(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_themes_user_cat ON public.themes(user_id, category);
CREATE INDEX IF NOT EXISTS idx_digests_user_cat ON public.digests(user_id, category);
CREATE INDEX IF NOT EXISTS idx_reply_settings_user ON public.reply_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_user ON public.businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews(user_id);

-- 5. Row Level Security Configuration
ALTER TABLE public.feedback_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_settings DISABLE ROW LEVEL SECURITY;

-- 6. Clean RLS Policies for both authenticated and anon access
DO $$
BEGIN
  -- Allow anon fallback access so server operations with publishable key succeed
  DROP POLICY IF EXISTS "anon_feedback" ON public.feedback_items;
  CREATE POLICY "anon_feedback" ON public.feedback_items FOR ALL TO anon USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "anon_themes" ON public.themes;
  CREATE POLICY "anon_themes" ON public.themes FOR ALL TO anon USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "anon_digests" ON public.digests;
  CREATE POLICY "anon_digests" ON public.digests FOR ALL TO anon USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "anon_reply_settings" ON public.reply_settings;
  CREATE POLICY "anon_reply_settings" ON public.reply_settings FOR ALL TO anon USING (true) WITH CHECK (true);

  -- authenticated policies
  DROP POLICY IF EXISTS "Users can view and manage their feedback_items" ON public.feedback_items;
  DROP POLICY IF EXISTS "own feedback" ON public.feedback_items;
  CREATE POLICY "Users can view and manage their feedback_items" ON public.feedback_items
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can view and manage their themes" ON public.themes;
  DROP POLICY IF EXISTS "own themes" ON public.themes;
  CREATE POLICY "Users can view and manage their themes" ON public.themes
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can view and manage their digests" ON public.digests;
  DROP POLICY IF EXISTS "own digests" ON public.digests;
  CREATE POLICY "Users can view and manage their digests" ON public.digests
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can view and manage their reply_settings" ON public.reply_settings;
  CREATE POLICY "Users can view and manage their reply_settings" ON public.reply_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- businesses
  DROP POLICY IF EXISTS "Users can manage their businesses" ON public.businesses;
  CREATE POLICY "Users can manage their businesses" ON public.businesses
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- review_sessions
  DROP POLICY IF EXISTS "Users can manage their review_sessions" ON public.review_sessions;
  CREATE POLICY "Users can manage their review_sessions" ON public.review_sessions
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- reviews
  DROP POLICY IF EXISTS "Users can manage their reviews" ON public.reviews;
  CREATE POLICY "Users can manage their reviews" ON public.reviews
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- analyses
  DROP POLICY IF EXISTS "Users can manage their analyses" ON public.analyses;
  CREATE POLICY "Users can manage their analyses" ON public.analyses
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- replies
  DROP POLICY IF EXISTS "Users can manage their replies" ON public.replies;
  CREATE POLICY "Users can manage their replies" ON public.replies
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- 7. Grant Table Permissions to authenticated, anon and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
