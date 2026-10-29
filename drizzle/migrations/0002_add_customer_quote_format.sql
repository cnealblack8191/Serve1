ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS quote_format text NOT NULL DEFAULT 'Lump Sum';