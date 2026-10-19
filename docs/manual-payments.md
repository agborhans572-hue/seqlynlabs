# Reviewed orders and manual payment

Customers enter a U.S. delivery address and choose Crypto, Apple Pay or PayPal. Submitting creates an `awaiting_payment` order and clears the cart atomically. Checkout does not collect or verify a payment. The order confirmation tells the customer to wait for payment details after the team reviews the order.

Two transactional emails are saved in the same database transaction as the order. The customer receives the private receipt, authoritative total and selected method. `info@seqlynlabs.com` receives the items, total, delivery address and payment preference; the notification's Reply-To is the customer so the owner can reply with payment details manually. These two messages are dispatched immediately, ahead of any existing campaign backlog. Failed sends remain in the retry queue.

Payment preferences live in the private `seqlyn.store_settings` row `payments`. `enabled: true` selects manual ordering in preference to the legacy environment test setting. The production config enables the three requested preferences. Administrators can edit these in the Payments tab. Existing test orders retain their historical status and are never converted into real or paid orders.

Known stock is reserved when an order is submitted. Cancelling an unpaid order restores that stock once. Blank/unknown stock remains unknown. Unpaid reservations do not expire automatically; review and cancel abandoned orders in administration.

After checking the transaction directly in the wallet or payment provider, the administrator records a transaction reference with **Confirm payment received**. This sets `paid`, records an audit event and allows processing/shipping updates. Selecting a method, submitting an order or emailing payment details cannot mark it paid. Paid orders cannot be cancelled through the unpaid cancellation route; refunds require a separate provider review.

Apple Pay is a requested payment preference, not an integrated wallet payment button. The owner must supply a payment-provider link supporting Apple Pay when replying. PayPal and crypto details are likewise supplied manually; no payment credentials or destination addresses are invented or embedded in the site.

The admin Google identity must match `SHOP_ADMIN_EMAIL`. The previously noted Google-account registration/sign-in for the Zoho mailbox remains the owner's sign-in prerequisite. Order notifications and manual replies through Zoho do not require admin sign-in.
