ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS package_links jsonb NOT NULL DEFAULT '[]'::jsonb;