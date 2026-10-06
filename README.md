# PH Bio Labs Shop — independent test store

Public page snapshot of https://phbiolabs.com/ captured October 6, 2026.

Run `node scripts/preview-shop.mjs`, then open http://localhost:4173. Run `npm test` for the commerce integration checks and `npm run build` for Worker output.

The original HTML, CSS, fonts, branding, and product imagery are retained. Larger assets load from their original public URLs to fit the computer's available disk space. Category filters and progressive product loading run locally.

The shop operates independently of WooCommerce. D1 stores carts, test orders, product settings, and customer requests. Prices are calculated on the server. Signed-in customer accounts use Sites' Sign in with ChatGPT; guests receive private order tracking links. Administration is restricted to the server-verified owner email set in SHOP_ADMIN_EMAIL. Never expose this dashboard by using client-only authorization.

Researcher confirmation is restored, with both checkboxes required. It records self-attestation, not independently verified identity or researcher qualification. Confirmations expire after 30 days; checkout requires fresh checkbox confirmation as well.

COMMERCE_MODE must remain `test`: no payment is collected, no shipment is scheduled, and no inventory is deducted. Setting any other mode disables checkout because no live payment adapter exists. Test shipping and tax are explicitly zero; they are not real shipping/tax rates. Unknown product variants remain blocked. Inventory starts unknown until entered by the administrator.

Launch requirements: approved live payment provider and verified webhooks, actual inventory and variants, shipping/tax rules, production customer authentication choice, email/newsletter provider, independent asset storage, final business policies, security/mobile testing, and public access authorization. The site remains private. The newsletter records interest only; email campaigns are not sent. Contact/wholesale/white-label requests are stored for administrator review without emailing the original company's addresses.

Do not rerun the old mirror/finalize scripts on the standalone shop: they are archival tools and do not produce its runtime. Existing source images still include references to the original public image server. Production orders must never be marked paid or fulfilled from a browser redirect or client request.

`mirror-report.json` lists the snapshot's missing assets. `drizzle/0000_shop.sql` is the initial schema migration; applied migrations must stay immutable. The local preview database lives in ignored `.sites-runtime/preview.sqlite`.
