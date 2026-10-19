# Email delivery

Updated October 19, 2026.

The owner confirmed `info@seqlynlabs.com` as the intended store administrator and contact-notification recipient.

The owner resumed this work with a separate Resend account (`agborhns`) and approved domain verification, a sending-only key restricted to `seqlynlabs.com`, and storing that key in Vercel Production. The domain is verified. No paid upgrade was purchased and the other Resend account was not changed.

## Production configuration

Vercel Production secrets are `RESEND_API_KEY`, `EMAIL_FROM=Seqlyn Labs <info@seqlynlabs.com>`, `EMAIL_REPLY_TO=info@seqlynlabs.com` and `CRON_SECRET`. The public origin and administrator email were already configured. Credentials belong in the service dashboards, never in Git or browser assets. `NEWSLETTER_POSTAL_ADDRESS` still needs the owner's actual business street/PO-box address, city, postal code and country; an email address cannot replace it. Newsletter campaigns stay disabled until it is set and deployed.

The Vercel DNS additions are a `resend._domainkey` TXT record with Resend's public DKIM key, `rsend` CNAME to `rsend-euw1.forge.rmta.net`, and `send` CNAME to `send.forge.rmta.net`, all with TTL 60. Zoho's existing MX, SPF and DKIM records remain in place. Resend receiving is disabled; Zoho continues to receive mail.

Migration `supabase/migrations/202610190001_email.sql` was applied through the SQL editor. All three new tables (`email_outbox`, `newsletter_subscribers`, `newsletter_campaigns`) use the private `seqlyn` schema, RLS, and denied browser-role access. `drizzle/0004_email.sql` provides the equivalent local/Sites/libSQL tables. The Supabase migration runner now applies every SQL migration in order.

## Behavior and operations

- Checkout atomically stores one confirmation in the same transaction as its order. Emails use server-calculated totals and the private `/order-tracking/` receipt link. Every current order is explicitly labeled TEST: no payment collected or shipment scheduled.
- Contact, wholesale and white-label submissions are saved with a notification to `info@seqlynlabs.com`. The customer is the reply-to address, never the sender. Delivery failures do not discard saved requests or orders.
- Newsletter signups send a confirmation link. The user must submit the confirmation page within 48 hours; opening a link alone makes no change. Signup retries are limited to one confirmation per address per hour. Only confirmed addresses receive campaigns; old interest requests and order/contact customers are not enrolled automatically.
- Administration has an **Email** tab showing queue counts, provider acceptance, retry failures, subscriber counts and campaigns. The owner can compose plain-text campaigns for up to 500 confirmed recipients and process the queue. Messages include the business mailing address, unsubscribe link and one-click unsubscribe headers. Unsubscribed users and superseded subscription tokens are checked again before sending.
- Provider acceptance is labeled **accepted**, not delivered. Use Resend's Emails dashboard for actual delivery, bounce and complaint events. No webhook-based delivery status is claimed.
- Each queued message has a stable provider idempotency key and a lease so concurrent dispatchers do not duplicate sends. Transient failures retry with backoff; nonretryable provider errors stop for review. Uncertain messages older than 23 hours stop rather than being resent beyond Resend's 24-hour idempotency window. Review provider logs before manually reissuing any stopped message.
- Vercel's Hobby-compatible cron runs at `07:00 UTC` (`10:00 Africa/Nairobi`) daily and processes queued mail for up to 45 seconds. Normal submissions/checkout also process small batches immediately; the administrator's processing button drains larger queues. This is not an every-minute background sender, and provider quotas still apply. A busier store should use a more frequent scheduler before scaling campaigns.

## Verification

The email tests cover confirmation deduplication, authoritative totals and private receipt links, escaped contact content, failure retention/retry, confirmed-only recipients, newsletter expiry/unsubscribe/suppression, administrator access, concurrent dispatch and private PostgreSQL migrations. The full suite and Vercel bundle checks must pass before publishing. Hosted verification must additionally confirm the actual Resend account accepts and delivers test order, contact and newsletter-confirmation messages to the owner.
