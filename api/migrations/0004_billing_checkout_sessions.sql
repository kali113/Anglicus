CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  address_index INTEGER NOT NULL UNIQUE,
  required_sats INTEGER NOT NULL,
  asset TEXT NOT NULL DEFAULT 'btc',
  network_key TEXT NOT NULL DEFAULT 'bitcoin',
  symbol TEXT NOT NULL DEFAULT 'sats',
  decimals INTEGER NOT NULL DEFAULT 0,
  required_amount_atomic TEXT NOT NULL DEFAULT '0',
  subscription_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  paid_sats INTEGER,
  paid_amount_atomic TEXT,
  tx_id TEXT,
  confirmations INTEGER,
  discount_source TEXT,
  token_contract TEXT,
  created_day INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_checked_at TEXT,
  confirmed_at TEXT,
  paid_until TEXT,
  reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_user_status
  ON billing_checkout_sessions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_expires_at
  ON billing_checkout_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_tx_id
  ON billing_checkout_sessions (tx_id);

CREATE TABLE IF NOT EXISTS billing_checkout_address_indices (
  pool_key TEXT PRIMARY KEY,
  next_index INTEGER NOT NULL
);
