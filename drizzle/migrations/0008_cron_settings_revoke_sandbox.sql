REVOKE INSERT, UPDATE, SELECT ON private.cron_settings FROM sandbox_exec;
REVOKE USAGE ON SCHEMA private FROM sandbox_exec;
DROP POLICY IF EXISTS "sandbox writes cron settings" ON private.cron_settings;