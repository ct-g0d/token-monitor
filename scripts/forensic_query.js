'use strict';

const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('data/token_ledger.sqlite');

console.log('=== FORENSIC LEDGER ANALYSIS: data/token_ledger.sqlite ===\n');

// 1. Overall table counts
console.log('--- 1. TABLE ROW COUNTS ---');
for (const tbl of ['ingestion_runs', 'source_files', 'historical_threads', 'token_turns', 'daily_usage', 'provider_usage', 'model_usage', 'session_summaries']) {
  const c = db.prepare('SELECT count(*) as c FROM ' + tbl).get().c;
  console.log(`${tbl}: ${c}`);
}

// 2. Date ranges
console.log('\n--- 2. DATE RANGES ---');
const ttRange = db.prepare(`
  SELECT 
    MIN(date_bucket) as min_date, 
    MAX(date_bucket) as max_date, 
    MIN(timestamp_ms) as min_ts, 
    MAX(timestamp_ms) as max_ts,
    COUNT(*) as turn_count,
    COUNT(DISTINCT session_id) as session_count
  FROM token_turns
`).get();
console.log('token_turns date range:');
console.log(`  Min date: ${ttRange.min_date} (ts: ${ttRange.min_ts} => ${new Date(ttRange.min_ts).toISOString()})`);
console.log(`  Max date: ${ttRange.max_date} (ts: ${ttRange.max_ts} => ${new Date(ttRange.max_ts).toISOString()})`);
console.log(`  Total turns: ${ttRange.turn_count}, Total sessions: ${ttRange.session_count}`);

const htRange = db.prepare(`
  SELECT 
    MIN(date_bucket) as min_date, 
    MAX(date_bucket) as max_date, 
    MIN(created_at_ms) as min_ts, 
    MAX(created_at_ms) as max_ts,
    COUNT(*) as thread_count,
    SUM(total_tokens) as total_tokens
  FROM historical_threads
`).get();
console.log('historical_threads date range:');
console.log(`  Min date: ${htRange.min_date} (ts: ${htRange.min_ts} => ${new Date(htRange.min_ts).toISOString()})`);
console.log(`  Max date: ${htRange.max_date} (ts: ${htRange.max_ts} => ${new Date(htRange.max_ts).toISOString()})`);
console.log(`  Total threads: ${htRange.thread_count}, Total tokens: ${htRange.total_tokens}`);

// 3. All-time Totals
console.log('\n--- 3. ALL-TIME TOTALS IN LEDGER ---');
const ttAllTime = db.prepare(`
  SELECT 
    COUNT(*) as turn_count,
    COUNT(DISTINCT session_id) as session_count,
    SUM(processed_tokens) as total_processed,
    SUM(cached_input) as total_cached,
    SUM(uncached_input) as total_uncached,
    SUM(cache_write) as total_cache_write,
    SUM(output_tokens) as total_output,
    SUM(reasoning_tokens) as total_reasoning,
    SUM(cost_usd) as total_cost
  FROM token_turns
`).get();
console.log('token_turns all-time:');
console.log(`  Processed: ${ttAllTime.total_processed} (${(ttAllTime.total_processed / 1e9).toFixed(3)}B)`);
console.log(`  Cached: ${ttAllTime.total_cached} (${(ttAllTime.total_cached / 1e9).toFixed(3)}B)`);
console.log(`  Uncached: ${ttAllTime.total_uncached} (${(ttAllTime.total_uncached / 1e6).toFixed(1)}M)`);
console.log(`  Output: ${ttAllTime.total_output} (${(ttAllTime.total_output / 1e6).toFixed(1)}M)`);
console.log(`  Cost: $${ttAllTime.total_cost.toFixed(2)}`);
console.log(`  Turns: ${ttAllTime.turn_count}, Sessions: ${ttAllTime.session_count}`);

const puAllTime = db.prepare(`SELECT * FROM provider_usage`).all();
console.log('\nprovider_usage all-time table rows:');
for (const p of puAllTime) {
  console.log(`  Provider: ${p.provider}`);
  console.log(`    Processed tokens: ${p.total_processed} (${(p.total_processed / 1e9).toFixed(3)}B)`);
  console.log(`    Turn count: ${p.turn_count}`);
  console.log(`    Cost USD: $${p.total_known_cost_usd.toFixed(2)}`);
  console.log(`    First seen: ${new Date(p.first_seen_ms).toISOString()}`);
  console.log(`    Last seen: ${new Date(p.last_seen_ms).toISOString()}`);
}

const grandFromDaily = db.prepare(`SELECT SUM(total_processed) as tok, SUM(total_known_cost_usd) as cost, SUM(turn_count) as turns FROM daily_usage`).get();
console.log(`\nDaily usage sum: ${(grandFromDaily.tok / 1e9).toFixed(3)}B tokens, $${grandFromDaily.cost.toFixed(2)}, ${grandFromDaily.turns} turns`);

// 4. 30D Window: 2026-09-19 to 2026-10-18
console.log('\n--- 4. 30D WINDOW (2026-09-19 to 2026-10-18) ---');
const tt30D = db.prepare(`
  SELECT 
    COUNT(*) as turn_count,
    COUNT(DISTINCT session_id) as session_count,
    SUM(processed_tokens) as total_processed,
    SUM(cached_input) as total_cached,
    SUM(uncached_input) as total_uncached,
    SUM(cache_write) as total_cache_write,
    SUM(output_tokens) as total_output,
    SUM(reasoning_tokens) as total_reasoning,
    SUM(cost_usd) as total_cost
  FROM token_turns
  WHERE date_bucket >= '2026-09-19' AND date_bucket <= '2026-10-18'
`).get();
console.log('token_turns 30D overall:');
console.log(`  Processed: ${tt30D.total_processed} (${(tt30D.total_processed / 1e9).toFixed(3)}B)`);
console.log(`  Cached: ${tt30D.total_cached} (${(tt30D.total_cached / 1e9).toFixed(3)}B)`);
console.log(`  Uncached: ${tt30D.total_uncached} (${(tt30D.total_uncached / 1e6).toFixed(1)}M)`);
console.log(`  Output: ${tt30D.total_output} (${(tt30D.total_output / 1e6).toFixed(1)}M)`);
console.log(`  Cost: $${tt30D.total_cost.toFixed(2)}`);
console.log(`  Turns: ${tt30D.turn_count}, Sessions: ${tt30D.session_count}`);

console.log('\n30D by Provider in token_turns:');
const prov30D = db.prepare(`
  SELECT 
    provider,
    COUNT(*) as turn_count,
    COUNT(DISTINCT session_id) as session_count,
    SUM(processed_tokens) as total_processed,
    SUM(cached_input) as total_cached,
    SUM(uncached_input) as total_uncached,
    SUM(output_tokens) as total_output,
    SUM(reasoning_tokens) as total_reasoning,
    SUM(cost_usd) as total_cost
  FROM token_turns
  WHERE date_bucket >= '2026-09-19' AND date_bucket <= '2026-10-18'
  GROUP BY provider
`).all();
for (const p of prov30D) {
  console.log(`  Provider: ${p.provider}`);
  console.log(`    Processed: ${p.total_processed} (${(p.total_processed / 1e9).toFixed(3)}B)`);
  console.log(`    Cached: ${p.total_cached} (${(p.total_cached / 1e9).toFixed(3)}B)`);
  console.log(`    Uncached: ${p.total_uncached} (${(p.total_uncached / 1e6).toFixed(1)}M)`);
  console.log(`    Output: ${p.total_output} (${(p.total_output / 1e6).toFixed(1)}M)`);
  console.log(`    Cost: $${p.total_cost.toFixed(2)}`);
  console.log(`    Turns: ${p.turn_count}, Sessions: ${p.session_count}`);
}

console.log('\n30D by Model in token_turns (sorted by processed desc):');
const model30D = db.prepare(`
  SELECT 
    provider,
    model_codename,
    COUNT(*) as turn_count,
    SUM(processed_tokens) as total_processed,
    SUM(cached_input) as total_cached,
    SUM(uncached_input) as total_uncached,
    SUM(output_tokens) as total_output,
    SUM(cost_usd) as total_cost
  FROM token_turns
  WHERE date_bucket >= '2026-09-19' AND date_bucket <= '2026-10-18'
  GROUP BY provider, model_codename
  ORDER BY total_processed DESC
`).all();
for (const m of model30D) {
  console.log(`  ${m.provider} / ${m.model_codename}: ${m.total_processed.toLocaleString()} (${(m.total_processed / 1e9).toFixed(3)}B / ${(m.total_processed / 1e6).toFixed(1)}M), Cached: ${(m.total_cached / 1e6).toFixed(1)}M, Uncached: ${(m.total_uncached / 1e6).toFixed(1)}M, Out: ${(m.total_output / 1e6).toFixed(1)}M, Cost: $${(m.total_cost || 0).toFixed(2)}, Turns: ${m.turn_count}`);
}

// 5. Total sessions per provider in entire database
console.log('\n--- 5. TOTAL SESSIONS PER PROVIDER IN DATABASE ---');
const sessPerProv = db.prepare(`
  SELECT provider, COUNT(DISTINCT session_id) as session_count, COUNT(*) as turn_count, SUM(processed_tokens) as total_tokens
  FROM token_turns
  GROUP BY provider
`).all();
for (const sp of sessPerProv) {
  console.log(`  ${sp.provider}: ${sp.session_count} sessions, ${sp.turn_count} turns, ${(sp.total_tokens / 1e9).toFixed(3)}B tokens`);
}
const sessSummaryCount = db.prepare(`
  SELECT provider, COUNT(*) as count, SUM(total_processed) as total_tokens
  FROM session_summaries
  GROUP BY provider
`).all();
console.log('In session_summaries table:');
for (const sc of sessSummaryCount) {
  console.log(`  ${sc.provider}: ${sc.count} sessions, ${(sc.total_tokens / 1e9).toFixed(3)}B tokens`);
}

// 6. Newest turn in token_turns
console.log('\n--- 6. NEWEST TURN IN token_turns ---');
const newestTurn = db.prepare(`
  SELECT turn_id, natural_key, provider, session_id, timestamp_ms, date_bucket, hour_bucket, model_codename, processed_tokens, cost_usd
  FROM token_turns
  ORDER BY timestamp_ms DESC
  LIMIT 5
`).all();
for (const nt of newestTurn) {
  console.log(`  Turn #${nt.turn_id}: ${nt.provider} (${nt.model_codename}), ts: ${nt.timestamp_ms} => ${new Date(nt.timestamp_ms).toISOString()}, date: ${nt.date_bucket}, tokens: ${nt.processed_tokens}, session: ${nt.session_id}`);
}
