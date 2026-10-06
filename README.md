# PH Bio Labs Shop — independent ecommerce test app

This storefront runs independently of WooCommerce. The home and information pages preserve the PH Bio Labs snapshot from October 6, 2026; purchasing uses the app's own catalog, cart, customer records and order backend.

## Run and verify

Run `node scripts/preview-shop.mjs` and open http://localhost:4173. Run `node --test tests/*.test.mjs` (or `npm.cmd test` on PowerShell) for integration checks. Run `node scripts/build-shop.mjs` to regenerate the storefront pages, browser assets and Worker output. No runtime npm dependencies are required.

The ignored local SQLite database is `.sites-runtime/preview.sqlite`. All production data lives in Sites D1. Migrations are appended in `drizzle/`; never edit an applied migration. `db/schema.ts` documents the declarative schema.

## Shopping and customer features

- Catalog with 81 imported parent products, 66 imported size variants, existing product summaries, search, category filters, sorting and pagination.
- Product pages, selectable sizes, related products, inventory validation and server-calculated pricing.
- Persistent carts, editable quantities, removals, discount codes, shipping/tax breakdowns and item count.
- Researcher popup with both confirmations required; checkout also requires fresh confirmations. These are self-attestations, not independently verified credentials.
- Guest and signed-in test checkout, idempotent order creation, stored receipts, private guest tracking links, print receipts, pending-order cancellation and reordering.
- Sign in with ChatGPT through Sites dispatch. Signed-in customers have scoped order history, a saved shipping address and a persistent wishlist.
- Contact, newsletter-interest, wholesale and white-label request collection for administrator review.

## Administration

The owner account configured in `SHOP_ADMIN_EMAIL` has server-enforced access at `/admin/`. The dashboard includes order statistics, order search and pagination, test fulfillment transitions, carrier/tracking references, internal notes and an audit history. Customer receipts never expose internal notes or audit records.

Administrators can edit prices, stock and availability for all imported products and variants, and create/edit additional fixed-price products with HTTPS image URLs. New products have `/product/?id=...` detail pages with matching metadata. Products are unpublished rather than deleted, preserving historical receipts.

Discount codes support fixed/percentage amounts, minimum spend, expiry, usage limits and enable/disable controls. Existing terms are immutable through the UI. Checkout counts each successful code use once, including retries, and validates availability in the same transactional batch that creates the order. Cart snapshots prevent two different checkout keys from consuming the same cart twice.

Test shipping supports a flat fee and optional free-shipping minimum. Test tax uses a configurable percentage applied to the discounted subtotal plus shipping. Defaults are zero. These are testing rules, not live carrier or jurisdiction-specific tax calculations.

## Current operating mode and launch dependencies

`COMMERCE_MODE=test`: no money is collected, no shipment is scheduled and inventory is not deducted. Every order and receipt is marked as a test. Setting a different mode fails checkout closed because a live payment provider has not been selected. No browser redirect can mark an order as paid.

Live selling still needs an approved payment provider and verified webhook integration, real stock, actual shipping/tax rules, email delivery, confirmed business policies, asset storage under the store's control and public access configuration. Customer authentication currently uses ChatGPT sign-in. The hosted site remains private to its existing audience. Product images and legacy information-page assets still load from the original public image server; `mirror-report.json` records missing legacy assets. The storefront is not a replacement for final launch configuration.

Newsletter interest and other requests are saved in the dashboard; they do not send emails or create subscriptions on an external service. Fulfillment changes simulate the workflow only.

## Local UI fixtures

For isolated browser QA, set `PREVIEW_UI_FIXTURE=1` before running `scripts/preview-shop.mjs`. This local-only mode renders the UI without the popup and supplies synthetic test identity/verification headers to the local Worker. It is not part of the deployed Worker. Normal preview and production retain the popup and authorization. Never use the fixture to assess production access controls; use the integration tests and hosted dispatch configuration.

Do not rerun the archived mirror/finalize scripts on the standalone shop.
