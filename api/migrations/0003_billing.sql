CREATE TABLE IF NOT EXISTS billing_tx_claims (
  tx_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  claimed_day INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_tx_claims_user_id
  ON billing_tx_claims (user_id);
