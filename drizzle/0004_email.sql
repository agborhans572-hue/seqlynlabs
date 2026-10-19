CREATE TABLE email_outbox (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, recipient TEXT NOT NULL, payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, first_attempt INTEGER NOT NULL DEFAULT 0,
 lease TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0,
 provider_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_email_pending ON email_outbox(status,next_attempt);
CREATE TABLE newsletter_subscribers (
 email TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL,
 requested_at INTEGER NOT NULL, confirmed_at INTEGER NOT NULL DEFAULT 0,
 unsubscribed_at INTEGER NOT NULL DEFAULT 0, consent TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_newsletter_token ON newsletter_subscribers(token);
CREATE TABLE newsletter_campaigns (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, message TEXT NOT NULL,
 recipients INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
