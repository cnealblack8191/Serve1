-- Persistent references to SharePoint/Graph drive items, plus the
-- many-to-many links that associate one stored file with many records.

CREATE TABLE public.document_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'sharepoint',
  -- Microsoft Graph durable identifiers (never rely on names/paths alone)
  site_id text,
  drive_id text,
  item_id text,
  etag text,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'file',
  extension text NOT NULL DEFAULT '',
  size_bytes bigint,
  web_url text NOT NULL DEFAULT '',
  folder_path text NOT NULL DEFAULT '',
  -- how the reference entered the system
  origin text NOT NULL DEFAULT 'linked',
  generated_kind text,
  created_by_name text NOT NULL DEFAULT '',
  modified_at text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_refs_kind_chk CHECK (kind IN ('file','folder')),
  CONSTRAINT document_refs_origin_chk CHECK (origin IN ('linked','uploaded','generated','communication'))
);

CREATE UNIQUE INDEX document_refs_graph_item_uq
  ON public.document_refs (drive_id, item_id)
  WHERE drive_id IS NOT NULL AND item_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_refs TO authenticated;
GRANT ALL ON public.document_refs TO service_role;
ALTER TABLE public.document_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads document refs" ON public.document_refs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team writes document refs" ON public.document_refs
  FOR INSERT TO authenticated WITH CHECK (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
    OR has_permission(auth.uid(), 'field')
  );
CREATE POLICY "Team updates document refs" ON public.document_refs
  FOR UPDATE TO authenticated USING (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  ) WITH CHECK (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  );
CREATE POLICY "Managers delete document refs" ON public.document_refs
  FOR DELETE TO authenticated USING (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs')
  );

-- One file, many records: association rows, no file duplication.
CREATE TABLE public.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.document_refs(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  linked_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_links_record_type_chk CHECK (record_type IN (
    'customer','contact','opportunity','bid','estimate','job','work_order','invoice','email'
  )),
  CONSTRAINT document_links_uq UNIQUE (document_id, record_type, record_id)
);

CREATE INDEX document_links_record_idx ON public.document_links (record_type, record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated;
GRANT ALL ON public.document_links TO service_role;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads document links" ON public.document_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team writes document links" ON public.document_links
  FOR INSERT TO authenticated WITH CHECK (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
    OR has_permission(auth.uid(), 'field')
  );
CREATE POLICY "Team deletes document links" ON public.document_links
  FOR DELETE TO authenticated USING (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  );

-- The durable SharePoint folder that belongs to a given business record.
CREATE TABLE public.document_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL,
  record_id text NOT NULL,
  site_id text,
  drive_id text,
  folder_item_id text,
  folder_path text NOT NULL DEFAULT '',
  web_url text NOT NULL DEFAULT '',
  provisioned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_locations_record_type_chk CHECK (record_type IN (
    'customer','contact','opportunity','bid','estimate','job','work_order','invoice','email'
  )),
  CONSTRAINT document_locations_uq UNIQUE (record_type, record_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_locations TO authenticated;
GRANT ALL ON public.document_locations TO service_role;
ALTER TABLE public.document_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads document locations" ON public.document_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team writes document locations" ON public.document_locations
  FOR INSERT TO authenticated WITH CHECK (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  );
CREATE POLICY "Team updates document locations" ON public.document_locations
  FOR UPDATE TO authenticated USING (
    has_permission(auth.uid(), 'crm') OR has_permission(auth.uid(), 'bids')
    OR has_permission(auth.uid(), 'jobs') OR has_permission(auth.uid(), 'invoices')
  ) WITH CHECK (true);
