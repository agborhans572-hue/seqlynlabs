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
| `SUPABASE_GOOGLE_ENABLED` | `false` until Google is configured and verified; then `true` |
| `SHOP_ADMIN_EMAIL` | Omit until the owner provides the email of the intended Google account |

The official Supabase/Vercel integration can populate `POSTGRES_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Connect the existing project rather than creating a second database. Limit project access to `seqlynlabs`. Do not connect the unrelated `supabase-purple-anchor` storage resource.

For a manual connection, use **Connect → Direct → Transaction pooler** in Supabase. Copy the pooler URI on port 6543, replace `[YOUR-PASSWORD]` with the existing database password, and save it as a server secret in Vercel. Do not paste passwords into chat or commit them. TLS verification stays enabled and prepared statements are disabled for transaction pooling. Limit production database credentials to Production; do not share the production database with arbitrary preview branches.

## Database schema

Apply `supabase/migrations/202610180001_seqlyn_shop.sql` through Supabase's SQL Editor, or run `npm run db:migrate:supabase` with credentials in the ignored `.env.local`. This creates 12 tables in the private `seqlyn` schema, with Row Level Security enabled and browser roles denied table access. Orders, guest tokens, carts, customer addresses and internal notes remain server-only. No public SQL-execution RPC is installed.

The migration can be repeated without deleting data. It is separate from the existing D1/Turso migrations and does not copy old preview data automatically. The PostgreSQL adapter preserves bound parameters, existing IDs and API response shapes, and uses serializable transactions with bounded retries for checkout races. New PostgreSQL-specific tests exercise checkout, coupons, private receipts, admin authorization, transaction rollback, and schema permissions using a real embedded PostgreSQL engine.

## Google authentication

Set Supabase **Authentication → URL Configuration** to:

- Site URL: `https://www.seqlynlabs.com`
- Redirect URL: `https://www.seqlynlabs.com/api/auth/callback/supabase`
- Redirect URL: `https://seqlynlabs.vercel.app/api/auth/callback/supabase`

Use exact callback URLs rather than broad wildcard permissions. Register `http://localhost:4175/api/auth/callback/supabase` only if local OAuth testing is needed.

The owner account is still being set up. Keep `SUPABASE_GOOGLE_ENABLED=false` and administrator access unassigned until it is ready. In Google Cloud, create/configure the Web OAuth client for Seqlyn Labs and register the Supabase callback:

`https://uiixqemqtalhyabemsrm.supabase.co/auth/v1/callback`

Then enter the Google client ID and secret in Supabase **Authentication → Sign In / Providers → Google**. Leave nonce checks enabled. Google consent-screen/publishing setup and any test-user allowlist must cover the intended users. The Google client secret belongs in Supabase; the Supabase mode does not require `AUTH_GOOGLE_SECRET` or `AUTH_SECRET` in Vercel.

The app uses PKCE, HttpOnly Secure cookies, server-verified `getUser()` identity, confirmed email, and Google-backed identity. Each request gets its own auth client, and refreshed cookies are forwarded only with that visitor's response. Sign-out requires same-origin POST plus CSRF confirmation. Existing Auth.js mode remains available for the earlier deployment option.

## Deploy and verify

Run `npm test`, `npm run build:vercel`, and `npm run verify:vercel`; push to `main` or redeploy the latest commit after changing Vercel variables. Visit `/health`: database must be `ready`; authentication remains `unconfigured` while the Google flag is false. Verify the catalog, guest verification/cart, and a disposable test order over HTTPS. After Google setup, verify sign-in/callback/sign-out, customer isolation, and owner-only administration. No payment is collected in this mode.

References: [Supabase serverless connections](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers), [server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
