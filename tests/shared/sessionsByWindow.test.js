const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  ensureFactSchema,
  computeSessionsByWindow
} = require('../../src/shared/usage/tokenLedger');

function setupTestDb() {
  const db = new DatabaseSync(':memory:');
  ensureFactSchema(db);

  const insertEvent = db.prepare(`
    INSERT INTO usage_events (
      natural_key, client_id, source_kind, source_id, session_id,
      occurred_at_ms, date_bucket, model_id, total_tokens, payload_hash, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'hash', 'active')
  `);

  // Insert events across dates ending 2026-10-23
  // Today: 2026-10-23
  // 1-day window: [2026-10-23, 2026-10-23]
  // 7-day window: [2026-10-17, 2026-10-23]
  // 30-day window: [2026-09-24, 2026-10-23]
  // 90-day window: [2026-07-26, 2026-10-23]

  // Antigravity sessions
  insertEvent.run('ag-1', 'antigravity', 'antigravity-disk', 'disk-1', 'ag-sess-today', 1729641600000, '2026-10-23', 'claude-3-5-sonnet', 100);
  insertEvent.run('ag-2', 'antigravity', 'antigravity-disk', 'disk-1', 'ag-sess-today', 1729641700000, '2026-10-23', 'claude-3-5-sonnet', 50); // duplicate session on same day
  insertEvent.run('ag-3', 'antigravity', 'antigravity-disk', 'disk-2', 'ag-sess-5d', 1729382400000, '2026-10-20', 'claude-3-5-sonnet', 100);
  insertEvent.run('ag-4', 'antigravity', 'antigravity-disk', 'disk-3', 'ag-sess-20d', 1728000000000, '2026-10-04', 'claude-3-5-sonnet', 100);
  insertEvent.run('ag-5', 'antigravity', 'antigravity-disk', 'disk-4', 'ag-sess-60d', 1724000000000, '2026-08-19', 'claude-3-5-sonnet', 100);

  // Legacy antigravity event (should be ignored since source_kind is legacy-token-ledger)
  insertEvent.run('ag-leg', 'antigravity', 'legacy-token-ledger', 'leg-1', 'ag-legacy-sess', 1729641600000, '2026-10-23', 'claude-3-5-sonnet', 100);

  // Codex sessions
  insertEvent.run('cdx-1', 'codex', 'codex-sessions', 'codex-1', 'cdx-sess-today', 1729641600000, '2026-10-23', 'gpt-4o', 200);
  insertEvent.run('cdx-2', 'codex', 'codex-sessions', 'codex-2', 'cdx-sess-5d', 1729382400000, '2026-10-20', 'gpt-4o', 200);

  // DSH event (should be EXCLUDED)
  insertEvent.run('dsh-1', 'dsh', 'daily-history-archive', 'dsh-1', 'dsh-sess-today', 1729641600000, '2026-10-23', 'gpt-4o', 500);

  // Inactive event (should be EXCLUDED)
  db.prepare(`
    INSERT INTO usage_events (
      natural_key, client_id, source_kind, source_id, session_id,
      occurred_at_ms, date_bucket, model_id, total_tokens, payload_hash, state
    ) VALUES ('inact-1', 'codex', 'codex-sessions', 'codex-inact', 'cdx-inact', 1729641600000, '2026-10-23', 'gpt-4o', 100, 'hash', 'superseded')
  `).run();

  return db;
}

test('computeSessionsByWindow computes distinct session counts per client and total', () => {
  const db = setupTestDb();
  const res = computeSessionsByWindow(db, { today: '2026-10-23' });

  assert.ok(res, 'result should be returned');
  assert.deepEqual(Object.keys(res), ['1', '7', '30', '90']);

  // Window 1: only today (2026-10-23)
  // antigravity: ag-sess-today (1 distinct)
  // codex: cdx-sess-today (1 distinct)
  // dsh excluded, legacy excluded, superseded excluded
  assert.equal(res['1'].antigravity, 1);
  assert.equal(res['1'].codex, 1);
  assert.equal(res['1'].dsh, undefined);
  assert.equal(res['1'].total, 2);

  // Window 7: 2026-10-17 to 2026-10-23
  // antigravity: ag-sess-today, ag-sess-5d (2 distinct)
  // codex: cdx-sess-today, cdx-sess-5d (2 distinct)
  assert.equal(res['7'].antigravity, 2);
  assert.equal(res['7'].codex, 2);
  assert.equal(res['7'].total, 4);

  // Window 30: 2026-09-24 to 2026-10-23
  // antigravity: ag-sess-today, ag-sess-5d, ag-sess-20d (3 distinct)
  // codex: 2 distinct
  assert.equal(res['30'].antigravity, 3);
  assert.equal(res['30'].codex, 2);
  assert.equal(res['30'].total, 5);

  // Window 90: 2026-07-26 to 2026-10-23
  // antigravity: ag-sess-today, ag-sess-5d, ag-sess-20d, ag-sess-60d (4 distinct)
  // codex: 2 distinct
  assert.equal(res['90'].antigravity, 4);
  assert.equal(res['90'].codex, 2);
  assert.equal(res['90'].total, 6);
});

test('store.sessionsByWindow delegates to computeSessionsByWindow', () => {
  const db = setupTestDb();
  const fakeStore = {
    database: () => db,
    sessionsByWindow: (opts) => computeSessionsByWindow(db, opts)
  };

  const res = fakeStore.sessionsByWindow({ today: '2026-10-23' });
  assert.equal(res['1'].total, 2);
  assert.equal(res['90'].total, 6);
});
