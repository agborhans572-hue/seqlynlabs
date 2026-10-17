# Historical domain setup

This document records the earlier PH Bio Labs hostname setup for provenance. Seqlyn Labs currently has no configured public canonical origin. No DNS or hosting changes are included in the rebrand; supply a new domain before reusing any domain-setup instructions below.

# phbiolabsshop.com

The hostname is attached to the existing hosted store. DNS ownership validation and HTTPS issuance are pending. Add the following records at the provider managing **phbiolabsshop.com**. The domain must be registered and its nameservers must point to that DNS provider.

| Type | Host/name | Value |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=yx9yaRBMyCfeYcXEwMV_FnDysC0N3PkOSu-fhgx8BRE |
| TXT | _cf-custom-hostname | 7dc43ffb-edce-45ed-b702-423c7a6d8406 |

Use DNS-only records if the provider offers a proxy toggle. Replace conflicting apex A/AAAA records for the website; preserve email MX/TXT records. Some providers require full names: `_openai-site-verification.phbiolabsshop.com` and `_cf-custom-hostname.phbiolabsshop.com`. Do not append the domain twice. Use the default TTL.

After DNS propagates, refresh the custom-domain status in Sites. HTTPS is issued automatically after validation succeeds. `www.phbiolabsshop.com` has not been attached; it requires its own hostname configuration before adding a www DNS record.

The store keeps its existing owner-only audience during setup. Public customer access must be enabled separately before launch. Payments remain in test mode.

Canonical page URLs and local sharing images use `https://phbiolabsshop.com`. Cart and checkout requests remain relative to the current origin. Guest private order links created before the domain switch retain the old hostname; existing browser cart cookies do not transfer between hostnames.

## Verified parity and remaining launch work

The public-price audit on 2026-10-06 checked 81 products and 66 sizes against phbiolabs.com. Prices, size attributes, product names and short descriptions match after correcting 15 punctuation differences in names. See `reports/price-audit.json` for source URLs, timestamps and hashes. These are a snapshot, not a continuous sync.

The independent shop keeps the researcher gate and its own cart, order, account and administration system. It does not connect to the original WooCommerce backend. Account sign-in, purchase-page layout, detailed descriptions and fulfillment are not confirmed identical to the original store.

Public shipping policy: United States only, free shipping from $150 excluding Alaska and Hawaii, dispatch Monday–Thursday excluding federal holidays. The server applies the threshold and destination exclusions to configured test shipping rates. Exact paid service rates and taxes are not publicly available and must be supplied by the merchant. Contact/newsletter requests are saved for the administrator; email delivery still needs a provider. Private inventory counts cannot be inferred from public product pages. Payment, real fulfillment, authoritative inventory and email delivery must be configured and verified before accepting real orders.

References: https://phbiolabs.com/shipping-policy/, https://phbiolabs.com/refund_returns/, https://phbiolabs.com/terms-and-conditions/.
