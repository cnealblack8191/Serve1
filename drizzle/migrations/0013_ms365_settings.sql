-- Microsoft 365 direct connection settings (additive; nothing existing is changed).
-- Holds the customer's OWN Azure app registration details so the app talks to
-- Microsoft directly. RLS is enabled with NO policies: unreachable from anon or
-- authenticated roles; only server code with the service role reads it.
CREATE TABLE IF NOT EXISTS public.ms365_settings (
  id text PRIMARY KEY DEFAULT 'default',
  tenant_id text,
  client_id text,
  client_secret text,
  site_id text,
  drive_id text,
  shared_mailbox text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ms365_settings TO service_role;

ALTER TABLE public.ms365_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies for anon/authenticated: server-side access only.