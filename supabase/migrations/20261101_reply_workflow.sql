-- Migration for Reply Workflow Feature
-- 1. Add reply fields to feedback_items
ALTER TABLE public.feedback_items 
ADD COLUMN IF NOT EXISTS reply_draft TEXT,
ADD COLUMN IF NOT EXISTS reply_status TEXT NOT NULL DEFAULT 'needs_reply',
ADD COLUMN IF NOT EXISTS reply_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS star_rating INTEGER;

-- 2. Create reply_settings table for per-business setup
CREATE TABLE IF NOT EXISTS public.reply_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'Warm', -- 'Warm' | 'Professional' | 'Apologetic-but-firm'
  sign_off TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for filtering by reply_status
CREATE INDEX IF NOT EXISTS idx_feedback_reply_status ON public.feedback_items(user_id, reply_status);

-- Permissions & RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reply_settings TO authenticated;
GRANT ALL ON public.reply_settings TO service_role;

ALTER TABLE public.reply_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reply_settings' AND policyname = 'own reply settings'
  ) THEN
    CREATE POLICY "own reply settings" ON public.reply_settings
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
