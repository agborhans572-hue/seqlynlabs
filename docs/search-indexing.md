# Google Search setup

Production origin: `https://www.seqlynlabs.com` (the apex redirects to www).

The Vercel build generates `/sitemap.xml` from public HTML pages and `/robots.txt` with the sitemap location. The current sitemap has 99 unique canonical URLs. Account, cart, checkout, order tracking, wishlist, admin, the generic product shell and legacy feeds are excluded. Utility pages and legacy feeds also receive `X-Robots-Tag: noindex, follow`.

Verified live on 2026-10-19: sitemap and robots return HTTP 200; sitemap is XML; public product pages have no noindex header; cart receives the noindex header. All 54 tests pass.

Google Search Console Domain property: `seqlynlabs.com`, prepared under `agborhans572@gmail.com`. Verification is pending action-time confirmation. The Google verification TXT record is filled in the Vercel DNS form but has not been saved. Sitemap submission and homepage indexing request are pending verification. No claim of Google indexing has been made.

After verification, submit `https://www.seqlynlabs.com/sitemap.xml` in Sitemaps and inspect/request indexing for `https://www.seqlynlabs.com/`. Submission does not guarantee indexing; Google controls crawl and indexing timing.
