'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const os = require('node:os');

const dbPath = path.join(process.env.USERPROFILE || os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const db = new DatabaseSync(dbPath, { readOnly: true });

const startMs = new Date('2026-09-19T00:00:00Z').getTime();
const endMs = new Date('2026-10-18T23:59:59.999Z').getTime();

const msgs = db.prepare(`SELECT id, session_id, time_created, data FROM message`).all();

let count = 0;
let totalTokens = 0;
let cachedTokens = 0;
let uncachedTokens = 0;
let outputTokens = 0;
let reasoningTokens = 0;
let costUsd = 0;
const sessions = new Set();
const models = {};

for (const m of msgs) {
  if (m.time_created < startMs || m.time_created > endMs) continue;
  let parsed;
  try {
    parsed = JSON.parse(m.data);
  } catch (_) {
    continue;
  }
  if (!parsed.tokens) continue;

  const tok = parsed.tokens.total || 0;
  if (tok === 0 && !parsed.tokens.input) continue;

  const inp = parsed.tokens.input || 0;
  const out = parsed.tokens.output || 0;
  const rea = parsed.tokens.reasoning || 0;
  const read = parsed.tokens.cache?.read || 0;
  const write = parsed.tokens.cache?.write || 0;
  const cost = parsed.cost || 0;
  const model = parsed.modelID || 'unknown';

  count++;
  totalTokens += (inp + read + write + out);
  cachedTokens += read;
  uncachedTokens += inp;
  outputTokens += out;
  reasoningTokens += rea;
  costUsd += cost;
  sessions.add(m.session_id);

  if (!models[model]) {
    models[model] = { count: 0, total: 0, cached: 0, uncached: 0, output: 0, cost: 0 };
  }
  models[model].count++;
  models[model].total += (inp + read + write + out);
  models[model].cached += read;
  models[model].uncached += inp;
  models[model].output += out;
  models[model].cost += cost;
}

console.log('=== OPENCODE MESSAGE-LEVEL ANALYSIS (2026-09-19 to 2026-10-18) ===');
console.log(`Assistant turns: ${count}`);
console.log(`Unique sessions: ${sessions.size}`);
console.log(`Total processed: ${totalTokens} (${(totalTokens / 1e9).toFixed(3)}B)`);
console.log(`Cached input:    ${cachedTokens} (${(cachedTokens / 1e9).toFixed(3)}B)`);
console.log(`Uncached input:  ${uncachedTokens} (${(uncachedTokens / 1e6).toFixed(1)}M)`);
console.log(`Output tokens:   ${outputTokens} (${(outputTokens / 1e6).toFixed(1)}M)`);
console.log(`Reasoning:       ${reasoningTokens} (${(reasoningTokens / 1e6).toFixed(1)}M)`);
console.log(`Cost USD:        $${costUsd.toFixed(2)}`);

console.log('\nBy model:');
const sorted = Object.entries(models).sort((a, b) => b[1].total - a[1].total);
for (const [mod, data] of sorted) {
  console.log(`  ${mod}: ${data.total.toLocaleString()} (${(data.total / 1e6).toFixed(1)}M), turns: ${data.count}`);
}
