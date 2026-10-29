-- Centralized communications: mirror of the designated Microsoft 365 shared mailbox.
-- Microsoft 365 remains the system of record; these tables cache messages and
-- hold the business-record relationships the app needs.

CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_conversation_id text,
  subject text NOT NULL DEFAULT '',
  preview text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT 'inbox',
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_attachments boolean NOT NULL DEFAULT false,
  unread_count integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX message_threads_graph_conversation_idx
  ON public.message_threads (graph_conversation_id)
  WHERE graph_conversation_id IS NOT NULL;
CREATE INDEX message_threads_folder_idx ON public.message_threads (folder, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_threads TO authenticated;
GRANT ALL ON public.message_threads TO service_role;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads threads" ON public.message_threads FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team writes threads" ON public.message_threads FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team updates threads" ON public.message_threads FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
)
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  graph_message_id text,
  internet_message_id text,
  direction text NOT NULL DEFAULT 'outbound',
  folder text NOT NULL DEFAULT 'sent',
  from_name text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_preview text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  is_draft boolean NOT NULL DEFAULT false,
  is_read boolean NOT NULL DEFAULT true,
  has_attachments boolean NOT NULL DEFAULT false,
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_detail text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'app',
  sent_at timestamptz,
  received_at timestamptz,
  sent_by uuid,
  sent_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX messages_graph_message_idx
  ON public.messages (graph_message_id) WHERE graph_message_id IS NOT NULL;
CREATE INDEX messages_thread_idx ON public.messages (thread_id, created_at);
CREATE INDEX messages_folder_idx ON public.messages (folder, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads messages" ON public.messages FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team writes messages" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team updates messages" ON public.messages FOR UPDATE TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
)
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Authors delete drafts" ON public.messages FOR DELETE TO authenticated
USING (is_draft AND sent_by = auth.uid());

CREATE TABLE public.message_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.message_threads(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id text NOT NULL,
  auto_matched boolean NOT NULL DEFAULT false,
  linked_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_links_record_type_check CHECK (
    record_type IN ('customer','contact','opportunity','bid','estimate','job','work_order','invoice','email')
  ),
  CONSTRAINT message_links_target_check CHECK (message_id IS NOT NULL OR thread_id IS NOT NULL)
);

CREATE UNIQUE INDEX message_links_message_record_idx
  ON public.message_links (message_id, record_type, record_id) WHERE message_id IS NOT NULL;
CREATE UNIQUE INDEX message_links_thread_record_idx
  ON public.message_links (thread_id, record_type, record_id) WHERE message_id IS NULL;
CREATE INDEX message_links_record_idx ON public.message_links (record_type, record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_links TO authenticated;
GRANT ALL ON public.message_links TO service_role;
ALTER TABLE public.message_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads message links" ON public.message_links FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team writes message links" ON public.message_links FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team removes message links" ON public.message_links FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
);

CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.document_refs(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  extension text NOT NULL DEFAULT '',
  size_bytes bigint,
  web_url text NOT NULL DEFAULT '',
  inline boolean NOT NULL DEFAULT false,
  graph_attachment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_attachments_message_idx ON public.message_attachments (message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads attachments" ON public.message_attachments FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team writes attachments" ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);
CREATE POLICY "Team removes attachments" ON public.message_attachments FOR DELETE TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
);

CREATE TABLE public.mailbox_sync_state (
  id text PRIMARY KEY,
  mailbox_address text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT '',
  delta_token text,
  last_synced_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  connected boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mailbox_sync_state TO authenticated;
GRANT ALL ON public.mailbox_sync_state TO service_role;
ALTER TABLE public.mailbox_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads sync state" ON public.mailbox_sync_state FOR SELECT TO authenticated
USING (
  has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
  OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  OR has_permission(auth.uid(), 'field')
);