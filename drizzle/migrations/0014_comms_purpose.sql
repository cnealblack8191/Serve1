ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general';

ALTER TABLE public.messages
  ADD CONSTRAINT messages_purpose_check CHECK (purpose IN (
    'general','bid_sent','proposal_sent','invoice_sent','invoice_reminder',
    'work_order_scheduling','work_order_confirmation','work_order_technician',
    'work_order_completion','work_order_followup','intake'
  ));

CREATE INDEX IF NOT EXISTS messages_purpose_idx ON public.messages (purpose);