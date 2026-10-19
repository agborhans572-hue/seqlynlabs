# Seqlyn Labs: Supabase and Vercel

The existing Supabase project is `Seqlyn labs` (`uiixqemqtalhyabemsrm`). The existing Vercel project is `software333/seqlynlabs`, deployed from `agborhans572-hue/seqlynlabs` on `main`. Its production origin is `https://www.seqlynlabs.com`; `https://seqlynlabs.vercel.app` also points to production. The apex redirects to `www`.

## Server configuration

| Environment variable | Value |
| --- | --- |
| `COMMERCE_MODE` | `test` |
| `PUBLIC_SITE_URL` | `https://www.seqlynlabs.com` |
| `AUTH_PROVIDER` | `supabase` |
| `SUPABASE_URL` | `https://uiixqemqtalhyabemsrm.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key from this project's Connect panel |
| `SUPABASE_DB_URL` or `POSTGRES_URL` | Existing project's transaction pooler connection URI, including the database password |
| `SUPABASE_GOOGLE_ENABLED` | `true` in Production as of October 19, 2026 |
| `SHOP_ADMIN_EMAIL` | `info@seqlynlabs.com`, saved in Production and redeployed October 19 |

The official Supabase/Vercel integration is installed and connects this existing Supabase project to `seqlynlabs` only. Its database credentials are synced to Vercel **Production**, with no production credentials shared with preview branches. Do not connect the unrelated `supabase-purple-anchor` storage resource.

For a manual connection, use **Connect → Direct → Transaction pooler** in Supabase. Copy the pooler URI on port 6543, replace `[YOUR-PASSWORD]` with the existing database password, and save it as a server secret in Vercel. Do not paste passwords into chat or commit them. TLS verification stays enabled and prepared statements are disabled for transaction pooling. Limit production database credentials to Production; do not share the production database with arbitrary preview branches.

The server and migration runner trust the public Supabase Root 2021 CA bundled in `src/vercel/database-tls.js`, alongside Node's system roots, for Supabase database hosts. Certificate and hostname verification remain enabled. The root was downloaded from this project's Database Settings; it expires April 26, 2031. Update it from the official dashboard when Supabase rotates its root. Queries are limited to one in flight per connection for shared-pooler compatibility.

## Database schema

Migration `supabase/migrations/202610180001_seqlyn_shop.sql` has been applied through Supabase's SQL Editor. All 12 tables in the private `seqlyn` schema were verified with Row Level Security enabled and browser roles denied table access. For a new environment, apply the migration through SQL Editor or run `npm run db:migrate:supabase` with credentials in the ignored `.env.local`. Orders, guest tokens, carts, customer addresses and internal notes remain server-only. No public SQL-execution RPC is installed.

The migration can be repeated without deleting data. It is separate from the existing D1/Turso migrations and does not copy old preview data automatically. The PostgreSQL adapter preserves bound parameters, existing IDs and API response shapes, and uses serializable transactions with bounded retries for checkout races. New PostgreSQL-specific tests exercise checkout, coupons, private receipts, admin authorization, transaction rollback, and schema permissions using a real embedded PostgreSQL engine.

## Google authentication

Supabase **Authentication → URL Configuration** has been saved as:

- Site URL: `https://www.seqlynlabs.com`
- Redirect URL: `https://www.seqlynlabs.com/api/auth/callback/supabase`
- Redirect URL: `https://seqlynlabs.vercel.app/api/auth/callback/supabase`

Use exact callback URLs rather than broad wildcard permissions. Register `http://localhost:4175/api/auth/callback/supabase` only if local OAuth testing is needed.

The owner confirmed `info@seqlynlabs.com` as the intended administrator and approved Google's policy acceptance, credential creation, Supabase connection and administrator activation on October 19. The separate Google Cloud project **Seqlyn Labs** (`river-cocoa-512108-k7`) now has an external, **In production** Google Auth Platform configuration. The app name is Seqlyn Labs, developer contact is `info@seqlynlabs.com`, and the homepage, privacy-policy and terms links point to the Seqlyn website. Google's support-email picker currently only offers the signed-in project owner's `agborhans572@gmail.com`; changing that to the business mailbox requires an eligible Google account/group. The existing Eppix OAuth client in My First Project was not changed.

The **Seqlyn Labs Production** Web OAuth client was created and installed in Supabase. Its JavaScript origin is `https://www.seqlynlabs.com` and its exact registered Supabase callback is:

`https://uiixqemqtalhyabemsrm.supabase.co/auth/v1/callback`

Supabase **Authentication → Sign In / Providers → Google** is enabled with the new client ID and secret. Nonce checks remain enabled and users must have an email. The Google client secret is stored in Supabase; it was not committed or placed in Vercel. Supabase mode does not require `AUTH_GOOGLE_SECRET` or `AUTH_SECRET` in Vercel. The dashboard also currently lists inherited Vercel preview redirect patterns in addition to the two exact production callbacks above; these were not modified during this setup.

Vercel Production has `SHOP_ADMIN_EMAIL=info@seqlynlabs.com` and `SUPABASE_GOOGLE_ENABLED=true`. Deployment [`6RmJzV64T7vrisPwVHxjxMYDBdoY`](https://vercel.com/software333/seqlynlabs/6RmJzV64T7vrisPwVHxjxMYDBdoY) reached Ready and was assigned to the public domain. Hosted checks returned `/health` 200 with `database: ready` and `authentication: configured`, anonymous `/api/account` returned `signedIn: false`, and anonymous `/api/admin/overview` returned 403. Opening `/auth/signin?return_to=%2Fadmin%2F` reached Google's account chooser with the expected Supabase project and Seqlyn policy links. The owner must still complete Google sign-in with `info@seqlynlabs.com` to verify the actual callback, admin session, and sign-out; only another Google account was already signed in to the browser.

Entering `info@seqlynlabs.com` in Google's sign-in form returned **Couldn't find this account**. This mailbox must first be registered as a Google account, or the owner must specify a different existing Google account email for administration. No Google user account was created and no other email was granted store administrator access.

The app uses PKCE, HttpOnly Secure cookies, server-verified `getUser()` identity, confirmed email, and Google-backed identity. Each request gets its own auth client, and refreshed cookies are forwarded only with that visitor's response. Sign-out requires same-origin POST plus CSRF confirmation. Existing Auth.js mode remains available for the earlier deployment option.

## Deploy and verify

Production was verified on October 18, 2026: `/health` returned 200 with `database: ready`; all 81 products and their variant IDs/prices matched the source catalog; all 108 product/variant image references were available. Guest verification, persistent cart, test checkout, idempotent retry, private receipt access, and cancellation passed over HTTPS. The synthetic test order was cancelled. Anonymous/forged administrator access was denied. Both public origins reached the database. See [hosted smoke report](../reports/deployment/hosted-smoke.json). The automated suite passed all 45 tests and the Vercel bundle check passed for 112 pages and unchanged certificate copies.

Run `npm test`, `npm run build:vercel`, and `npm run verify:vercel`; push to `main` or redeploy the latest commit after changing Vercel variables. Visit `/health`: database must be `ready`; authentication remains `unconfigured` while the Google flag is false. Verify the catalog, guest verification/cart, and a disposable test order over HTTPS. After Google setup, verify sign-in/callback/sign-out, customer isolation, and owner-only administration. No payment is collected in this mode.

References: [Supabase serverless connections](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers), [server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
