ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'Contract',
  ADD COLUMN IF NOT EXISTS markup_table jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'Contract';

ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'Contract';