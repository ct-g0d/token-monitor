'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { createTokenLedgerStore } = require('../../src/shared/usage/tokenLedger');

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
