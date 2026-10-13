-- Private progress only. Does not enable billing or change any cron schedule.
CREATE TABLE IF NOT EXISTS public.picgift_play_reconciliation_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.picgift_play_reconciliation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.picgift_play_reconciliation_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.picgift_play_reconciliation_state TO service_role;
INSERT INTO public.picgift_play_reconciliation_state (singleton) VALUES (true) ON CONFLICT DO NOTHING;
