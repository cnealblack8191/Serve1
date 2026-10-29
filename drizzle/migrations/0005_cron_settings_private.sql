-- Private table for scheduler configuration. Not exposed via the Data API and no app-role grants.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.cron_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE private.cron_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
REVOKE ALL ON private.cron_settings FROM anon, authenticated;