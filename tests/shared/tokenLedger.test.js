'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { createTokenLedgerStore, periodFromDays, resolveTokenLedgerPath } = require('../../src/shared/usage/tokenLedger');

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

test('ledger folds reasoning into output when reconstructing token components', () => {
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
    INSERT INTO daily_usage VALUES ('2026-08-01', 'codex', 'gpt-6.1-sol', 1, 100, 700, 0, 50, 25, 875, 1, 0, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  const day = store.readHistory().daily[0];
  assert.equal(day.tokens, 875);
  assert.equal(day.cacheReadTokens, 700);
  assert.equal(day.outputTokens, 75);
  assert.equal(day.unclassifiedTokens, 0);
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

test('readPeriods preserves throughput counters from the live period', () => {
  const fixture = tempLedger();
  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  store.writeHistory({ daily: [] });
  const periods = store.readPeriods({
    basePeriods: {
      today: {
        capabilities: { throughput: true },
        timedTokens: 1200,
        timedOutputTokens: 240,
        timedDurationMs: 6000,
        modelThroughput: {
          'gpt-6.1-sol': { timedTokens: 1200, timedOutputTokens: 240, timedDurationMs: 6000 }
        }
      }
    }
  });

  assert.equal(periods.today.timedTokens, 1200);
  assert.equal(periods.today.timedOutputTokens, 240);
  assert.equal(periods.today.timedDurationMs, 6000);
  assert.deepEqual(periods.today.modelThroughput['gpt-6.1-sol'], {
    timedTokens: 1200, timedOutputTokens: 240, timedDurationMs: 6000
  });
  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readHistory includes collector archive overlay when ledger stops in the past', () => {
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
    INSERT INTO daily_usage VALUES ('2026-10-18', 'codex', 'gpt-5.6-sol', 1, 0, 0, 0, 0, 0, 100, 1.0, 0, 0);
  `);
  db.close();

  const archivePath = path.join(fixture.dir, 'daily-history-archive.json');
  fs.writeFileSync(archivePath, JSON.stringify({
    version: 1,
    days: {
      '2026-10-19': {
        date: '2026-10-19',
        observations: {
          '["claude","claude-3-7-sonnet"]': { tokens: 250, cost: 2.5, messages: 2 }
        }
      }
    },
    liveDays: {}
  }));

  const store = createTokenLedgerStore({ path: fixture.file, archivePath });
  const history = store.readHistory();
  assert.equal(history.daily.length, 2);
  assert.equal(history.daily[0].date, '2026-10-18');
  assert.equal(history.daily[1].date, '2026-10-19');
  assert.equal(history.daily[1].tokens, 250);
  assert.equal(history.summary.totalTokens, 350);

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readPeriods populates today tokens and breakdown from basePeriods when today is missing from historical daily_usage', () => {
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
    INSERT INTO daily_usage VALUES ('2026-10-18', 'codex', 'gpt-5.6-sol', 1, 0, 0, 0, 0, 0, 100, 1.0, 0, 0);
  `);
  db.close();

  const store = createTokenLedgerStore({ path: fixture.file, homeDir: fixture.dir });
  const periods = store.readPeriods({
    basePeriods: {
      today: {
        totalTokens: 50000,
        costUsd: 12.50,
        outputTokens: 5000,
        cacheReadTokens: 40000,
        clients: { claude: 50000 },
        models: { 'claude-3-7-sonnet': 50000 }
      }
    }
  });

  assert.equal(periods.today.totalTokens, 50000);
  assert.equal(periods.today.costUsd, 12.50);
  assert.equal(periods.today.outputTokens, 5000);
  assert.equal(periods.today.cacheReadTokens, 40000);
  assert.equal(periods.today.clients.claude, 50000);
  assert.equal(periods.today.models['claude-3-7-sonnet'], 50000);

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readHistory avoids double counting between base daily_usage, runtime_history, and overlay', () => {
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
    CREATE TABLE runtime_history (
      date_bucket TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    -- 2026-10-15: base row with 10,000 codex tokens
    INSERT INTO daily_usage VALUES ('2026-10-15', 'codex', 'gpt-4o', 10, 0, 0, 0, 0, 0, 10000, 1.0, 0, 0);
    -- 2026-10-16: base row with 20,000 codex tokens
    INSERT INTO daily_usage VALUES ('2026-10-16', 'codex', 'gpt-4o', 20, 0, 0, 0, 0, 0, 20000, 2.0, 0, 0);
    -- 2026-10-16: runtime row with 25,000 codex tokens (should REPLACE base, not add to 45,000)
    INSERT INTO runtime_history VALUES ('2026-10-16', json('{"date":"2026-10-16","tokens":25000,"cost":2.5,"messages":25,"perClient":{"codex":{"tokens":25000,"cost":2.5,"messages":25}},"perModel":{"gpt-4o":{"tokens":25000}}}'), 1000);
  `);
  db.close();

  // Overlay has 2026-10-15 with codex (existing client, should NOT add) and antigravity (missing client, SHOULD append)
  // and 2026-10-17 as a new date (missing date, SHOULD append)
  const archivePath = path.join(fixture.dir, 'daily-history-archive.json');
  fs.writeFileSync(archivePath, JSON.stringify({
    version: 1,
    days: {
      '2026-10-15': {
        date: '2026-10-15',
        observations: {
          '["codex","gpt-4o"]': { client: 'codex', modelId: 'gpt-4o', tokens: 8000, cost: 0.8, messages: 8 },
          '["antigravity","gemini-3.8-flash"]': { client: 'antigravity', modelId: 'gemini-3.8-flash', tokens: 5000, cost: 0.5, messages: 5 }
        }
      },
      '2026-10-17': {
        date: '2026-10-17',
        observations: {
          '["opencode","gpt-4o"]': { client: 'opencode', modelId: 'gpt-4o', tokens: 8000, cost: 0.8, messages: 8 }
        }
      }
    },
    liveDays: {}
  }));

  const store = createTokenLedgerStore({ path: fixture.file, archivePath });
  const history = store.readHistory({ today: '2026-10-21' });

  // 1. 2026-10-15: base codex (10,000) kept, overlay codex ignored, overlay antigravity (5,000) appended => 15,000
  const d15 = history.daily.find((d) => d.date === '2026-10-15');
  assert.ok(d15, '2026-10-15 should exist');
  assert.equal(d15.perClient.codex.tokens, 10000, 'codex tokens should NOT double count or take overlay delta');
  assert.equal(d15.perClient.antigravity.tokens, 5000, 'missing client antigravity should be appended');
  assert.equal(d15.tokens, 15000, 'total tokens for 10-15 should be 15,000');

  // 2. 2026-10-16: runtime replaces base => 25,000 (NOT 20,000 + 25,000 = 45,000)
  const d16 = history.daily.find((d) => d.date === '2026-10-16');
  assert.ok(d16, '2026-10-16 should exist');
  assert.equal(d16.tokens, 25000, 'runtime should replace base row for covered date');
  assert.equal(d16.perClient.codex.tokens, 25000);

  // 3. 2026-10-17: genuinely missing date appended from overlay => 8,000
  const d17 = history.daily.find((d) => d.date === '2026-10-17');
  assert.ok(d17, '2026-10-17 should exist');
  assert.equal(d17.tokens, 8000);
  assert.equal(d17.perClient.opencode.tokens, 8000);

  // Total should be 15,000 + 25,000 + 8,000 = 48,000
  assert.equal(history.summary.totalTokens, 48000);

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('resolveTokenLedgerPath isolates via TOKEN_MONITOR_LEDGER_PATH and TOKEN_MONITOR_SHARED_DIR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-env-'));
  const customFile = path.join(dir, 'custom_ledger.sqlite');

  // 1. Explicit path option
  assert.equal(resolveTokenLedgerPath({ path: customFile }), path.resolve(customFile));

  // 2. TOKEN_MONITOR_LEDGER_PATH
  assert.equal(resolveTokenLedgerPath({ env: { TOKEN_MONITOR_LEDGER_PATH: customFile } }), path.resolve(customFile));

  // 3. TOKEN_MONITOR_SHARED_DIR
  const expectedShared = path.join(path.resolve(dir), 'token_ledger.sqlite');
  assert.equal(resolveTokenLedgerPath({ env: { TOKEN_MONITOR_SHARED_DIR: dir } }), expectedShared);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('ledger readHistory and readPeriods enforce invariant cacheRead + cacheWrite + output <= tokens on all days and clients', () => {
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
    -- Row 1: total_output already includes reasoning (100 uncached + 800 cached + 50 write + 50 output = 1000 processed; reasoning = 30)
    -- If reasoning is double-counted, output becomes 80 and components sum to 1030 > 1000!
    INSERT INTO daily_usage VALUES ('2026-10-18', 'codex', 'gpt-5', 5, 100, 800, 50, 50, 30, 1000, 1.0, 0, 0);

    -- Row 2: components deliberately overflow (900 cached + 100 write + 100 output = 1100 > 1000 processed)
    INSERT INTO daily_usage VALUES ('2026-10-19', 'claude', 'sonnet', 5, 0, 900, 100, 100, 0, 1000, 2.0, 0, 0);
  `);
  db.close();

  // Overlay has 2026-10-18 with an extra client whose components also overflow
  const overlay = {
    daily: [
      {
        date: '2026-10-17',
        tokens: 100,
        perClient: { opencode: { tokens: 100, cacheReadTokens: 50, outputTokens: 20 } }
      },
      {
        date: '2026-10-18',
        tokens: 500,
        cost: 0.5,
        messages: 2,
        cacheReadTokens: 400,
        cacheWriteTokens: 100,
        outputTokens: 100, // 400 + 100 + 100 = 600 > 500!
        perClient: {
          antigravity: {
            tokens: 500,
            cost: 0.5,
            messages: 2,
            cacheReadTokens: 400,
            cacheWriteTokens: 100,
            outputTokens: 100
          }
        }
      }
    ]
  };

  const store = createTokenLedgerStore({ path: fixture.file });
  const history = store.readHistory({ overlayHistory: overlay, today: '2026-10-21' });

  assert.ok(history, 'history should be returned');
  assert.equal(history.daily.length, 3);

  for (const day of history.daily) {
    const dayComponents = day.cacheReadTokens + day.cacheWriteTokens + day.outputTokens;
    assert.ok(
      dayComponents <= day.tokens,
      `Day ${day.date} total components (${dayComponents}) must not exceed tokens (${day.tokens})`
    );
    const dayUncached = day.tokens - dayComponents;
    assert.ok(dayUncached >= 0, `Day ${day.date} uncached input (${dayUncached}) must be non-negative`);

    for (const [client, val] of Object.entries(day.perClient)) {
      const clientComponents = val.cacheReadTokens + val.cacheWriteTokens + val.outputTokens;
      assert.ok(
        clientComponents <= val.tokens,
        `Client ${client} on ${day.date} components (${clientComponents}) must not exceed client tokens (${val.tokens})`
      );
      const clientUncached = val.tokens - clientComponents;
      assert.ok(clientUncached >= 0, `Client ${client} on ${day.date} uncached input (${clientUncached}) must be non-negative`);
    }
  }

  // Row 1 verification: reasoning was NOT double-counted
  const d18 = history.daily.find((d) => d.date === '2026-10-18');
  assert.ok(d18);
  const codex = d18.perClient.codex;
  assert.equal(codex.tokens, 1000);
  assert.equal(codex.outputTokens, 50, 'reasoning should not be double-counted when output already includes it');
  assert.equal(codex.cacheReadTokens, 800);
  assert.equal(codex.cacheWriteTokens, 50);

  // Periods verification
  const periods = store.readPeriods({ overlayHistory: overlay });
  for (const name of ['today', 'month', 'allTime']) {
    const p = periods[name];
    const pComps = p.cacheReadTokens + p.cacheWriteTokens + p.outputTokens;
    assert.ok(
      pComps <= p.totalTokens,
      `Period ${name} components (${pComps}) must not exceed totalTokens (${p.totalTokens})`
    );
  }

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

test('readHistory merges past-date archive overlay taking the larger client observation without double counting', () => {
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
    -- 2026-10-10:
    -- Client 1 (stale ledger): antigravity has 1,000 tokens
    INSERT INTO daily_usage VALUES ('2026-10-10', 'antigravity', 'gemini-3.8-flash', 1, 0, 0, 0, 1000, 0, 1000, 0.1, 0, 0);
    -- Client 2 (larger ledger): codex has 10,000 tokens
    INSERT INTO daily_usage VALUES ('2026-10-10', 'codex', 'gpt-4o', 10, 0, 0, 0, 10000, 0, 10000, 1.0, 0, 0);
  `);
  db.close();

  const archivePath = path.join(fixture.dir, 'daily-history-archive.json');
  fs.writeFileSync(archivePath, JSON.stringify({
    version: 1,
    days: {
      '2026-10-09': {
        date: '2026-10-09',
        observations: {
          '["codex","gpt-4o"]': { client: 'codex', modelId: 'gpt-4o', tokens: 500, cost: 0.05, messages: 1 }
        }
      },
      '2026-10-10': {
        date: '2026-10-10',
        observations: {
          // Case 1: stale ledger client (1,000), larger archive (5,000) -> archive wins (5,000)
          '["antigravity","gemini-3.8-flash"]': {
            client: 'antigravity',
            modelId: 'gemini-3.8-flash',
            tokens: 5000,
            cost: 0.5,
            messages: 5,
            cacheReadTokens: 1000,
            outputTokens: 4000,
            tokenComponentsAvailable: true
          },
          // Case 2: larger ledger (10,000), smaller archive (2,000) -> ledger wins (10,000)
          '["codex","gpt-4o"]': {
            client: 'codex',
            modelId: 'gpt-4o',
            tokens: 2000,
            cost: 0.2,
            messages: 2
          },
          // Case 3: client only in archive -> added (3,000)
          '["claude","claude-3-7-sonnet"]': {
            client: 'claude',
            modelId: 'claude-3-7-sonnet',
            tokens: 3000,
            cost: 0.3,
            messages: 3,
            cacheReadTokens: 500,
            outputTokens: 2500
          },
          // Case 5: DSH in archive stays excluded
          '["dsh","deepseek-chat"]': {
            client: 'dsh',
            modelId: 'deepseek-chat',
            tokens: 50000,
            cost: 5.0,
            messages: 50
          }
        }
      }
    },
    liveDays: {}
  }));

  const store = createTokenLedgerStore({ path: fixture.file, archivePath });
  const history = store.readHistory({ today: '2026-10-21' });

  assert.ok(history, 'history should be returned');
  const d10 = history.daily.find((d) => d.date === '2026-10-10');
  assert.ok(d10, '2026-10-10 should exist');

  // Case 1: stale ledger antigravity (1,000) replaced by larger archive observation (5,000)
  assert.equal(d10.perClient.antigravity.tokens, 5000, 'archive observation should win for antigravity');
  assert.equal(d10.perClient.antigravity.cost, 0.5);
  assert.equal(d10.perClient.antigravity.cacheReadTokens, 1000);
  assert.equal(d10.perClient.antigravity.outputTokens, 4000);

  // Case 2: larger ledger codex (10,000) kept over smaller archive observation (2,000)
  assert.equal(d10.perClient.codex.tokens, 10000, 'ledger observation should win for codex');
  assert.equal(d10.perClient.codex.cost, 1.0);

  // Case 3: client only in archive (claude) is added
  assert.equal(d10.perClient.claude.tokens, 3000, 'claude from archive should be added');
  assert.equal(d10.perClient.claude.cost, 0.3);

  // Case 5: DSH in archive stays excluded
  assert.equal(d10.perClient.dsh, undefined, 'dsh must not enter perClient');

  // Case 4: No double counting - total tokens must equal sum(perClient tokens) exactly
  const expectedTotal = 5000 + 10000 + 3000;
  assert.equal(d10.tokens, expectedTotal, 'day tokens must equal exactly sum of perClient tokens without double counting');
  assert.equal(
    Object.values(d10.perClient).reduce((sum, c) => sum + c.tokens, 0),
    expectedTotal
  );

  // Verify breakdown components invariant
  const dayComponents = d10.cacheReadTokens + d10.cacheWriteTokens + d10.outputTokens;
  assert.ok(dayComponents <= d10.tokens, 'day components must not exceed day tokens');

  store.close();
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});
