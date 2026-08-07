CREATE TABLE public.themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  mention_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.feedback_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  sentiment TEXT,
  topic TEXT,
  urgency TEXT NOT NULL DEFAULT 'none',
  urgency_reason TEXT,
  theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.digests (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user ON public.feedback_items(user_id, received_at DESC);
CREATE INDEX idx_feedback_theme ON public.feedback_items(theme_id);
CREATE INDEX idx_themes_user ON public.themes(user_id);
CREATE INDEX idx_digests_user ON public.digests(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_items TO authenticated;
GRANT ALL ON public.feedback_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digests TO authenticated;
GRANT ALL ON public.digests TO service_role;

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own themes" ON public.themes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own feedback" ON public.feedback_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own digests" ON public.digests FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);