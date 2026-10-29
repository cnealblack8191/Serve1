ALTER TABLE public.opportunities
ADD COLUMN source text NOT NULL DEFAULT 'Manual';

ALTER TABLE public.opportunities
ADD CONSTRAINT opportunities_source_check
CHECK (source IN ('Manual', 'Sales', 'Service'));

CREATE INDEX opportunities_source_idx ON public.opportunities (source);