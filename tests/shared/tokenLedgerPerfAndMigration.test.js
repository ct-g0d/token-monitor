'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const {
  createTokenLedgerStore,
  ensureFactSchema,
  readSourceWatermark
} = require('../../src/shared/usage/tokenLedger');
const { sweepUsage } = require('../../src/shared/usage/tokenLedgerSweep');
const {
  createSnapshotAdapter,
  createAppendFileAdapter
} = require('../../src/shared/usage/sourceAdapters');
const { PricingEngine } = require('../../src/shared/pricing/engine');
const { calculateTurnCost } = require('../../src/shared/pricing/formula');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-perf-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); } catch (_) {}
}

function createV0FixtureDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA user_version = 0;
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
    CREATE TABLE historical_threads (
      provider TEXT NOT NULL,
      thread_id TEXT NOT NULL PRIMARY KEY,
      title TEXT,
      model_codename TEXT,
      created_at_ms INTEGER NOT NULL,
      date_bucket TEXT NOT NULL,
      total_tokens INTEGER NOT NULL,
      source TEXT,
      coverage TEXT,
      ingestion_run_id INTEGER
    );
    CREATE TABLE runtime_history (
      date_bucket TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    INSERT INTO token_turns (natural_key, provider, session_id, timestamp_ms, date_bucket, model_codename, uncached_input, cached_input, cache_write, output_tokens, processed_tokens, cost_usd, source, coverage)
    VALUES
      ('turn-1', 'codex', 'sess-1', 1780000000000, '2026-06-01', 'gpt-5.6-luna', 100, 20, 0, 30, 150, 0.0015, 'codex_scan', 'complete'),
      ('turn-2', 'opencode', 'sess-2', 1780000100000, '2026-06-01', 'claude-3-5-sonnet', 200, 50, 10, 40, 300, 0.0035, 'opencode_scan', 'complete'),
      ('turn-3', 'antigravity', 'sess-3', 1780000200000, '2026-06-02', 'gemini-3.8-flash', 500, 100, 0, 100, 700, NULL, 'gemini_scan', 'complete');

    INSERT INTO historical_threads (provider, thread_id, title, model_codename, created_at_ms, date_bucket, total_tokens, source, coverage)
    VALUES
      ('codex', 'thread-1', 'Test Thread', 'gpt-5.6-sol', 1780000050000, '2026-06-01', 5000, 'archive', 'thread_archive');

    INSERT INTO runtime_history (date_bucket, payload_json, updated_at_ms)
    VALUES
      ('2026-05-30', '{"perClient":{"workbuddy":{"tokens":1200,"cost":0.012}},"clientModels":{"workbuddy":{"claude-3-5-sonnet":1200}}}', 1780000000000);
  `);
  db.close();
}

function runSlowPathMigration(db) {
  ensureFactSchema(db);
  const pe = new PricingEngine();
  const insertStmt = db.prepare(`
    INSERT INTO usage_events (
      natural_key, client_id, source_kind, source_id, session_id, request_id,
      occurred_at_ms, date_bucket, model_id, input_tokens, cached_input_tokens,
      cache_write_tokens, output_tokens, reasoning_tokens, total_tokens,
      cost_usd, payload_hash, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    ON CONFLICT(natural_key) DO UPDATE SET
      client_id=excluded.client_id, total_tokens=excluded.total_tokens, cost_usd=excluded.cost_usd
  `);

  for (const row of db.prepare('SELECT * FROM token_turns').all()) {
    let cost = row.cost_usd;
    if ((cost === null || cost === undefined || cost === 0) && row.model_codename) {
      const rates = pe.resolveRates(row.model_codename);
      if (rates) {
        cost = calculateTurnCost({
          uncached_input: row.uncached_input,
          cached_input: row.cached_input,
          cache_write: row.cache_write,
          output_tokens: row.output_tokens
        }, rates);
      }
    }
    insertStmt.run(
      `legacy:${row.provider}:${row.natural_key}`,
      row.provider,
      'legacy-token-ledger',
      'token_turns',
      row.session_id,
      row.request_id,
      row.timestamp_ms,
      row.date_bucket,
      row.model_codename,
      row.uncached_input,
      row.cached_input,
      row.cache_write,
      row.output_tokens,
      row.reasoning_tokens,
      row.processed_tokens,
      cost,
      `hash:${row.natural_key}`
    );
  }

  for (const row of db.prepare('SELECT * FROM historical_threads').all()) {
    insertStmt.run(
      `legacy-thread:${row.provider}:${row.thread_id}`,
      row.provider,
      'legacy-token-ledger',
      'historical_threads',
      row.thread_id,
      null,
      row.created_at_ms,
      row.date_bucket,
      row.model_codename || 'unknown',
      0, 0, 0, 0, 0,
      row.total_tokens,
      null,
      `hash:${row.thread_id}`
    );
  }

  db.exec('PRAGMA user_version = 2');
}

test('v0 migration backfill in a single transaction produces identical totals to slow path', () => {
  const dir = tempDir();
  try {
    const dbPathSlow = path.join(dir, 'slow.sqlite');
    const dbPathFast = path.join(dir, 'fast.sqlite');

    createV0FixtureDatabase(dbPathSlow);
    createV0FixtureDatabase(dbPathFast);

    // 1. Run slow path on dbPathSlow
    const dbSlow = new DatabaseSync(dbPathSlow);
    runSlowPathMigration(dbSlow);
    const slowEvents = dbSlow.prepare('SELECT count(*) as count, sum(total_tokens) as tokens, sum(cost_usd) as cost FROM usage_events').get();
    const slowClientTotals = dbSlow.prepare('SELECT client_id, sum(total_tokens) as tokens, sum(cost_usd) as cost FROM usage_events GROUP BY client_id ORDER BY client_id').all();
    dbSlow.close();

    // 2. Run fast path on dbPathFast via createTokenLedgerStore (calls ensureSchema)
    const storeFast = createTokenLedgerStore({ path: dbPathFast, homeDir: dir });
    const dbFast = storeFast.database();
    assert.equal(storeFast.status().schemaVersion, 2);

    const fastEvents = dbFast.prepare('SELECT count(*) as count, sum(total_tokens) as tokens, sum(cost_usd) as cost FROM usage_events').get();
    const fastClientTotals = dbFast.prepare('SELECT client_id, sum(total_tokens) as tokens, sum(cost_usd) as cost FROM usage_events GROUP BY client_id ORDER BY client_id').all();

    // 3. Verify identical events count and totals
    assert.equal(fastEvents.count, slowEvents.count + 1); // +1 from runtime_history migrated
    for (const slowClient of slowClientTotals) {
      const match = fastClientTotals.find((c) => c.client_id === slowClient.client_id);
      assert.ok(match, `Expected client ${slowClient.client_id} to be present in fast path`);
      assert.equal(match.tokens, slowClient.tokens);
      if (slowClient.cost !== null) {
        assert.ok(Math.abs(match.cost - slowClient.cost) < 0.0001, `Cost mismatch for ${slowClient.client_id}`);
      }
    }

    // 4. Verify reopening store is idempotent and fast
    storeFast.close();
    const reopenStore = createTokenLedgerStore({ path: dbPathFast, homeDir: dir });
    assert.equal(reopenStore.status().schemaVersion, 2);
    const reopenCount = reopenStore.database().prepare('SELECT count(*) as c FROM usage_events').get().c;
    assert.equal(reopenCount, fastEvents.count);
    reopenStore.close();
  } finally {
    cleanup(dir);
  }
});

test('snapshot and append adapters skip unchanged files and persist watermark fingerprint', () => {
  const dir = tempDir();
  try {
    const ledgerPath = path.join(dir, 'ledger.sqlite');
    const snapshotPath = path.join(dir, 'archive.json');
    const appendPath = path.join(dir, 'events.ndjson');

    fs.writeFileSync(snapshotPath, JSON.stringify([
      { naturalKey: 'snap-1', clientId: 'codex', modelId: 'gpt-5', totalTokens: 100, dateBucket: '2026-06-01', occurredAtMs: 1780000000000 }
    ]));
    fs.writeFileSync(appendPath, `${JSON.stringify({ id: 'app-1', client: 'codex', model: 'gpt-5', totalTokens: 50 })}\n`);

    const store = createTokenLedgerStore({ path: ledgerPath, homeDir: dir });
    const snapAdapter = createSnapshotAdapter({
      path: snapshotPath,
      sourceKind: 'snapshot-file',
      sourceId: 'archive',
      parse: (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
    });
    const appAdapter = createAppendFileAdapter({ path: appendPath, sourceKind: 'append-file', sourceId: 'events' });

    // First sweep: processes both files
    const res1 = sweepUsage({ store, adapters: [snapAdapter, appAdapter], now: 1790000000000 });
    assert.equal(res1.eventCount, 2);

    // Verify source_watermarks persisted mtime and size
    const wmSnap = readSourceWatermark(store.database(), 'snapshot-file', 'archive');
    assert.ok(wmSnap.source_mtime_ms > 0);
    assert.ok(wmSnap.source_size > 0);

    const wmApp = readSourceWatermark(store.database(), 'append-file', 'events');
    assert.ok(wmApp.source_mtime_ms > 0);
    assert.ok(wmApp.source_size > 0);

    // Second sweep: unchanged files are skipped (0 events)
    const res2 = sweepUsage({ store, adapters: [snapAdapter, appAdapter], now: 1790000001000 });
    assert.equal(res2.eventCount, 0);

    // Append new line: only 1 new event processed
    fs.appendFileSync(appendPath, `${JSON.stringify({ id: 'app-2', client: 'codex', model: 'gpt-5', totalTokens: 60 })}\n`);
    const res3 = sweepUsage({ store, adapters: [snapAdapter, appAdapter], now: 1790000002000 });
    assert.equal(res3.eventCount, 1);

    store.close();
  } finally {
    cleanup(dir);
  }
});

test('UI reader caches (readPeriods and readHistory) return warm cache and invalidate on sweep', () => {
  const dir = tempDir();
  try {
    const ledgerPath = path.join(dir, 'ledger.sqlite');
    const snapshotPath = path.join(dir, 'archive.json');
    fs.writeFileSync(snapshotPath, JSON.stringify([
      { naturalKey: 'snap-1', clientId: 'codex', modelId: 'gpt-5', totalTokens: 100, dateBucket: '2026-06-01', occurredAtMs: 1780000000000 }
    ]));

    const store = createTokenLedgerStore({ path: ledgerPath, homeDir: dir });
    const snapAdapter = createSnapshotAdapter({
      path: snapshotPath,
      sourceKind: 'snapshot-file',
      sourceId: 'archive',
      parse: (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
    });
    sweepUsage({ store, adapters: [snapAdapter], now: 1790000000000 });

    // First read: populates cache
    const history1 = store.readHistory({ today: '2026-06-01' });
    assert.equal(history1.summary.totalTokens, 100);

    const periods1 = store.readPeriods({ today: '2026-06-01' });
    assert.equal(periods1.allTime.totalTokens, 100);

    // Second read: hits cache (warm read)
    const t0 = performance.now();
    const history2 = store.readHistory({ today: '2026-06-01' });
    const periods2 = store.readPeriods({ today: '2026-06-01' });
    const warmDuration = performance.now() - t0;
    assert.equal(history2.summary.totalTokens, 100);
    assert.equal(periods2.allTime.totalTokens, 100);
    assert.ok(warmDuration < 100, `Expected warm read < 100 ms, took ${warmDuration.toFixed(2)} ms`);

    // Invalidate via new sweep with updated tokens
    fs.writeFileSync(snapshotPath, JSON.stringify([
      { naturalKey: 'snap-1', clientId: 'codex', modelId: 'gpt-5', totalTokens: 250, dateBucket: '2026-06-01', occurredAtMs: 1780000000000 }
    ]));
    sweepUsage({ store, adapters: [snapAdapter], now: 1790000005000 });

    // After sweep: cache was cleared, returns new total
    const history3 = store.readHistory({ today: '2026-06-01' });
    assert.equal(history3.summary.totalTokens, 250);

    const periods3 = store.readPeriods({ today: '2026-06-01' });
    assert.equal(periods3.allTime.totalTokens, 250);

    store.close();
  } finally {
    cleanup(dir);
  }
});
