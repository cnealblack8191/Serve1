-- Bid opportunity intake: incoming shared-mailbox mail classified as bid
-- invitations, extracted into structured draft data awaiting human bid/no-bid
-- review. Nothing here is authoritative until a person approves it.

CREATE TABLE public.bid_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.message_threads(id) ON DELETE SET NULL,
  intake_source text NOT NULL DEFAULT 'mailbox',
  status text NOT NULL DEFAULT 'pending',
  is_bid_invitation boolean NOT NULL DEFAULT true,
  confidence numeric NOT NULL DEFAULT 0,
  needs_review boolean NOT NULL DEFAULT true,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_match text NOT NULL DEFAULT 'new',
  matched_customer text,
  candidate_customers jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_name text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_preview text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  opportunity_id text,
  decision_note text NOT NULL DEFAULT '',
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bid_intake_status_check CHECK (status IN ('pending', 'bid', 'no_bid', 'dismissed')),
  CONSTRAINT bid_intake_match_check CHECK (customer_match IN ('matched', 'ambiguous', 'new'))
);

CREATE UNIQUE INDEX bid_intake_message_idx ON public.bid_intake (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX bid_intake_status_idx ON public.bid_intake (status, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bid_intake TO authenticated;
GRANT ALL ON public.bid_intake TO service_role;
ALTER TABLE public.bid_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads intake" ON public.bid_intake FOR SELECT TO authenticated
USING (has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids'));

CREATE POLICY "Team writes intake" ON public.bid_intake FOR INSERT TO authenticated
WITH CHECK (has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids'));

CREATE POLICY "Team updates intake" ON public.bid_intake FOR UPDATE TO authenticated
USING (has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids'))
WITH CHECK (has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids'));

CREATE POLICY "Team deletes intake" ON public.bid_intake FOR DELETE TO authenticated
USING (has_permission(auth.uid(), 'crm'));