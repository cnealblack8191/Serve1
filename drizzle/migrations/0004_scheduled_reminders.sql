-- Per-user notification preferences (drives which automatic reminders a user receives)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Notifications can now be targeted at a single user and de-duplicated across cron runs
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_idx ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);

DROP POLICY IF EXISTS "Team accesses notifications" ON public.notifications;
CREATE POLICY "Team accesses own or shared notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Track when a bid's stage last changed so "no update since sent" can be measured
ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.bids_touch_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bids_stage_changed_at ON public.bids;
CREATE TRIGGER bids_stage_changed_at
  BEFORE UPDATE ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.bids_touch_stage_changed_at();

-- Scheduling extensions for the daily reminder sweep
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;