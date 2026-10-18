'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { PricingEngine } = require('../../src/shared/pricing/engine');
const { calculateTurnCost, calculateCacheSavings } = require('../../src/shared/pricing/formula');
const { repriceLedger } = require('../../src/shared/pricing/ledgerRepricer');

test('standard 4-component cost formula computes exact cost', () => {
  const usage = {
    uncached_input: 10_000,
    cached_input: 40_000,
    cache_write: 5_000,
    output_tokens: 2_000
  };
  const rates = {
    inputCostPerToken: 2.00 / 1e6,      // $2.00 / 1M
    cacheReadCostPerToken: 0.10 / 1e6,  // $0.10 / 1M
    cacheWriteCostPerToken: 2.50 / 1e6, // $2.50 / 1M
    outputCostPerToken: 10.00 / 1e6     // $10.00 / 1M
  };

  // Expected:
  // uncached: 10,000 * 0.000002 = 0.02
  // cached: 40,000 * 0.0000001 = 0.004
  // cache_write: 5,000 * 0.0000025 = 0.0125
  // output: 2,000 * 0.00001 = 0.02
  // Total = 0.02 + 0.004 + 0.0125 + 0.02 = 0.0565
  const cost = calculateTurnCost(usage, rates);
  assert.equal(cost, 0.0565);
});

test('calculateCacheSavings computes savings USD and percentage correctly', () => {
  const usage = {
    uncached_input: 20_000,
    cached_input: 80_000
  };
  const rates = {
    inputCostPerToken: 2.00 / 1e6,
    cacheReadCostPerToken: 0.20 / 1e6
  };

  const savings = calculateCacheSavings(usage, rates);
  // Unit savings: (2.00 - 0.20) / 1e6 = 1.80 / 1e6
  // USD savings: 80,000 * 0.0000018 = 0.144
  // Pct: 80,000 / 100,000 * 100 = 80.00%
  assert.equal(savings.savingsUsd, 0.144);
  assert.equal(savings.savingsPct, 80.0);
});

test('PricingEngine resolves built-in offline rates for standard models', () => {
  const engine = new PricingEngine();

  const gemini = engine.resolveRates('gemini-3.8-flash');
  assert.ok(gemini);
  assert.equal(gemini.inputPerM, 0.75);
  assert.equal(gemini.outputPerM, 3.75);

  const luna = engine.resolveRates('gpt-5.6-luna');
  assert.ok(luna);
  assert.equal(luna.inputPerM, 0.20);
  assert.equal(luna.outputPerM, 1.20);
});

test('PricingEngine resolves muse-spark-1.3-contributor-free to commercial rates, not $0.00', () => {
  const engine = new PricingEngine();

  const muse = engine.resolveRates('muse-spark-1.3-contributor-free');
  assert.ok(muse);
  assert.equal(muse.inputPerM, 1.25);
  assert.equal(muse.outputPerM, 4.25);
  assert.equal(muse.cacheReadPerM, 0.15);
  assert.ok(muse.inputCostPerToken > 0);
});

test('PricingEngine respects user customModelPricing overrides', () => {
  const engine = new PricingEngine({
    customModelPricing: [
      {
        modelId: 'custom-special-model',
        inputCostPerMillion: 3.50,
        outputCostPerMillion: 12.00,
        cacheReadCostPerMillion: 0.35,
        cacheWriteCostPerMillion: 3.50
      }
    ]
  });

  const resolved = engine.resolveRates('custom-special-model');
  assert.ok(resolved);
  assert.equal(resolved.inputPerM, 3.50);
  assert.equal(resolved.outputPerM, 12.00);
  assert.equal(resolved.source, 'user_override');

  const turn = engine.priceTurn({
    uncached_input: 1_000_000,
    cached_input: 0,
    cache_write: 0,
    output_tokens: 1_000_000
  }, 'custom-special-model');

  assert.equal(turn.status, 'priced');
  assert.equal(turn.cost, 15.50);
});

test('repriceLedger prices unpriced turns and rebuilds rollups with historical_threads', () => {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE token_turns (
      turn_id INTEGER PRIMARY KEY AUTOINCREMENT,
      natural_key TEXT UNIQUE,
      provider TEXT,
      session_id TEXT,
      timestamp_ms INTEGER,
      hour_bucket TEXT,
      date_bucket TEXT,
      model_codename TEXT,
      project_id TEXT,
      uncached_input INTEGER DEFAULT 0,
      cached_input INTEGER DEFAULT 0,
      cache_write INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      processed_tokens INTEGER DEFAULT 0,
      cache_savings_pct REAL DEFAULT 0.0,
      cost_usd REAL,
      pricing_status TEXT DEFAULT 'unknown',
      coverage TEXT DEFAULT 'complete'
    );

    CREATE TABLE historical_threads (
      provider TEXT,
      thread_id TEXT PRIMARY KEY,
      title TEXT,
      model_codename TEXT,
      created_at_ms INTEGER,
      date_bucket TEXT,
      total_tokens INTEGER,
      source TEXT,
      coverage TEXT
    );

    CREATE TABLE model_catalog (
      provider TEXT,
      model_codename TEXT,
      display_name TEXT,
      input_cost_per_m REAL,
      cached_cost_per_m REAL,
      output_cost_per_m REAL,
      PRIMARY KEY (provider, model_codename)
    );

    CREATE TABLE hourly_usage (
      hour_bucket TEXT,
      provider TEXT,
      model_codename TEXT,
      turn_count INTEGER,
      total_uncached_in INTEGER,
      total_cached_in INTEGER,
      total_cache_write INTEGER,
      total_output INTEGER,
      total_reasoning INTEGER,
      total_processed INTEGER,
      total_known_cost_usd REAL,
      unknown_pricing_turn_count INTEGER,
      cache_savings_pct REAL,
      PRIMARY KEY (hour_bucket, provider, model_codename)
    );

    CREATE TABLE daily_usage (
      date_bucket TEXT,
      provider TEXT,
      model_codename TEXT,
      turn_count INTEGER,
      total_uncached_in INTEGER,
      total_cached_in INTEGER,
      total_cache_write INTEGER,
      total_output INTEGER,
      total_reasoning INTEGER,
      total_processed INTEGER,
      total_known_cost_usd REAL,
      unknown_pricing_turn_count INTEGER,
      cache_savings_pct REAL,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );

    CREATE TABLE provider_usage (
      provider TEXT PRIMARY KEY,
      turn_count INTEGER,
      total_processed INTEGER,
      total_known_cost_usd REAL,
      unknown_pricing_turn_count INTEGER,
      first_seen_ms INTEGER,
      last_seen_ms INTEGER
    );

    CREATE TABLE model_usage (
      provider TEXT,
      model_codename TEXT,
      turn_count INTEGER,
      total_processed INTEGER,
      total_known_cost_usd REAL,
      unknown_pricing_turn_count INTEGER,
      first_seen_ms INTEGER,
      last_seen_ms INTEGER,
      PRIMARY KEY (provider, model_codename)
    );

    CREATE TABLE session_summaries (
      provider TEXT,
      session_id TEXT,
      project_id TEXT,
      title TEXT,
      turn_count INTEGER,
      total_processed INTEGER,
      total_known_cost_usd REAL,
      first_activity_ms INTEGER,
      last_activity_ms INTEGER,
      coverage TEXT,
      PRIMARY KEY (provider, session_id)
    );
  `);

  // Insert test turns: 1M uncached + 1M output for gemini-3.8-flash ($0.75 + $3.75 = $4.50)
  db.prepare(`
    INSERT INTO token_turns (
      natural_key, provider, session_id, timestamp_ms, hour_bucket, date_bucket,
      model_codename, uncached_input, cached_input, cache_write, output_tokens,
      processed_tokens, cost_usd, pricing_status
    ) VALUES (
      'turn-1', 'antigravity', 'sess-1', 1780000000000, '2026-10-18T00:00:00.000Z', '2026-10-18',
      'gemini-3.8-flash', 1000000, 0, 0, 1000000, 2000000, NULL, 'unknown'
    )
  `).run();

  // Insert historical thread: 50,000 tokens
  db.prepare(`
    INSERT INTO historical_threads (
      provider, thread_id, model_codename, created_at_ms, date_bucket, total_tokens, source, coverage
    ) VALUES (
      'antigravity', 'hist-1', 'gemini-3.8-flash', 1770000000000, '2026-07-01', 50000, 'archive', 'thread_summary'
    )
  `).run();

  const engine = new PricingEngine();
  const res = repriceLedger(db, engine);
  assert.equal(res.repricedTurns, 1);

  const turn = db.prepare('SELECT cost_usd, pricing_status FROM token_turns WHERE natural_key = ?').get('turn-1');
  assert.equal(turn.pricing_status, 'priced');
  assert.equal(turn.cost_usd, 4.5);

  const prov = db.prepare('SELECT total_processed, total_known_cost_usd, turn_count FROM provider_usage').get();
  assert.equal(prov.turn_count, 2);
  assert.equal(prov.total_processed, 2050000); // 2M from turn + 50K from historical thread
  assert.equal(prov.total_known_cost_usd, 4.5);
});
