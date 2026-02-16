CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON analytics_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_event
  ON analytics_events (user_id, event_name);

CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  identifier TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, identifier, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_window
  ON rate_limits (scope, window_start);
