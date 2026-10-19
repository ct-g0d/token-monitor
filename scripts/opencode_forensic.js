'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const os = require('node:os');

const dbPath = path.join(process.env.USERPROFILE || os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const db = new DatabaseSync(dbPath, { readOnly: true });

console.log('=== OPENCODE DATABASE FORENSICS ===');
console.log('Path:', dbPath);

const allSess = db.prepare('SELECT count(*) as c, MIN(time_created) as min_ts, MAX(time_created) as max_ts FROM session').get();
console.log('All session count:', allSess.c);
console.log('Min ts:', new Date(allSess.min_ts).toISOString());
console.log('Max ts:', new Date(allSess.max_ts).toISOString());

const startMs = new Date('2026-09-19T00:00:00Z').getTime();
const endMs = new Date('2026-10-18T23:59:59.999Z').getTime();

const s30 = db.prepare(`
  SELECT 
    COUNT(*) as session_count,
    SUM(tokens_input) as input,
    SUM(tokens_cache_read) as cached,
    SUM(tokens_cache_write) as cache_write,
    SUM(tokens_output) as output,
    SUM(tokens_reasoning) as reasoning,
    SUM(tokens_input + tokens_cache_read + tokens_cache_write + tokens_output) as total,
    SUM(cost) as cost
  FROM session
  WHERE time_created >= ? AND time_created <= ?
`).get(startMs, endMs);

console.log('\nOpenCode 30D (2026-09-19 to 2026-10-18):');
console.log(`  Sessions: ${s30.session_count}`);
console.log(`  Total tokens: ${s30.total} (${(s30.total / 1e9).toFixed(3)}B)`);
console.log(`  Cached tokens: ${s30.cached} (${(s30.cached / 1e9).toFixed(3)}B)`);
console.log(`  Input tokens: ${s30.input} (${(s30.input / 1e6).toFixed(1)}M)`);
console.log(`  Output tokens: ${s30.output} (${(s30.output / 1e6).toFixed(1)}M)`);
console.log(`  Reasoning tokens: ${s30.reasoning} (${(s30.reasoning / 1e6).toFixed(1)}M)`);
console.log(`  Cost USD: $${s30.cost.toFixed(2)}`);

const s30Updated = db.prepare(`
  SELECT 
    COUNT(*) as session_count,
    SUM(tokens_input + tokens_cache_read + tokens_cache_write + tokens_output) as total
  FROM session
  WHERE time_updated >= ? AND time_updated <= ?
`).get(startMs, endMs);
console.log(`\nFiltered by time_updated: ${s30Updated.session_count} sessions, ${(s30Updated.total / 1e9).toFixed(3)}B tokens`);

// By model in OpenCode
const m30 = db.prepare(`
  SELECT 
    model,
    COUNT(*) as session_count,
    SUM(tokens_input + tokens_cache_read + tokens_cache_write + tokens_output) as total,
    SUM(tokens_cache_read) as cached,
    SUM(tokens_input) as input,
    SUM(tokens_output) as output,
    SUM(cost) as cost
  FROM session
  WHERE time_created >= ? AND time_created <= ?
  GROUP BY model
  ORDER BY total DESC
`).all(startMs, endMs);

console.log('\nOpenCode 30D by model:');
for (const m of m30) {
  console.log(`  ${m.model}: ${m.session_count} sessions, ${(m.total / 1e6).toFixed(1)}M tokens (${(m.total / 1e9).toFixed(3)}B), Cached: ${(m.cached / 1e6).toFixed(1)}M, In: ${(m.input / 1e6).toFixed(1)}M, Out: ${(m.output / 1e6).toFixed(1)}M, Cost: $${m.cost.toFixed(2)}`);
}

// All time total in OpenCode
const sAll = db.prepare(`
  SELECT 
    COUNT(*) as session_count,
    SUM(tokens_input + tokens_cache_read + tokens_cache_write + tokens_output) as total,
    SUM(tokens_cache_read) as cached,
    SUM(tokens_input) as input,
    SUM(tokens_output) as output,
    SUM(cost) as cost
  FROM session
`).get();

console.log('\nOpenCode All-time:');
console.log(`  Sessions: ${sAll.session_count}`);
console.log(`  Total tokens: ${sAll.total} (${(sAll.total / 1e9).toFixed(3)}B)`);
console.log(`  Cost USD: $${sAll.cost.toFixed(2)}`);
