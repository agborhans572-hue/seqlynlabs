# Google Search setup

Production origin: `https://www.seqlynlabs.com` (the apex redirects to www).

The Vercel build generates `/sitemap.xml` from public HTML pages and `/robots.txt` with the sitemap location. The current sitemap has 99 unique canonical URLs. Account, cart, checkout, order tracking, wishlist, admin, the generic product shell and legacy feeds are excluded. Utility pages and legacy feeds also receive `X-Robots-Tag: noindex, follow`.

Verified live on 2026-10-19: sitemap and robots return HTTP 200; sitemap is XML; public product pages have no noindex header; cart receives the noindex header. All 54 tests pass.

Google Search Console Domain property: `seqlynlabs.com`, verified under `agborhans572@gmail.com` on 2026-10-19 after user confirmation. The root Google verification TXT record is saved in Vercel DNS and visible through public DNS. Keep this record to preserve verification. Existing Zoho and Resend DNS records were preserved.

Google accepted `https://www.seqlynlabs.com/sitemap.xml`: **Success**, 99 discovered pages, last read 19 October 2026. The homepage inspection initially reported that the URL was unknown to Google. Google's live URL check completed and Search Console confirmed **Indexing requested** for `https://www.seqlynlabs.com/`. The URL was added to Google's priority crawl queue. Submission does not guarantee indexing; Google controls crawl and indexing timing.
