-- Seqlyn Labs commerce data is server-only, outside Supabase's public API schema.
-- Safe to re-run on the same project. Never drops or replaces customer records.
BEGIN;
CREATE SCHEMA IF NOT EXISTS seqlyn;
REVOKE ALL ON SCHEMA seqlyn FROM PUBLIC;

CREATE TABLE IF NOT EXISTS seqlyn.product_settings (id TEXT PRIMARY KEY, price INTEGER NOT NULL CHECK(price>=0), stock INTEGER CHECK(stock>=0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
CREATE TABLE IF NOT EXISTS seqlyn.carts (id TEXT PRIMARY KEY, items TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text, coupon TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS seqlyn.orders (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, customer_id TEXT, email TEXT NOT NULL, shipping TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL CHECK(total>=0), status TEXT NOT NULL DEFAULT 'test', token_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text, subtotal INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, shipping_total INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, coupon TEXT NOT NULL DEFAULT '', fulfillment TEXT NOT NULL DEFAULT 'pending', carrier TEXT NOT NULL DEFAULT '', tracking TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', UNIQUE(cart_id,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_orders_customer ON seqlyn.orders(customer_id,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_created ON seqlyn.orders(fulfillment,created_at);
CREATE TABLE IF NOT EXISTS seqlyn.submissions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text);
CREATE TABLE IF NOT EXISTS seqlyn.request_limits (id TEXT PRIMARY KEY, "window" INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS seqlyn.customer_profiles (customer_id TEXT PRIMARY KEY, shipping TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS seqlyn.wishlist (customer_id TEXT NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY(customer_id,product_id));
CREATE TABLE IF NOT EXISTS seqlyn.coupons (code TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('percent','fixed')), amount INTEGER NOT NULL CHECK(amount>0), minimum INTEGER NOT NULL DEFAULT 0 CHECK(minimum>=0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), expires TEXT NOT NULL DEFAULT '', max_uses INTEGER NOT NULL DEFAULT 0 CHECK(max_uses>=0), uses INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS seqlyn.store_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seqlyn.order_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON seqlyn.order_events(order_id,created_at);
CREATE TABLE IF NOT EXISTS seqlyn.custom_products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seqlyn.schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);

ALTER TABLE seqlyn.product_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.custom_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE seqlyn.schema_migrations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE item TEXT;
BEGIN
  FOREACH item IN ARRAY ARRAY['product_settings','carts','orders','submissions','request_limits','customer_profiles','wishlist','coupons','store_settings','order_events','custom_products','schema_migrations'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM PUBLIC',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM anon',item);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE seqlyn.%I FROM authenticated',item);
    END IF;
  END LOOP;
END $$;
INSERT INTO seqlyn.schema_migrations(version) VALUES ('202610180001') ON CONFLICT DO NOTHING;
COMMIT;
