'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { PricingEngine } = require('../src/shared/pricing/engine');
const { calculateTurnCost, calculateCacheSavings } = require('../src/shared/pricing/formula');

const LEDGER_PATH = path.resolve(__dirname, '..', 'data', 'token_ledger.sqlite');
const USER_LEDGER_PATH = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config')),
  'Token Monitor',
  'token_ledger.sqlite'
);

const OPENCODE_DB_PATH = path.join(
  process.env.USERPROFILE || os.homedir(),
  '.local',
  'share',
  'opencode',
  'opencode.db'
);

console.log('=== OPENCODE INGESTION INTO TOKEN LEDGER ===');
console.log('OpenCode DB:', OPENCODE_DB_PATH);
console.log('Target Ledger:', LEDGER_PATH);

if (!fs.existsSync(OPENCODE_DB_PATH)) {
  console.error('OpenCode database not found at:', OPENCODE_DB_PATH);
  process.exit(1);
}

const openCodeDb = new DatabaseSync(OPENCODE_DB_PATH, { readOnly: true });
const ledgerDb = new DatabaseSync(LEDGER_PATH);

ledgerDb.exec('PRAGMA journal_mode = WAL;');
ledgerDb.exec('PRAGMA synchronous = NORMAL;');

const pricingEngine = new PricingEngine();

const msgs = openCodeDb.prepare(`
  SELECT id, session_id, time_created, data 
  FROM message 
  ORDER BY time_created ASC
`).all();

console.log(`Found ${msgs.length} total messages in OpenCode database.`);

ledgerDb.prepare(`
  INSERT OR IGNORE INTO ingestion_runs (run_id, source_kind, started_at_ms, completed_at_ms, turns_ingested, turns_skipped, status)
  VALUES (5, 'opencode_native_scan', ?, ?, 0, 0, 'success')
`).run(Date.now(), Date.now());

const insertTurnStmt = ledgerDb.prepare(`
  INSERT OR IGNORE INTO token_turns (
    natural_key, provider, session_id, request_id, file_id, ingestion_run_id,
    timestamp_ms, hour_bucket, date_bucket, model_codename, project_id,
    uncached_input, cached_input, cache_write, output_tokens, reasoning_tokens,
    processed_tokens, cache_savings_pct, cost_usd, pricing_status, source, coverage, dedupe_status
  ) VALUES (
    ?, 'opencode', ?, ?, NULL, 5,
    ?, ?, ?, ?, '',
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, 'opencode_scan', 'complete', 'unique'
  )
`);

ledgerDb.exec('BEGIN TRANSACTION;');

let inserted = 0;
let skipped = 0;
let totalTokens = 0;
let totalCost = 0;
const sessions = new Set();

for (const m of msgs) {
  let parsed;
  try {
    parsed = JSON.parse(m.data);
  } catch (_) {
    skipped++;
    continue;
  }

  if (!parsed || !parsed.tokens) {
    skipped++;
    continue;
  }

  const uncached = Number(parsed.tokens.input || 0);
  const cached = Number(parsed.tokens.cache?.read || 0);
  const write = Number(parsed.tokens.cache?.write || 0);
  const output = Number(parsed.tokens.output || 0);
  const reasoning = Number(parsed.tokens.reasoning || 0);
  const processed = Number(parsed.tokens.total || (uncached + cached + write + output));

  if (processed === 0 && uncached === 0 && output === 0) {
    skipped++;
    continue;
  }

  const model = String(parsed.modelID || 'unknown').trim();
  const ts = Number(m.time_created);
  const d = new Date(ts);
  const dateBucket = d.toISOString().slice(0, 10);
  const hourBucket = d.toISOString().slice(0, 13) + ':00:00.000Z';
  const naturalKey = `opencode:${m.session_id}:${m.id}`;

  const rates = pricingEngine.resolveRates(model);
  const turnUsage = {
    uncached_input: uncached,
    cached_input: cached,
    cache_write: write,
    output_tokens: output
  };

  let cost = rates ? calculateTurnCost(turnUsage, rates) : 0;
  let savings = 0;
  let pricingStatus = rates ? 'priced' : 'unknown';

  if (rates) {
    const s = calculateCacheSavings(turnUsage, rates);
    savings = s.savingsPct || 0;
  }

  const result = insertTurnStmt.run(
    naturalKey,
    m.session_id,
    m.id,
    ts,
    hourBucket,
    dateBucket,
    model,
    uncached,
    cached,
    write,
    output,
    reasoning,
    processed,
    savings,
    cost,
    pricingStatus
  );

  if (result.changes > 0) {
    inserted++;
    totalTokens += processed;
    totalCost += cost;
    sessions.add(m.session_id);
  } else {
    skipped++;
  }
}

console.log(`Ingested ${inserted} OpenCode turns across ${sessions.size} sessions (skipped: ${skipped}).`);
console.log(`Total tokens: ${(totalTokens / 1e9).toFixed(3)}B, Cost: $${totalCost.toFixed(2)}.`);

// Rebuilding Rollup Tables
console.log('Rebuilding materialized rollups in token_ledger.sqlite...');

const hasHistoricalThreads = Boolean(ledgerDb.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'historical_threads'"
).get());

const dailyHistoricalUnion = hasHistoricalThreads ? `
  UNION ALL
  SELECT 
    date_bucket, provider, COALESCE(model_codename, 'unknown') AS model_codename,
    COUNT(*) AS turn_count,
    SUM(total_tokens) AS total_uncached_in,
    0 AS total_cached_in,
    0 AS total_cache_write,
    0 AS total_output,
    0 AS total_reasoning,
    SUM(total_tokens) AS total_processed,
    0.0 AS total_known_cost_usd,
    COUNT(*) AS unknown_pricing_turn_count
  FROM historical_threads
  GROUP BY date_bucket, provider, model_codename
` : '';

// 1. hourly_usage
ledgerDb.exec('DELETE FROM hourly_usage;');
ledgerDb.exec(`
  INSERT INTO hourly_usage (
    hour_bucket, provider, model_codename, turn_count,
    total_uncached_in, total_cached_in, total_cache_write,
    total_output, total_reasoning, total_processed,
    total_known_cost_usd, unknown_pricing_turn_count, cache_savings_pct
  )
  SELECT 
    hour_bucket, provider, model_codename,
    COUNT(*) AS turn_count,
    SUM(uncached_input) AS total_uncached_in,
    SUM(cached_input) AS total_cached_in,
    SUM(cache_write) AS total_cache_write,
    SUM(output_tokens) AS total_output,
    SUM(reasoning_tokens) AS total_reasoning,
    SUM(processed_tokens) AS total_processed,
    ROUND(SUM(COALESCE(cost_usd, 0.0)), 6) AS total_known_cost_usd,
    SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
    CASE 
      WHEN SUM(uncached_input + cached_input) > 0 
      THEN ROUND(100.0 * SUM(cached_input) / SUM(uncached_input + cached_input), 2)
      ELSE 0.0 
    END AS cache_savings_pct
  FROM token_turns
  GROUP BY hour_bucket, provider, model_codename;
`);

// 2. daily_usage
ledgerDb.exec('DELETE FROM daily_usage;');
ledgerDb.exec(`
  INSERT INTO daily_usage (
    date_bucket, provider, model_codename, turn_count,
    total_uncached_in, total_cached_in, total_cache_write,
    total_output, total_reasoning, total_processed,
    total_known_cost_usd, unknown_pricing_turn_count, cache_savings_pct
  )
  SELECT 
    date_bucket, provider, model_codename,
    SUM(turn_count) AS turn_count,
    SUM(total_uncached_in) AS total_uncached_in,
    SUM(total_cached_in) AS total_cached_in,
    SUM(total_cache_write) AS total_cache_write,
    SUM(total_output) AS total_output,
    SUM(total_reasoning) AS total_reasoning,
    SUM(total_processed) AS total_processed,
    ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
    SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
    CASE 
      WHEN SUM(total_uncached_in + total_cached_in) > 0 
      THEN ROUND(100.0 * SUM(total_cached_in) / SUM(total_uncached_in + total_cached_in), 2)
      ELSE 0.0 
    END AS cache_savings_pct
  FROM (
    SELECT 
      date_bucket, provider, model_codename,
      COUNT(*) AS turn_count,
      SUM(uncached_input) AS total_uncached_in,
      SUM(cached_input) AS total_cached_in,
      SUM(cache_write) AS total_cache_write,
      SUM(output_tokens) AS total_output,
      SUM(reasoning_tokens) AS total_reasoning,
      SUM(processed_tokens) AS total_processed,
      COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
      SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count
    FROM token_turns
    GROUP BY date_bucket, provider, model_codename
    ${dailyHistoricalUnion}
  )
  GROUP BY date_bucket, provider, model_codename;
`);

// 3. provider_usage
const providerHistoricalUnion = hasHistoricalThreads ? `
  UNION ALL
  SELECT 
    provider,
    COUNT(*) AS turn_count,
    SUM(total_tokens) AS total_processed,
    0.0 AS total_known_cost_usd,
    COUNT(*) AS unknown_pricing_turn_count,
    MIN(created_at_ms) AS first_seen_ms,
    MAX(created_at_ms) AS last_seen_ms
  FROM historical_threads
  GROUP BY provider
` : '';

ledgerDb.exec('DELETE FROM provider_usage;');
ledgerDb.exec(`
  INSERT INTO provider_usage (
    provider, turn_count, total_processed,
    total_known_cost_usd, unknown_pricing_turn_count,
    first_seen_ms, last_seen_ms
  )
  SELECT 
    provider,
    SUM(turn_count) AS turn_count,
    SUM(total_processed) AS total_processed,
    ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
    SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
    MIN(first_seen_ms) AS first_seen_ms,
    MAX(last_seen_ms) AS last_seen_ms
  FROM (
    SELECT 
      provider,
      COUNT(*) AS turn_count,
      SUM(processed_tokens) AS total_processed,
      COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
      SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
      MIN(timestamp_ms) AS first_seen_ms,
      MAX(timestamp_ms) AS last_seen_ms
    FROM token_turns
    GROUP BY provider
    ${providerHistoricalUnion}
  )
  GROUP BY provider;
`);

// 4. model_usage
const modelHistoricalUnion = hasHistoricalThreads ? `
  UNION ALL
  SELECT 
    provider, COALESCE(model_codename, 'unknown') AS model_codename,
    COUNT(*) AS turn_count,
    SUM(total_tokens) AS total_processed,
    0.0 AS total_known_cost_usd,
    COUNT(*) AS unknown_pricing_turn_count,
    MIN(created_at_ms) AS first_seen_ms,
    MAX(created_at_ms) AS last_seen_ms
  FROM historical_threads
  GROUP BY provider, model_codename
` : '';

ledgerDb.exec('DELETE FROM model_usage;');
ledgerDb.exec(`
  INSERT INTO model_usage (
    provider, model_codename, turn_count, total_processed,
    total_known_cost_usd, unknown_pricing_turn_count,
    first_seen_ms, last_seen_ms
  )
  SELECT 
    provider, model_codename,
    SUM(turn_count) AS turn_count,
    SUM(total_processed) AS total_processed,
    ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
    SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
    MIN(first_seen_ms) AS first_seen_ms,
    MAX(last_seen_ms) AS last_seen_ms
  FROM (
    SELECT 
      provider, model_codename,
      COUNT(*) AS turn_count,
      SUM(processed_tokens) AS total_processed,
      COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
      SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
      MIN(timestamp_ms) AS first_seen_ms,
      MAX(timestamp_ms) AS last_seen_ms
    FROM token_turns
    GROUP BY provider, model_codename
    ${modelHistoricalUnion}
  )
  GROUP BY provider, model_codename;
`);

// 5. session_summaries
const sessionHistoricalUnion = hasHistoricalThreads ? `
  UNION ALL
  SELECT 
    provider,
    thread_id AS session_id,
    NULL AS project_id,
    title,
    1 AS turn_count,
    total_tokens AS total_processed,
    0.0 AS total_known_cost_usd,
    created_at_ms AS first_activity_ms,
    created_at_ms AS last_activity_ms,
    coverage
  FROM historical_threads
` : '';

ledgerDb.exec('DELETE FROM session_summaries;');
ledgerDb.exec(`
  INSERT INTO session_summaries (
    provider, session_id, project_id, title, turn_count,
    total_processed, total_known_cost_usd, first_activity_ms,
    last_activity_ms, coverage
  )
  SELECT 
    provider, session_id, project_id, title, turn_count,
    total_processed, total_known_cost_usd, first_activity_ms,
    last_activity_ms, coverage
  FROM (
    SELECT 
      provider,
      session_id,
      MAX(project_id) AS project_id,
      NULL AS title,
      COUNT(*) AS turn_count,
      SUM(processed_tokens) AS total_processed,
      ROUND(SUM(COALESCE(cost_usd, 0.0)), 6) AS total_known_cost_usd,
      MIN(timestamp_ms) AS first_activity_ms,
      MAX(timestamp_ms) AS last_activity_ms,
      MAX(coverage) AS coverage
    FROM token_turns
    GROUP BY provider, session_id
    ${sessionHistoricalUnion}
  );
`);

ledgerDb.exec('COMMIT;');

console.log('Ingestion committed successfully.');

// Sync to AppData if user database exists
if (fs.existsSync(USER_LEDGER_PATH)) {
  fs.copyFileSync(LEDGER_PATH, USER_LEDGER_PATH);
  console.log('Synced updated ledger to:', USER_LEDGER_PATH);
}
