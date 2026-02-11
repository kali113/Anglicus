CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email_hash TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  verification_code TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  auth_provider TEXT DEFAULT 'email',
  plan_type TEXT DEFAULT 'free',
  plan_expires_day INTEGER
);

CREATE TABLE usage (
  user_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day_number, feature)
);
