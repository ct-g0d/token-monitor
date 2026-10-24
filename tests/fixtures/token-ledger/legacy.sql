CREATE TABLE ingestion_runs (run_id INTEGER PRIMARY KEY);
CREATE TABLE source_files (file_id INTEGER PRIMARY KEY);
-- Minimal pre-v2 ledger used by migration tests.
CREATE TABLE token_turns (
  turn_id INTEGER PRIMARY KEY AUTOINCREMENT,
  natural_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_id TEXT,
  timestamp_ms INTEGER NOT NULL,
  date_bucket TEXT NOT NULL,
  model_codename TEXT NOT NULL,
  uncached_input INTEGER NOT NULL DEFAULT 0,
  cached_input INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  processed_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  source TEXT NOT NULL,
  coverage TEXT NOT NULL
);
INSERT INTO token_turns (natural_key, provider, session_id, timestamp_ms, date_bucket, model_codename, processed_tokens, source, coverage)
VALUES ('fixture-turn-1', 'codex', 'fixture-session', 1780000000000, '2026-06-01', 'gpt-5', 42, 'fixture', 'complete');
