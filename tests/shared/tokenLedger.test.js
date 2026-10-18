'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { createTokenLedgerStore, periodFromDays } = require('../../src/shared/usage/tokenLedger');

function tempLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-'));
  const file = path.join(dir, 'token_ledger.sqlite');
  return { dir, file };
}

test('ledger history overlays a live day without double counting the base rollup', () => {
  const fixture = tempLedger();
  const db = new DatabaseSync(fixture.file);
  db.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-16', 'claude', 'opus', 2, 0, 0, 0, 0, 0, 20, 3.5, 0, 0);
    INSERT INTO daily_usage VALUES ('2026-10-15', 'codex', 'gpt', 1, 0, 0, 0, 0, 0, 10, 0, 1, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  const overlay = {
    daily: [{
      date: '2026-10-16', tokens: 7, cost: 1, messages: 1,
      perClient: { claude: { tokens: 7, cost: 1, messages: 1 } },
      perModel: { opus: { tokens: 7, cost: 1, messages: 1 } }
    }]
  };
  const history = store.readHistory({ overlayHistory: overlay });

  assert.deepEqual(history.daily.map((row) => [row.date, row.tokens]), [
    ['2026-10-15', 10],
    ['2026-10-16', 7]
  ]);
  assert.equal(history.summary.totalTokens, 17);
  assert.equal(history.daily[1].perClient.claude.tokens, 7);
  const periods = store.readPeriods({ overlayHistory: overlay });
  assert.equal(periods.allTime.totalTokens, 17);
  assert.equal(periods.month.totalTokens, 17);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger drops DSH from mixed historical overlay rows', () => {
  const fixture = tempLedger();
  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  store.writeHistory({ daily: [] });
  const history = store.readHistory({ overlayHistory: {
    daily: [{
      date: '2026-10-17',
      tokens: 150,
      cost: 1.5,
      perClient: {
        dsh: { tokens: 100, cost: 1 },
        codex: { tokens: 50, cost: 0.5 }
      },
      perModel: {
        'gpt-6.1-sol': { tokens: 150, cost: 1.5 }
      }
    }]
  } });

  assert.equal(history.summary.totalTokens, 50);
  assert.equal(history.daily[0].perClient.dsh, undefined);
  assert.equal(history.daily[0].perClient.codex.tokens, 50);
  assert.deepEqual(history.daily[0].perModel, {});
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger store writes runtime history in one transaction', () => {
  const fixture = tempLedger();
  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  assert.equal(store.writeHistory({
    daily: [{
      date: '2026-10-17', tokens: 12, cost: 0,
      perClient: { codex: { tokens: 12 } },
      perModel: { 'gpt-5.6-sol': { tokens: 12 } }
    }]
  }), true);
  const history = store.readHistory();
  assert.equal(history.summary.totalTokens, 12);
  assert.equal(history.daily[0].perModel['gpt-5.6-sol'].tokens, 12);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger copies the local packaged seed when the user ledger is absent', () => {
  const fixture = tempLedger();
  const seedPath = path.join(fixture.dir, 'token_ledger.seed.sqlite');
  const seed = new DatabaseSync(seedPath);
  seed.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-17', 'codex', 'gpt-6.1-sol', 2, 400, 600, 0, 100, 0, 1_100, 0, 0, 60);
  `);
  seed.close();

  const store = createTokenLedgerStore({
    path: fixture.file,
    homeDir: fixture.dir,
    seedPath
  });
  const history = store.readHistory();

  assert.equal(history.summary.totalTokens, 1_100);
  assert.equal(history.daily[0].perClient.codex.tokens, 1_100);
  assert.equal(history.daily[0].perModel['gpt-6.1-sol'].tokens, 1_100);
  assert.equal(fs.existsSync(fixture.file), true);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger upgrades existing user db when user tokens are fewer than the seed or rows are missing', () => {
  const fixture = tempLedger();
  const seedPath = path.join(fixture.dir, 'token_ledger.seed.sqlite');
  const seed = new DatabaseSync(seedPath);
  seed.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-15', 'claude', 'opus', 5, 0, 0, 0, 0, 0, 500, 2.5, 0, 0);
    INSERT INTO daily_usage VALUES ('2026-10-16', 'codex', 'gpt-6.1-sol', 10, 0, 0, 0, 0, 0, 1_000, 0, 0, 0);
  `);
  seed.close();

  const userDb = new DatabaseSync(fixture.file);
  userDb.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-14', 'claude', 'haiku', 1, 0, 0, 0, 0, 0, 50, 0.1, 0, 0);
    INSERT INTO daily_usage VALUES ('2026-10-15', 'claude', 'opus', 1, 0, 0, 0, 0, 0, 100, 0.5, 0, 0);
  `);
  userDb.close();

  const store = createTokenLedgerStore({
    path: fixture.file,
    homeDir: fixture.dir,
    seedPath
  });
  const history = store.readHistory();

  assert.equal(history.summary.totalTokens, 1_550);
  assert.deepEqual(history.daily.map((row) => [row.date, row.tokens]), [
    ['2026-10-14', 50],
    ['2026-10-15', 500],
    ['2026-10-16', 1_000]
  ]);
  assert.equal(history.daily[1].perClient.claude.tokens, 500);
  assert.equal(history.daily[2].perClient.codex.tokens, 1_000);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger recovers cleanly from empty or corrupt user databases using packaged seed', () => {
  const fixture = tempLedger();
  const seedPath = path.join(fixture.dir, 'token_ledger.seed.sqlite');
  const seed = new DatabaseSync(seedPath);
  seed.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-17', 'codex', 'gpt-6.1-sol', 2, 400, 600, 0, 100, 0, 1_100, 0, 0, 60);
  `);
  seed.close();

  // Case 1: Empty (0-byte) user database
  fs.writeFileSync(fixture.file, '');
  const emptyStore = createTokenLedgerStore({
    path: fixture.file,
    homeDir: fixture.dir,
    seedPath
  });
  assert.equal(emptyStore.available(), true);
  const emptyHistory = emptyStore.readHistory();
  assert.equal(emptyHistory.summary.totalTokens, 1_100);
  emptyStore.close();

  // Case 2: Corrupted file
  fs.writeFileSync(fixture.file, 'corrupted binary data not sqlite');
  const corruptStore = createTokenLedgerStore({
    path: fixture.file,
    homeDir: fixture.dir,
    seedPath
  });
  assert.equal(corruptStore.available(), true);
  const corruptHistory = corruptStore.readHistory();
  assert.equal(corruptHistory.summary.totalTokens, 1_100);
  corruptStore.close();

  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('ledger preserves higher local token count when user database has more tokens than seed', () => {
  const fixture = tempLedger();
  const seedPath = path.join(fixture.dir, 'token_ledger.seed.sqlite');
  const seed = new DatabaseSync(seedPath);
  seed.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-15', 'claude', 'opus', 2, 0, 0, 0, 0, 0, 200, 1.0, 0, 0);
  `);
  seed.close();

  const userDb = new DatabaseSync(fixture.file);
  userDb.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-10-15', 'claude', 'opus', 10, 0, 0, 0, 0, 0, 1_000, 5.0, 0, 0);
  `);
  userDb.close();

  const store = createTokenLedgerStore({
    path: fixture.file,
    homeDir: fixture.dir,
    seedPath
  });
  const history = store.readHistory();
  assert.equal(history.summary.totalTokens, 1_000);
  assert.equal(history.daily[0].perModel.opus.tokens, 1_000);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('periodFromDays aggregates unpricedTokens and builds clientModels', () => {
  const days = [
    {
      date: '2026-10-14',
      tokens: 100,
      cost: 0,
      messages: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 20,
      unclassifiedTokens: 0,
      unpricedTokens: 100,
      perClient: { codex: { tokens: 100, cost: 0, messages: 2, unpricedTokens: 100 } },
      perModel: { 'gpt-5.6-sol': { tokens: 100, cost: 0, messages: 2, unpricedTokens: 100 } },
      clientModels: { codex: { 'gpt-5.6-sol': 100 } }
    },
    {
      date: '2026-10-15',
      tokens: 250,
      cost: 1.5,
      messages: 5,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
      outputTokens: 40,
      unclassifiedTokens: 0,
      unpricedTokens: 50,
      perClient: {
        codex: { tokens: 150, cost: 1.0, messages: 3, unpricedTokens: 50 },
        claude: { tokens: 100, cost: 0.5, messages: 2 }
      },
      perModel: {
        'gpt-5.6-sol': { tokens: 150, cost: 1.0, messages: 3, unpricedTokens: 50 },
        'claude-sonnet-4': { tokens: 100, cost: 0.5, messages: 2 }
      },
      clientModels: {
        codex: { 'gpt-5.6-sol': 150 },
        claude: { 'claude-sonnet-4': 100 }
      }
    }
  ];

  const period = periodFromDays(days);
  assert.equal(period.totalTokens, 350);
  assert.equal(period.costUsd, 1.5);
  assert.equal(period.unpricedTokens, 150);
  assert.ok(period.clientModels && typeof period.clientModels === 'object');
  assert.equal(period.clientModels.codex['gpt-5.6-sol'], 250);
  assert.equal(period.clientModels.claude['claude-sonnet-4'], 100);
});

test('readPeriods produces complete unpricedTokens and clientModels from historical ledger', () => {
  const fixture = tempLedger();
  const db = new DatabaseSync(fixture.file);
  db.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-08-01', 'codex', 'gpt-5.6-luna', 500, 0, 0, 0, 0, 0, 8541313195, 0, 500, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  const periods = store.readPeriods();

  assert.equal(periods.allTime.totalTokens, 8541313195);
  assert.equal(periods.allTime.unpricedTokens, 8541313195);
  assert.equal(periods.allTime.costUsd, 0);
  assert.equal(periods.allTime.clientModels.codex['gpt-5.6-luna'], 8541313195);

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readPeriods folds Gemini 3.8 routing suffixes into one model without changing the total', () => {
  const fixture = tempLedger();
  const db = new DatabaseSync(fixture.file);
  db.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES
      ('2026-10-16', 'antigravity', 'gemini-3.8-flash', 1, 0, 0, 0, 0, 0, 100, 0, 0, 0),
      ('2026-10-16', 'antigravity', 'gemini-3.8-flash-tiered', 1, 0, 0, 0, 0, 0, 200, 0, 0, 0),
      ('2026-10-16', 'antigravity', 'gemini-3.8-flash-n', 1, 0, 0, 0, 0, 0, 300, 0, 0, 0),
      ('2026-10-16', 'antigravity', 'gemini-3.8-flash-high', 1, 0, 0, 0, 0, 0, 400, 0, 0, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  const period = store.readPeriods().allTime;
  assert.equal(period.totalTokens, 1_000);
  assert.equal(period.models['gemini-3.8-flash'], 1_000);
  assert.equal(Object.keys(period.models).filter((model) => model.startsWith('gemini-3.8-flash-')).length, 0);
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readPeriods preserves accurate active session archive cost and clientCosts when basePeriods/activePeriods is passed', () => {
  const fixture = tempLedger();
  const db = new DatabaseSync(fixture.file);
  db.exec(`
    CREATE TABLE daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
    INSERT INTO daily_usage VALUES ('2026-08-01', 'codex', 'gpt-5.6-luna', 10, 0, 0, 0, 0, 0, 1000, 0, 10, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });

  // 1. With basePeriods
  const periodsWithBase = store.readPeriods({
    basePeriods: {
      allTime: {
        costUsd: 48.75,
        clientCosts: { codex: 35.50, claude: 13.25 },
        clientModels: { claude: { opus: 200 } }
      }
    }
  });

  assert.equal(periodsWithBase.allTime.costUsd, 48.75);
  assert.equal(periodsWithBase.allTime.clientCosts.codex, 35.50);
  assert.equal(periodsWithBase.allTime.clientCosts.claude, 13.25);
  assert.equal(periodsWithBase.allTime.clientModels.codex['gpt-5.6-luna'], 1000);
  assert.equal(periodsWithBase.allTime.clientModels.claude.opus, 200);
  assert.equal(periodsWithBase.allTime.unpricedTokens, 1000);

  // 2. With activePeriods
  const periodsWithActive = store.readPeriods({
    activePeriods: {
      allTime: {
        costUsd: 55.20,
        clientCosts: { codex: 55.20 }
      }
    }
  });
  assert.equal(periodsWithActive.allTime.costUsd, 55.20);
  assert.equal(periodsWithActive.allTime.clientCosts.codex, 55.20);

  // 3. With basePeriod
  const periodsWithSingleBase = store.readPeriods({
    basePeriod: {
      costUsd: 62.10,
      clientCosts: { codex: 62.10 }
    }
  });
  assert.equal(periodsWithSingleBase.allTime.costUsd, 62.10);
  assert.equal(periodsWithSingleBase.allTime.clientCosts.codex, 62.10);

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});
