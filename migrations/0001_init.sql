CREATE TABLE IF NOT EXISTS stamp_requests (
  request_id TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  status TEXT NOT NULL,
  signature TEXT,
  signed_tx_base64 TEXT,
  last_valid_block_height INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stamp_requests_expires_at
  ON stamp_requests(expires_at);

CREATE TABLE IF NOT EXISTS daily_budget (
  day TEXT PRIMARY KEY,
  tx_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rate_buckets (
  bucket TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_buckets_expires_at
  ON rate_buckets(expires_at);
