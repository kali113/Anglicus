CREATE TABLE IF NOT EXISTS analytics_web_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT,
  visitor_id TEXT,
  session_id TEXT,
  page_path TEXT,
  page_title TEXT,
  referrer_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  locale TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_web_events_time
  ON analytics_web_events (created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_web_events_event_time
  ON analytics_web_events (event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_web_events_user_time
  ON analytics_web_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_web_events_visitor_time
  ON analytics_web_events (visitor_id, created_at);
