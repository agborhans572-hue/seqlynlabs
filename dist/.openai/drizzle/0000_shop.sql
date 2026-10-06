CREATE TABLE product_settings (id TEXT PRIMARY KEY, price INTEGER NOT NULL CHECK(price >= 0), stock INTEGER CHECK(stock >= 0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE carts (id TEXT PRIMARY KEY, items TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE orders (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, customer_id TEXT, email TEXT NOT NULL, shipping TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL CHECK(total >= 0), status TEXT NOT NULL DEFAULT 'test', token_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(cart_id,idempotency_key));
CREATE INDEX idx_orders_customer ON orders(customer_id,created_at);
CREATE TABLE submissions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
