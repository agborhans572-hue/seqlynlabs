# Deploy Seqlyn Labs to Vercel

The storefront is deployed at `https://www.seqlynlabs.com` with the existing Supabase project connected through the official integration. The private schema, production database and Google sign-in are configured. The administrator email is `info@seqlynlabs.com`, but Google reports no Google account exists for that address; owner account setup and a completed admin login remain outstanding. See [Supabase connection](supabase-connection.md) and [hosted verification](../reports/deployment/hosted-smoke.json). The Turso/Auth.js instructions below remain an alternative deployment option.

The app now builds a Vercel deployment with CDN-served pages/assets and one Node.js 24 function for commerce, Google sign-in, health checks, administrator access, and custom product metadata. The existing Cloudflare/Sites build remains available. The Vercel target uses Turso/libSQL with the existing SQL schema and atomic checkout transactions.

This is a **test storefront**. No payments are collected, inventory is not deducted, and fulfillment changes do not schedule shipments. Do not change `COMMERCE_MODE` to enable sales; a live payment integration is still required.

For commercial operation, use a commercial Vercel plan: [Vercel's Hobby plan is limited to personal/non-commercial use](https://vercel.com/legal/terms).

## Configure services

1. Create a Vercel project. Select **Other** as the framework and set its Root Directory to `phbiolabs-copy` if importing the containing folder. Keep the settings in `vercel.json`: install `npm ci --include=dev`, build `npm run build:vercel`, Node.js `24.x`. Build tools are development dependencies and must be installed for packaging. Leave the Output Directory override unset: the build writes `.vercel/output` using Vercel's Build Output API.
2. Create a hosted Turso database and a database authentication token. Use separate databases and OAuth credentials for Preview and Production. The database must be remote; function-local SQLite files cannot store durable orders on Vercel.
3. Create a Google OAuth **Web application** client. Configure the consent screen, permitted test users if still in testing, and this exact authorized redirect URI on each chosen hostname: `https://<your-hostname>/api/auth/callback/google`. The hostname can be the stable Vercel project hostname; a custom domain is optional. Register `http://localhost:4175/api/auth/callback/google` separately if testing Google sign-in locally. Arbitrary Vercel preview hostnames are not automatically authorized by Google.
4. Set the server environment variables below in Vercel. Copy `.env.example` to the ignored `.env.local` for local provisioning; never commit actual credentials. Generate `AUTH_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and paste its output directly into the environment settings.

| Variable | Value / purpose |
| --- | --- |
| `COMMERCE_MODE` | `test` |
| `TURSO_DATABASE_URL` | Hosted `libsql://...` or HTTPS database URL, with TLS enabled |
| `TURSO_AUTH_TOKEN` | Database token with required read/write access |
| `AUTH_SECRET` | At least 32 random characters; keep stable across deployments to preserve sessions |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `SHOP_ADMIN_EMAIL` | Exact Google account email for the store administrator; Google must verify the email |
| `PUBLIC_SITE_URL` | Optional build-time HTTPS public origin, without a path; omit until a hostname is chosen |

`PUBLIC_SITE_URL` controls canonical and social URL metadata. No old domain is reused and no domain is inferred from untrusted headers. Changing it requires rebuilding. Cookies are Secure/HttpOnly where applicable, authentication uses encrypted sessions, OAuth state/CSRF checks are supplied by Auth.js, and API writes still enforce same-origin requests. Caller-supplied old hosting identity headers and preview administrator cookies cannot authenticate on Vercel.

## Provision and verify

From this project directory:

```powershell
npm ci
npm run db:migrate
npm run check:deploy
npm test
npm run build:vercel
npm run verify:vercel
npm run preview:vercel
```

Open `http://localhost:4175`. The preview uses its own `.sites-runtime/vercel-preview.sqlite`, never the existing preview database, and does not supply a synthetic administrator identity. Google sign-in needs the credentials and local callback registration above. The production function never uses this local database or removes Secure cookie flags.

`db:migrate` applies the four existing SQL migrations to a **new database** once, records hashes, rejects modified applied migrations, and rolls back a failed migration. It never runs automatically on a public request or during a build. Back up existing data before any import; this command deliberately does not silently baseline an existing untracked database. Existing Cloudflare/local orders are not copied to Turso. Old customer IDs cannot automatically be associated with new Google IDs; plan an explicit ownership-verified import if retaining customer histories is required. Guest receipt tokens and stored orders are otherwise unchanged by the adapter.

`verify:vercel` tests the actual bundled Node launcher, routing patterns, sign-in page, product/variant image files, and byte-identical certificate copies. It also writes `reports/deployment/assets.json`. The Vercel packager removes already-failed stylesheet/script/font/background URLs, the unused Maps loader with an empty key, the obsolete emoji loader, and inherited Tagada/Site Kit/Pinterest tracking scripts. The About image uses the existing approved Seqlyn hero in place of its missing import. Repairs are recorded in `reports/deployment/legacy-repairs.json`; original snapshots and audit files are retained. Imported About/contact forms now save requests to the store inbox. The deployment restricts browser connections to the same origin so legacy plugins cannot send AJAX requests to the former site.

## Upload

For Git-based deployment, commit all intended app files, **including** `dist/client`, `src/product-pages`, branded image assets, migrations, and the required `reports/certificate-product-audit.json`. This app builds from local page snapshots; do not delete `dist/client` before building. Existing working changes have been preserved and have not been committed automatically. `.vercelignore` excludes local databases, credentials, most audit artifacts, and archived import scripts from CLI source uploads.

Alternatively, with Vercel CLI installed and signed in, link this directory to your project, build the output, and upload it as a preview. The prepared static output is approximately 233 MB (222 MiB); Vercel documents a 100 MB CLI source-upload limit on Hobby and 1 GB on Pro. Use a suitable plan/Git build workflow rather than assuming a Hobby CLI upload will accept this bundle:

```powershell
vercel link
npm run build:vercel
vercel deploy --prebuilt
```

The prebuilt route uploads only the prepared output rather than historical source/audit files. Production environment variables must still be configured in Vercel; they are not embedded into the function bundle. Use Vercel's project-linked production build/deployment workflow when promoting to production. Do not upload `dist/client` alone: it lacks the commerce API and authentication function.

After uploading, verify `/health` returns 200 with `database: ready`, sign in with the configured owner, test a guest order and private receipt, check an ordinary customer's account isolation, update a disposable product/coupon as administrator, and test desktop/mobile pages. Review runtime logs. Local tests cannot verify real Google OAuth credentials, the remote database, DNS, Vercel rewrites, or the hosted HTTPS flow.

## Remaining launch work

- **Account setup:** Google OAuth, Supabase Google provider, Production `SUPABASE_GOOGLE_ENABLED=true` and `SHOP_ADMIN_EMAIL=info@seqlynlabs.com` are configured and redeployed. Google currently reports **Couldn't find this account** for the admin email. The owner must register that address as a Google account or specify an existing Google email. Then verify the real callback, customer isolation, owner-only administration and sign-out. Secrets remain in the service dashboards.
- **Content/visual review:** approve the About-page fallback image and review inherited marketing claims against actual operations. The Vercel build repairs broken mirror references; six Google Fonts stylesheet URLs remain external dependencies. No map-based address verification is implemented.
- **Live commerce:** choose a payment provider approved for this catalog; implement signed webhooks and server-authoritative payment status, inventory reservation/deduction, real shipping and tax rules, and operational refunds/fulfillment. Checkout intentionally remains test-only.
- **Communications and content:** Resend sending-domain verification, order confirmations, contact notifications, newsletter opt-in/unsubscribe and owner-composed campaigns are implemented. Hosted order/contact/newsletter-confirmation test emails were delivered to the owner; see [email delivery](email-delivery.md). Set the actual physical business mailing address to enable newsletter campaigns. Review policy text, legal/business details, product claims and exact certificate availability. Original certificates remain untouched.
- **Operations:** confirm a suitable Vercel plan for launch, set backup/restore and monitoring practices, and review database/function regions and service capacity. Git deployment and the existing public hostname are working. Customer/admin data remains protected by server authorization; production database credentials are not shared with preview branches.
- **Performance:** the deploy bundle retains original image quality and is about 222 MiB of static files. Lossless/approved responsive image optimization is an optional further improvement for page speed and bandwidth.

References: [Vercel Build Output API](https://vercel.com/docs/build-output-api), [Vercel upload limits](https://vercel.com/docs/limits), [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Turso JavaScript transactions](https://docs.turso.tech/sdk/ts/reference), [Auth.js Google setup](https://authjs.dev/reference/core/providers/google).
