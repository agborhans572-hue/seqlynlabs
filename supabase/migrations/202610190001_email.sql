-- Transactional email queue and confirmed newsletter subscriptions. No historical enrollments.
BEGIN;
CREATE TABLE IF NOT EXISTS seqlyn.email_outbox (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, recipient TEXT NOT NULL, payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt BIGINT NOT NULL DEFAULT 0, first_attempt BIGINT NOT NULL DEFAULT 0,
 lease TEXT NOT NULL DEFAULT '', lease_until BIGINT NOT NULL DEFAULT 0,
 provider_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text
);
CREATE INDEX IF NOT EXISTS idx_email_pending ON seqlyn.email_outbox(status,next_attempt);
CREATE TABLE IF NOT EXISTS seqlyn.newsletter_subscribers (
 email TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL,
 requested_at BIGINT NOT NULL, confirmed_at BIGINT NOT NULL DEFAULT 0,
 unsubscribed_at BIGINT NOT NULL DEFAULT 0, consent TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_token ON seqlyn.newsletter_subscribers(token);
CREATE TABLE IF NOT EXISTS seqlyn.newsletter_campaigns (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, message TEXT NOT NULL,
 recipients INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text
);
ALTER TABLE seqlyn.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE item TEXT;
BEGIN
 FOREACH item IN ARRAY ARRAY['email_outbox','newsletter_subscribers','newsletter_campaigns'] LOOP
  EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM PUBLIC',item);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM anon',item);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM authenticated',item);
  END IF;
 END LOOP;
END $$;
INSERT INTO seqlyn.schema_migrations(version) VALUES ('202610190001') ON CONFLICT DO NOTHING;
COMMIT;
