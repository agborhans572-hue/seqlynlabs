# Seqlyn Labs Shop — independent ecommerce app

This storefront runs independently of WooCommerce. The home and information pages preserve the PH Bio Labs snapshot from October 6, 2026. All 81 product pages were refreshed from their original pages on October 17, 2026, preserving each product's own layout, image, short description, full Overview, options and linked certificates. Purchasing uses the app's own catalog, cart, customer records and order backend.

## Run and verify

Run `node scripts/preview-shop.mjs` and open http://localhost:4173. Run `node --test tests/*.test.mjs` (or `npm.cmd test` on PowerShell) for integration checks. Run `node scripts/build-shop.mjs` to regenerate the storefront pages, browser assets and Worker output. Use Node.js 24 and install dependencies with `npm ci`.

The ignored local SQLite database is `.sites-runtime/preview.sqlite`. The existing Sites deployment uses D1. Production Vercel uses Supabase PostgreSQL; Turso/libSQL remains an alternative. D1/Turso migrations are appended in `drizzle/`; the Supabase schema is in `supabase/migrations/`. Never edit an applied migration. `db/schema.ts` documents the declarative schema.

## Vercel deployment

The storefront is live at [www.seqlynlabs.com](https://www.seqlynlabs.com), connected to Supabase through the official Vercel integration. The database and guest test checkout passed [hosted verification](reports/deployment/hosted-smoke.json). [Supabase setup](docs/supabase-connection.md) documents the private commerce schema and enabled Google authentication. Google sign-in was enabled and redeployed on October 19, 2026. The configured administrator is `info@seqlynlabs.com`, but Google could not find a Google account for that address; owner sign-in and admin-session verification await account registration or an owner-approved alternate Google email.

See [the Vercel setup and remaining launch checklist](docs/vercel-deployment.md). `npm run build:vercel` prepares CDN assets and a Node.js function; `npm run verify:vercel` checks the actual bundle. Google sign-in replaces hosting-specific authentication in the Vercel target. Production database credentials and OAuth are configured; the owner's Google account is the remaining administration dependency. `npm run preview:vercel` serves the prepared storefront at http://localhost:4175 with separate local data. Manual ordering accepts payment preferences and sends customer/admin notifications; payment details are supplied manually after review. See [manual payment operations](docs/manual-payments.md).

## Shopping and customer features

- Catalog with 81 imported parent products, 66 imported size variants, original product descriptions, search, category filters, sorting and pagination.
- Product pages, selectable sizes, related products, inventory validation and server-calculated pricing.
- Persistent carts, editable quantities, removals, discount codes, shipping/tax breakdowns and item count.
- Researcher popup with both confirmations required; checkout also requires fresh confirmations. These are self-attestations, not independently verified credentials.
- Guest and signed-in order submission with Crypto, Apple Pay and PayPal preferences, idempotent order creation, stored receipts, private guest tracking links, print receipts, pending-order cancellation and reordering.
- Google sign-in through Supabase on Vercel; the legacy Sites target uses ChatGPT dispatch. Signed-in customers have scoped order history, a saved shipping address and a persistent wishlist.
- Contact, newsletter-interest, wholesale and white-label request collection for administrator review.

## Administration

The owner account configured in `SHOP_ADMIN_EMAIL` has server-enforced access at `/admin/`. The dashboard includes order statistics, order search and pagination, manual payment confirmation with a transaction reference, fulfillment transitions, carrier/tracking references, internal notes and an audit history. Customer receipts never expose internal notes or audit records.

Administrators can edit prices, stock and availability for all imported products and variants, and create/edit additional fixed-price products with HTTPS image URLs. New products have `/product/?id=...` detail pages with matching metadata. Products are unpublished rather than deleted, preserving historical receipts.

Discount codes support fixed/percentage amounts, minimum spend, expiry, usage limits and enable/disable controls. Existing terms are immutable through the UI. Checkout counts each successful code use once, including retries, and validates availability in the same transactional batch that creates the order. Cart snapshots prevent two different checkout keys from consuming the same cart twice.

Test shipping supports a flat fee and optional free-shipping minimum. Test tax uses a configurable percentage applied to the discounted subtotal plus shipping. Defaults are zero. These are testing rules, not live carrier or jurisdiction-specific tax calculations.

## Current operating mode and launch dependencies

The private `store_settings` payment configuration enables reviewed orders awaiting manual payment. Customers select a method, receive an immediate confirmation and wait for the owner to email payment details. Known stock is reserved. Only an administrator recording a confirmed transaction can mark the order paid and enable fulfillment. No browser redirect or payment-method selection marks an order paid. `COMMERCE_MODE=test` remains the fallback when manual ordering is disabled; historical test orders remain labeled as tests.

Automatic payment capture and webhook verification are not configured. The owner supplies payment details, checks transactions and manages fulfillment manually. Real stock, shipping/tax settings and business policies remain merchant responsibilities. Transactional email is configured; newsletter campaigns await the business mailing address and the owner must complete Google account registration/admin sign-in. The existing Sites target uses ChatGPT sign-in and its existing audience; Vercel uses Google and separate access settings. Rebranded product images are local. `mirror-report.json` records missing legacy assets; the Vercel audit identifies remaining inherited resource defects. The storefront is not a replacement for final launch configuration.

Customer confirmations, owner order notifications and contact/wholesale/white-label notifications use Resend with a private durable email queue. Newsletter signups require email confirmation; owner-composed campaigns include unsubscribe controls and require the business mailing address before sending is enabled. Administration's Email tab shows queue status and provider acceptance. See [email configuration and operating limits](docs/email-delivery.md).

## Local UI fixtures

For isolated browser QA, set `PREVIEW_UI_FIXTURE=1` before running `scripts/preview-shop.mjs`. This local-only mode renders the UI without the popup and supplies synthetic test identity/verification headers to the local Worker. It is not part of the deployed Worker. Normal preview and production retain the popup and authorization. Never use the fixture to assess production access controls; use the integration tests and hosted dispatch configuration.

Do not rerun the archived mirror/finalize scripts on the standalone shop.

## Certificate library assets

The COA library serves 29 product groups and 38 original PDF certificates from `dist/client/certificates/`, with a full-page image rendered from every original PDF. Certificates are labeled by strength and product-page previews follow the selected size. The original source has no exact PDF for 12 offered strengths; those sizes explicitly show that no certificate is published rather than borrowing another strength's report. The RT 60 mg library preview uses its 60 mg report. `src/certificates.json` records the original source URLs and `reports/certificate-product-audit.json` records the audited strength mappings. To explicitly refresh the original assets, run `node scripts/sync-certificates.mjs` followed by the build; ordinary builds preserve them and require no certificate downloads. `tests/certificates.test.mjs` checks every library reference, strength association and asset signature.

The product snapshots are tracked in `src/product-pages/` and copied into the build without fetching the original site. `reports/product-fidelity-audit.json` records every source description, image, variant and certificate association. To intentionally refresh product pages and catalog data, install development dependencies and run `node scripts/sync-product-pages.mjs`. The importer removes original scripts and uses the local cart instead. `tests/product-fidelity.test.mjs` verifies all 81 rendered routes against that audit.

## Seqlyn Labs branding

Seqlyn Labs uses the existing storefront design and black/copper visual identity. `src/brand.js` defines the display identity and intentionally leaves the public origin unset until a new domain is supplied. `src/brand-assets.json` maps legacy image references to local replacements under `dist/client/assets/seqlyn/`. The ordinary build applies these mappings to every generated page and CSS asset. Legacy contact details are replaced with links to the contact form. No deployment, DNS, authentication, database, pricing, or checkout changes are part of the rebrand.

Original third-party certificate PDFs and matching previews remain unmodified; the baseline hashes are recorded in `reports/rebrand/certificate-hashes.json`. Historical import/audit reports retain source-site references for provenance. Rebranding uses the built-in image editor; the edit instructions and output mapping are recorded in `reports/rebrand/`.

For browser verification with disposable data, use `PREVIEW_UI_FIXTURE=1`, `PREVIEW_PORT=4174`, and `PREVIEW_DATABASE=:memory:` and browse `http://127.0.0.1:4174`. This keeps fixture data and browser cookies separate from the normal `http://localhost:4173` preview. Stop that process after QA.
