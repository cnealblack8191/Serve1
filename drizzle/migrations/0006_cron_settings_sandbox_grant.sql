DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    GRANT USAGE ON SCHEMA private TO sandbox_exec;
    GRANT INSERT, UPDATE ON private.cron_settings TO sandbox_exec;
  END IF;
END $$;
-- Allow the row write despite RLS for this maintenance role only.
DROP POLICY IF EXISTS "sandbox writes cron settings" ON private.cron_settings;
CREATE POLICY "sandbox writes cron settings" ON private.cron_settings
  FOR ALL TO sandbox_exec USING (true) WITH CHECK (true);