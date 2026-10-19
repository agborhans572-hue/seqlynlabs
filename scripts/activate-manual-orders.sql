-- Run only after deploying the manual-order implementation.
-- This config changes order submission; it does not enable payment capture.
INSERT INTO seqlyn.store_settings(id,data)
VALUES ('payments','{"enabled":true,"methods":[{"id":"crypto","label":"Crypto","enabled":true,"instructions":""},{"id":"apple_pay","label":"Apple Pay","enabled":true,"instructions":""},{"id":"paypal","label":"PayPal","enabled":true,"instructions":""}]}')
ON CONFLICT (id) DO UPDATE SET data=excluded.data;
SELECT id,data FROM seqlyn.store_settings WHERE id='payments';
