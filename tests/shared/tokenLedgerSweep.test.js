'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { createTokenLedgerStore, ninetyDayWindow, canonicalFactDayRows } = require('../../src/shared/usage/tokenLedger');
const { sweepUsage } = require('../../src/shared/usage/tokenLedgerSweep');
const { readAntigravityUsage } = require('../../src/shared/providers/antigravity/conversationReader');
const {
  createAppendFileAdapter,
  createAntigravityAdapter,
  createSnapshotAdapter,
  createSqliteAdapter,
  createClaudeAdapter,
  createOpenCodeAdapter,
  createCodexAdapter,
  createWorkBuddyAdapter,
  createZCodeAdapter,
  mergeSessionObservations,
  sourceIdForRoot
} = require('../../src/shared/usage/sourceAdapters');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-sweep-'));
  return { dir, ledger: path.join(dir, 'ledger.sqlite') };
}

function cleanup(value) {
  try { fs.rmSync(value.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); } catch (_) {}
}

test('append adapter retains an incomplete tail and catches late rows without double counting', () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, 'codex.ndjson');
    fs.writeFileSync(file, JSON.stringify({ id: 'a', client: 'codex', model: 'gpt', totalTokens: 5 }));
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const adapter = createAppendFileAdapter({ path: file, sourceKind: 'codex', sourceId: file, clientId: 'codex' });
    assert.equal(sweepUsage({ store, adapters: [adapter], now: 1790000000000 }).eventCount, 0);
    fs.appendFileSync(file, `\n${JSON.stringify({ id: 'b', client: 'codex', model: 'gpt', totalTokens: 7 })}\n`);
    assert.equal(sweepUsage({ store, adapters: [adapter], now: 1790000000001 }).eventCount, 2);
    assert.equal(store.readHistory().summary.totalTokens, 12);
    assert.equal(sweepUsage({ store, adapters: [adapter], now: 1790000000002 }).eventCount, 0);
    assert.equal(store.readHistory().summary.totalTokens, 12);
    store.close();
  } finally { cleanup(f); }
});

test('rewriting an append source supersedes the old generation and replaces totals', () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, 'rewrite.ndjson');
    const write = (tokens) => fs.writeFileSync(file, `${JSON.stringify({ id: 'same', client: 'codex', model: 'gpt', totalTokens: tokens })}\n`);
    write(10);
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const adapter = createAppendFileAdapter({ path: file, sourceKind: 'codex', sourceId: file, clientId: 'codex' });
    sweepUsage({ store, adapters: [adapter], now: 1790000000000 });
    write(25);
    sweepUsage({ store, adapters: [adapter], now: 1790000000001 });
    const rows = store.database().prepare('SELECT state, total_tokens FROM usage_events').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'active');
    assert.equal(rows[0].total_tokens, 25);
    assert.equal(store.readHistory().summary.totalTokens, 25);
    store.close();
  } finally { cleanup(f); }
});

test('sqlite adapter overlaps updated rows and upserts the changed fact', () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, 'rows.sqlite');
    const source = new DatabaseSync(file);
    source.exec('CREATE TABLE usage (id INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL, client TEXT, model TEXT, total_tokens INTEGER)');
    source.prepare('INSERT INTO usage VALUES (?, ?, ?, ?, ?)').run(1, 100, 'codex', 'gpt', 10);
    source.close();
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const adapter = createSqliteAdapter({ path: file, sourceKind: 'sqlite', sourceId: 'zcode', table: 'usage', keyColumn: 'id', updatedAtColumn: 'updated_at', clientId: 'codex', mapRow: (row) => ({ ...row, naturalKey: `row:${row.id}`, occurredAtMs: 1790000000000 }) });
    sweepUsage({ store, adapters: [adapter], now: 1790000000000 });
    const changed = new DatabaseSync(file);
    changed.prepare('UPDATE usage SET updated_at = ?, total_tokens = ? WHERE id = ?').run(101, 25, 1);
    changed.close();
    sweepUsage({ store, adapters: [adapter], now: 1790000000001 });
    assert.equal(store.database().prepare('SELECT COUNT(*) AS count FROM usage_events').get().count, 1);
    assert.equal(store.readHistory().summary.totalTokens, 25);
    store.close();
  } finally { cleanup(f); }
});

test('snapshot, Antigravity merge, WSL/custom partitioning, and DSH policy are explicit', () => {
  const f = fixture();
  try {
    const snapshot = path.join(f.dir, 'snapshot.json');
    fs.writeFileSync(snapshot, JSON.stringify([{ id: 's', client: 'dsh', model: 'gpt', totalTokens: 30 }]));
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const snap = createSnapshotAdapter({ path: snapshot, sourceKind: 'snapshot', sourceId: 'custom-a', clientId: 'dsh', mapSnapshot: (value) => value });
    const ag = createAntigravityAdapter({ sourceId: 'ag', records: [{ sessionId: 's1', model: 'gemini', timestampMs: 1790000000000, totals: { uncachedInputTokens: 10, outputTokens: 5 } }] });
    sweepUsage({ store, adapters: [snap, ag], now: 1790000000000 });
    assert.equal(store.database().prepare('SELECT COUNT(*) AS count FROM usage_events WHERE client_id = ?').get('dsh').count, 1);
    assert.equal(store.readHistory().summary.totalTokens, 15);
    assert.equal(sourceIdForRoot({ distro: 'Ubuntu', path: '/home/a' }, 'wsl'), 'wsl:ubuntu:/home/a');
    assert.equal(sourceIdForRoot({ custom: true, path: 'C:\\\\other' }), 'custom:c:/other');
    assert.deepEqual(mergeSessionObservations([
      { sessionId: 'same', totalTokens: 3 }, { sessionId: 'same', totalTokens: 9 }, { sessionId: 'other', totalTokens: 2 }
    ]).map((row) => row.totalTokens), [9, 2]);
    store.close();
  } finally { cleanup(f); }
});

test('identical source keys remain partitioned by source id', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const make = (sourceId, tokens) => ({ sourceKind: 'sqlite', sourceId, read: () => ({ events: [{ naturalKey: 'same', clientId: 'codex', modelId: 'gpt', occurredAtMs: 1790000000000, totalTokens: tokens }], nextCursor: {}, sourceFingerprint: sourceId, coverage: {} }) });
    sweepUsage({ store, adapters: [make('root-a', 4), make('root-b', 6)], now: 1790000000000 });
    assert.equal(store.database().prepare('SELECT COUNT(*) AS count FROM usage_events').get().count, 2);
    assert.equal(store.readHistory().summary.totalTokens, 10);
    store.close();
  } finally { cleanup(f); }
});

test('adapter failure leaves its prior watermark unchanged', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const good = { sourceKind: 'fixture', sourceId: 'one', read: () => ({ events: [], nextCursor: { offset: 7 }, sourceFingerprint: 'one', coverage: {} }) };
    sweepUsage({ store, adapters: [good], now: 1790000000000 });
    const before = store.readSourceWatermark('fixture', 'one');
    assert.throws(() => sweepUsage({ store, adapters: [{ sourceKind: 'fixture', sourceId: 'one', read: () => { throw new Error('broken'); } }], now: 1790000000001 }), /broken/);
    assert.deepEqual(store.readSourceWatermark('fixture', 'one').cursor, before.cursor);
    store.close();
  } finally { cleanup(f); }
});

test('ninetyDayWindow calculates correct 90-day inclusive date range', () => {
  const window = ninetyDayWindow('2026-10-23');
  assert.equal(window.start, '2026-07-26');
  assert.equal(window.end, '2026-10-23');

  const startMs = Date.parse(`${window.start}T00:00:00Z`);
  const endMs = Date.parse(`${window.end}T00:00:00Z`);
  const diffDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  assert.equal(diffDays, 90);
});

test('createAntigravityAdapter aggregates multi-model disk observations for the same day', () => {
  const adapter = createAntigravityAdapter({
    sourceId: 'ag-test',
    records: [
      { sessionId: 'disk-2026-10-21', model: 'gemini-3.8-flash', totalTokens: 100, totals: { uncachedInputTokens: 80, outputTokens: 20 } },
      { sessionId: 'disk-2026-10-21', model: 'gemini-3.8-pro', totalTokens: 250, totals: { uncachedInputTokens: 200, outputTokens: 50 } }
    ]
  });
  const res = adapter.read({ now: 1790000000000 });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].totalTokens, 350);
  assert.equal(res.events[0].inputTokens, 280);
  assert.equal(res.events[0].outputTokens, 70);
});

test('createClaudeAdapter deduplicates on messageId:requestId and counts cache creation', () => {
  const f = fixture();
  try {
    const claudeDir = path.join(f.dir, 'claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const logFile = path.join(claudeDir, 'chat.jsonl');
    const line1 = JSON.stringify({
      type: 'assistant',
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:00Z',
      message: { id: 'msg-1', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 40 } }
    });
    const line2 = JSON.stringify({
      type: 'assistant',
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:01Z',
      message: { id: 'msg-1', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 40 } }
    });
    fs.writeFileSync(logFile, `${line1}\n${line2}\n`);

    const adapter = createClaudeAdapter({ path: claudeDir });
    const res = adapter.read();
    assert.equal(res.events.length, 1);
    assert.equal(res.events[0].inputTokens, 10);
    assert.equal(res.events[0].cachedInputTokens, 20);
    assert.equal(res.events[0].cacheWriteTokens, 30);
    assert.equal(res.events[0].outputTokens, 40);
    assert.equal(res.events[0].totalTokens, 100);
  } finally {
    cleanup(f);
  }
});

test('createOpenCodeAdapter processes opencode db messages without double counting', () => {
  const f = fixture();
  try {
    const dbPath = path.join(f.dir, 'opencode.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        time_created INTEGER,
        time_updated INTEGER,
        data TEXT
      );
    `);
    const insert = db.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)');
    insert.run('m1', 's1', 1790000000000, 1790000000000, JSON.stringify({
      role: 'assistant',
      model: { id: 'claude-3-5-sonnet' },
      tokens: { input: 100, output: 50, cache: { read: 20, write: 10 }, reasoning: 30 }
    }));
    db.close();

    const adapter = createOpenCodeAdapter({ filePath: dbPath });
    const res = adapter.read();
    assert.equal(res.events.length, 1);
    assert.equal(res.events[0].totalTokens, 180);
    assert.equal(res.events[0].reasoningTokens, 30);
  } finally {
    cleanup(f);
  }
});

test('a native source supersedes overlapping legacy and snapshot facts for the same client and day', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();
    const { upsertUsageEvent } = require('../../src/shared/usage/tokenLedger');

    // 1. Seed legacy and snapshot facts
    upsertUsageEvent(db, {
      naturalKey: 'legacy:opencode:2026-10-15:1',
      clientId: 'opencode',
      sourceKind: 'legacy-token-ledger',
      sourceId: 'legacy-db',
      dateBucket: '2026-10-15',
      occurredAtMs: 1792000000000,
      modelId: 'claude-3-5-sonnet',
      totalTokens: 500,
      state: 'active'
    });
    upsertUsageEvent(db, {
      naturalKey: 'snapshot:claude:2026-10-15:1',
      clientId: 'claude',
      sourceKind: 'snapshot',
      sourceId: 'tokscale-snapshot',
      dateBucket: '2026-10-15',
      occurredAtMs: 1792000000000,
      modelId: 'claude-3-5-sonnet',
      totalTokens: 300,
      state: 'active'
    });
    // Non-overlapping day should NOT be superseded
    upsertUsageEvent(db, {
      naturalKey: 'legacy:opencode:2026-10-14:1',
      clientId: 'opencode',
      sourceKind: 'legacy-token-ledger',
      sourceId: 'legacy-db',
      dateBucket: '2026-10-14',
      occurredAtMs: 1791900000000,
      modelId: 'claude-3-5-sonnet',
      totalTokens: 200,
      state: 'active'
    });

    // 2. Run sweep with native adapters for 2026-10-15
    const nativeOpenCode = {
      sourceKind: 'opencode-db',
      sourceId: 'native-opencode',
      read: () => ({
        events: [{
          naturalKey: 'opencode:m1',
          clientId: 'opencode',
          modelId: 'claude-3-5-sonnet',
          dateBucket: '2026-10-15',
          occurredAtMs: 1792000000000,
          totalTokens: 450
        }],
        nextCursor: { generation: 1 },
        sourceFingerprint: 'native-opencode',
        coverage: { complete: true }
      })
    };
    const nativeClaude = {
      sourceKind: 'claude-projects',
      sourceId: 'native-claude',
      read: () => ({
        events: [{
          naturalKey: 'claude:req1',
          clientId: 'claude',
          modelId: 'claude-3-5-sonnet',
          dateBucket: '2026-10-15',
          occurredAtMs: 1792000000000,
          totalTokens: 280
        }],
        nextCursor: { generation: 1 },
        sourceFingerprint: 'native-claude',
        coverage: { complete: true }
      })
    };

    sweepUsage({ store, adapters: [nativeOpenCode, nativeClaude], now: 1792000000001 });

    // Verify opencode legacy fact on 2026-10-15 was superseded
    const opencode15 = db.prepare("SELECT state, total_tokens FROM usage_events WHERE natural_key = 'legacy:opencode:2026-10-15:1'").get();
    assert.equal(opencode15.state, 'superseded');

    // Verify opencode legacy fact on non-overlapping day 2026-10-14 remains active
    const opencode14 = db.prepare("SELECT state, total_tokens FROM usage_events WHERE natural_key = 'legacy:opencode:2026-10-14:1'").get();
    assert.equal(opencode14.state, 'active');

    // Verify claude snapshot fact on 2026-10-15 was superseded
    const claude15 = db.prepare("SELECT state, total_tokens FROM usage_events WHERE natural_key = 'snapshot:claude:2026-10-15:1'").get();
    assert.equal(claude15.state, 'superseded');

    // Verify native facts remain active
    const nativeOpencodeRow = db.prepare("SELECT state, total_tokens FROM usage_events WHERE natural_key LIKE '%opencode:m1%'").get();
    assert.equal(nativeOpencodeRow.state, 'active');
    assert.equal(nativeOpencodeRow.total_tokens, 450);

    const nativeClaudeRow = db.prepare("SELECT state, total_tokens FROM usage_events WHERE natural_key LIKE '%claude:req1%'").get();
    assert.equal(nativeClaudeRow.state, 'active');
    assert.equal(nativeClaudeRow.total_tokens, 280);

    store.close();
  } finally {
    cleanup(f);
  }
});

test('durability: vanished sources and rows keep their active facts and watermarks stay clean', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();

    // 1. Antigravity: delete conversation file -> facts remain active, watermark not dirty
    let agRecords = [
      { sessionId: 'ag-sess-1', model: 'gemini-3.8-flash', timestampMs: 1792000000000, totals: { uncachedInputTokens: 100, outputTokens: 20 } },
      { sessionId: 'ag-sess-2', model: 'gemini-3.8-flash', timestampMs: 1792000000000, totals: { uncachedInputTokens: 200, outputTokens: 40 } }
    ];
    const agAdapter = createAntigravityAdapter({
      sourceId: 'ag-test-source',
      readRecords: () => agRecords
    });

    sweepUsage({ store, adapters: [agAdapter], now: 1792000000000 });
    const agActive1 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'antigravity' AND state = 'active'").get().c;
    assert.equal(agActive1, 2);

    // Vanish conversation file 1 (so next sweep only sees sess-2)
    agRecords = [agRecords[1]];
    sweepUsage({ store, adapters: [agAdapter], now: 1792000001000 });

    const agActive2 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'antigravity' AND state = 'active'").get().c;
    const agSuperseded = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'antigravity' AND state = 'superseded'").get().c;
    const agWm = store.readSourceWatermark('antigravity-disk', 'ag-test-source');
    assert.equal(agActive2, 2, 'vanished antigravity session must remain active');
    assert.equal(agSuperseded, 0, 'vanished antigravity session must not be superseded');
    assert.equal(agWm?.dirty, 0, 'watermark must not go dirty');

    // 2. Claude: delete project jsonl -> facts remain active, watermark not dirty
    const claudeDir = path.join(f.dir, 'claude-projects');
    fs.mkdirSync(claudeDir, { recursive: true });
    const cFile1 = path.join(claudeDir, 'c1.jsonl');
    const cFile2 = path.join(claudeDir, 'c2.jsonl');
    fs.writeFileSync(cFile1, JSON.stringify({
      type: 'assistant',
      requestId: 'req-c1',
      timestamp: '2026-10-20T10:00:00Z',
      message: { id: 'msg-c1', model: 'claude-sonnet-4-5', usage: { input_tokens: 50, output_tokens: 25 } }
    }) + '\n');
    fs.writeFileSync(cFile2, JSON.stringify({
      type: 'assistant',
      requestId: 'req-c2',
      timestamp: '2026-10-20T10:05:00Z',
      message: { id: 'msg-c2', model: 'claude-sonnet-4-5', usage: { input_tokens: 80, output_tokens: 40 } }
    }) + '\n');

    const claudeAdapter = createClaudeAdapter({ dirPath: claudeDir, sourceId: 'claude-test-source' });
    sweepUsage({ store, adapters: [claudeAdapter], now: 1792000000000 });
    const claudeActive1 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'claude' AND state = 'active'").get().c;
    assert.equal(claudeActive1, 2);

    // Delete c1.jsonl
    fs.unlinkSync(cFile1);
    sweepUsage({ store, adapters: [claudeAdapter], now: 1792000001000 });
    const claudeActive2 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'claude' AND state = 'active'").get().c;
    const claudeSuperseded = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'claude' AND state = 'superseded'").get().c;
    const claudeWm = store.readSourceWatermark('claude-projects', 'claude-test-source');
    assert.equal(claudeActive2, 2, 'vanished claude project file must keep active facts');
    assert.equal(claudeSuperseded, 0, 'vanished claude project file must not be superseded');
    assert.equal(claudeWm?.dirty, 0, 'claude watermark must not go dirty');

    // 3. OpenCode: delete row from opencode.db -> facts remain active, watermark not dirty
    const opencodeDbPath = path.join(f.dir, 'opencode.db');
    const openDb = new DatabaseSync(opencodeDbPath);
    openDb.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        time_created INTEGER,
        time_updated INTEGER,
        data TEXT
      );
    `);
    const insertMsg = openDb.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)');
    insertMsg.run('m-op-1', 's-op-1', 1792000000000, 1792000000000, JSON.stringify({ role: 'assistant', model: { id: 'gpt-6.1-sol' }, tokens: { input: 100, output: 50 } }));
    insertMsg.run('m-op-2', 's-op-1', 1792000001000, 1792000001000, JSON.stringify({ role: 'assistant', model: { id: 'gpt-6.1-sol' }, tokens: { input: 200, output: 100 } }));
    openDb.close();

    const opencodeAdapter = createOpenCodeAdapter({ filePath: opencodeDbPath, sourceId: 'opencode-test-source' });
    sweepUsage({ store, adapters: [opencodeAdapter], now: 1792000000000 });
    const openActive1 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'opencode' AND state = 'active'").get().c;
    assert.equal(openActive1, 2);

    // Delete row m-op-1 from opencode.db
    const openDb2 = new DatabaseSync(opencodeDbPath);
    openDb2.prepare('DELETE FROM message WHERE id = ?').run('m-op-1');
    openDb2.close();

    sweepUsage({ store, adapters: [opencodeAdapter], now: 1792000002000 });
    const openActive2 = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'opencode' AND state = 'active'").get().c;
    const openSuperseded = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'opencode' AND state = 'superseded'").get().c;
    const openWm = store.readSourceWatermark('opencode-db', 'opencode-test-source');
    assert.equal(openActive2, 2, 'vanished opencode.db row must keep active facts');
    assert.equal(openSuperseded, 0, 'vanished opencode.db row must not be superseded');
    assert.equal(openWm?.dirty, 0, 'opencode watermark must not go dirty');

    store.close();
  } finally {
    cleanup(f);
  }
});

test('native codex adapter: incremental, dedup, supersedes snapshot, durability on file deletion', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();
    const { upsertUsageEvent } = require('../../src/shared/usage/tokenLedger');

    const testDate = new Date(2026, 9, 20, 12, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const targetDate = testDate.getFullYear() + '-' + pad(testDate.getMonth() + 1) + '-' + pad(testDate.getDate());
    const targetTs = testDate.getTime();
    const targetIso = testDate.toISOString();

    // Pre-populate snapshot facts: one for targetDate (overlapping) and one for past date (non-overlapping)
    upsertUsageEvent(db, {
      naturalKey: 'snapshot:codex:' + targetDate + ':snap1',
      clientId: 'codex',
      sourceKind: 'snapshot',
      sourceId: 'tokscale-snapshot',
      dateBucket: targetDate,
      occurredAtMs: targetTs,
      modelId: 'gpt-5-codex',
      totalTokens: 1000,
      state: 'active'
    });
    upsertUsageEvent(db, {
      naturalKey: 'snapshot:codex:2026-09-01:snap2',
      clientId: 'codex',
      sourceKind: 'snapshot',
      sourceId: 'tokscale-snapshot',
      dateBucket: '2026-09-01',
      occurredAtMs: targetTs - 86400000 * 50,
      modelId: 'gpt-5-codex',
      totalTokens: 500,
      state: 'active'
    });

    const sessionsDir = path.join(f.dir, 'codex-sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // File 1: Session with consecutive duplicate and distinct event
    const file1 = path.join(sessionsDir, 'sess1.jsonl');
    const lines1 = [
      JSON.stringify({ timestamp: targetIso, type: 'session_meta', payload: { id: 'sess-1' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      JSON.stringify({ timestamp: new Date(targetTs + 5000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 20, cache_write_input_tokens: 10, output_tokens: 50, reasoning_output_tokens: 15 } } } }),
      // Consecutive duplicate (exact same signature) -> deduped
      JSON.stringify({ timestamp: new Date(targetTs + 6000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 20, cache_write_input_tokens: 10, output_tokens: 50, reasoning_output_tokens: 15 } } } }),
      // Distinct turn
      JSON.stringify({ timestamp: new Date(targetTs + 60000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 200, cached_input_tokens: 40, cache_write_input_tokens: 20, output_tokens: 80, reasoning_output_tokens: 25 } } } })
    ];
    fs.writeFileSync(file1, lines1.join('\n') + '\n');

    // File 2: Forked session with burst suppression (<1000ms gap from anchor)
    const file2 = path.join(sessionsDir, 'sess2.jsonl');
    const lines2 = [
      JSON.stringify({ timestamp: targetIso, type: 'session_meta', payload: { id: 'sess-fork', forked_from_id: 'sess-1' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      // Within 1000ms of fork anchor -> suppressed
      JSON.stringify({ timestamp: new Date(targetTs + 500).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, output_tokens: 20 } } } }),
      // After 1000ms -> accepted
      JSON.stringify({ timestamp: new Date(targetTs + 5000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 150, output_tokens: 60 } } } })
    ];
    fs.writeFileSync(file2, lines2.join('\n') + '\n');

    const adapter = createCodexAdapter({
      sessionsDir,
      archivedDir: path.join(f.dir, 'archived_sessions'),
      cachePath: null
    });

    // 1. First sweep: imports 3 deduped facts (2 from file1, 1 from file2)
    const sweep1 = sweepUsage({ store, adapters: [adapter], now: 1792000000000 });
    assert.equal(sweep1.eventCount, 3, 'should import 3 deduped events across both files');

    // 2. Incremental test: second sweep adds 0 events
    const sweep2 = sweepUsage({ store, adapters: [adapter], now: 1792000001000 });
    assert.equal(sweep2.eventCount, 0, 'second sweep on unchanged files must add 0 events');

    // 3. Superseding test: snapshot fact on targetDate must be superseded; 2026-09-01 must remain active
    const snapTarget = db.prepare("SELECT state FROM usage_events WHERE natural_key = 'snapshot:codex:' || ? || ':snap1'").get(targetDate);
    const snapPast = db.prepare("SELECT state FROM usage_events WHERE natural_key = 'snapshot:codex:2026-09-01:snap2'").get();
    assert.equal(snapTarget.state, 'superseded', 'snapshot codex fact on covered day must be superseded');
    assert.equal(snapPast.state, 'active', 'snapshot codex fact on uncovered day must remain active');

    // 4. Durability test: delete file1 -> facts remain active, watermark not dirty
    fs.unlinkSync(file1);
    const sweep3 = sweepUsage({ store, adapters: [adapter], now: 1792000002000 });
    assert.equal(sweep3.eventCount, 0);

    const activeCount = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'codex' AND source_kind = 'codex-sessions' AND state = 'active'").get().c;
    const supersededCount = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'codex' AND source_kind = 'codex-sessions' AND state = 'superseded'").get().c;
    assert.equal(activeCount, 3, 'all native codex facts must remain active after file deletion');
    assert.equal(supersededCount, 0, 'no native codex facts should be superseded on file deletion');

    const wm = store.readSourceWatermark('codex-sessions', adapter.sourceId);
    assert.equal(wm?.dirty, 0, 'watermark must remain clean');

    store.close();
  } finally {
    cleanup(f);
  }
});

test('native workbuddy adapter: incremental, dedup, supersedes snapshot, durability on file deletion', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();
    const { upsertUsageEvent } = require('../../src/shared/usage/tokenLedger');

    const testDate = new Date(2026, 9, 20, 12, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const targetDate = testDate.getFullYear() + '-' + pad(testDate.getMonth() + 1) + '-' + pad(testDate.getDate());
    const targetTs = testDate.getTime();
    const targetIso = testDate.toISOString();

    // Pre-populate snapshot fact for workbuddy
    upsertUsageEvent(db, {
      naturalKey: 'snapshot:workbuddy:' + targetDate + ':snap1',
      clientId: 'workbuddy',
      sourceKind: 'snapshot',
      sourceId: 'tokscale-snapshot',
      dateBucket: targetDate,
      occurredAtMs: targetTs,
      modelId: 'claude-3-7-sonnet',
      totalTokens: 2000,
      state: 'active'
    });

    const wbDir = path.join(f.dir, 'workbuddy-projects');
    fs.mkdirSync(wbDir, { recursive: true });

    // File 1: Two turns where first turn has a duplicate line
    const file1 = path.join(wbDir, 'proj1.jsonl');
    const lines1 = [
      JSON.stringify({ id: 't1', sessionId: 's1', timestamp: targetIso, providerData: { messageId: 'm1', conversationRequestId: 'r1', model: 'claude-3-7-sonnet', usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 20, prompt_cache_write_tokens: 10, reasoning_tokens: 15 } } }),
      // Duplicate messageId:requestId
      JSON.stringify({ id: 't2', sessionId: 's1', timestamp: new Date(targetTs + 1000).toISOString(), providerData: { messageId: 'm1', conversationRequestId: 'r1', model: 'claude-3-7-sonnet', usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 20, prompt_cache_write_tokens: 10, reasoning_tokens: 15 } } }),
      // Distinct turn
      JSON.stringify({ id: 't3', sessionId: 's1', timestamp: new Date(targetTs + 60000).toISOString(), providerData: { messageId: 'm2', conversationRequestId: 'r2', model: 'claude-3-7-sonnet', usage: { prompt_tokens: 200, completion_tokens: 80, prompt_cache_hit_tokens: 40, prompt_cache_write_tokens: 20, reasoning_tokens: 25 } } })
    ];
    fs.writeFileSync(file1, lines1.join('\n') + '\n');

    const file2 = path.join(wbDir, 'proj2.jsonl');
    const lines2 = [
      JSON.stringify({ id: 't4', sessionId: 's2', timestamp: new Date(targetTs + 120000).toISOString(), providerData: { messageId: 'm3', conversationRequestId: 'r3', model: 'claude-3-7-sonnet', usage: { prompt_tokens: 300, completion_tokens: 100 } } })
    ];
    fs.writeFileSync(file2, lines2.join('\n') + '\n');

    const adapter = createWorkBuddyAdapter({ dirPaths: [wbDir] });

    // 1. First sweep: imports 3 deduped turns
    const sweep1 = sweepUsage({ store, adapters: [adapter], now: 1792000000000 });
    assert.equal(sweep1.eventCount, 3, 'should import 3 deduped workbuddy events');

    // 2. Incremental sweep: adds 0
    const sweep2 = sweepUsage({ store, adapters: [adapter], now: 1792000001000 });
    assert.equal(sweep2.eventCount, 0, 'second sweep on unchanged files must add 0 events');

    // 3. Superseding test: snapshot fact on targetDate must be superseded
    const snapRow = db.prepare("SELECT state FROM usage_events WHERE natural_key = 'snapshot:workbuddy:' || ? || ':snap1'").get(targetDate);
    assert.equal(snapRow.state, 'superseded', 'snapshot workbuddy fact must be superseded by native facts');

    // 4. Durability test: delete file1 -> facts remain active, watermark not dirty
    fs.unlinkSync(file1);
    const sweep3 = sweepUsage({ store, adapters: [adapter], now: 1792000002000 });
    assert.equal(sweep3.eventCount, 0);

    const activeCount = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'workbuddy' AND source_kind = 'workbuddy-projects' AND state = 'active'").get().c;
    assert.equal(activeCount, 3, 'all native workbuddy facts must remain active after file deletion');

    const wm = store.readSourceWatermark('workbuddy-projects', adapter.sourceId);
    assert.equal(wm?.dirty, 0, 'watermark must remain clean');

    store.close();
  } finally {
    cleanup(f);
  }
});

test('native zcode adapter: incremental, dedup, supersedes snapshot, durability on db deletion', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();
    const { upsertUsageEvent } = require('../../src/shared/usage/tokenLedger');

    const testDate = new Date(2026, 9, 20, 12, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const targetDate = testDate.getFullYear() + '-' + pad(testDate.getMonth() + 1) + '-' + pad(testDate.getDate());
    const targetTs = testDate.getTime();

    // Pre-populate snapshot fact for zcode
    upsertUsageEvent(db, {
      naturalKey: 'snapshot:zcode:' + targetDate + ':snap1',
      clientId: 'zcode',
      sourceKind: 'snapshot',
      sourceId: 'tokscale-snapshot',
      dateBucket: targetDate,
      occurredAtMs: targetTs,
      modelId: 'glm-5.3',
      totalTokens: 1500,
      state: 'active'
    });

    const zcodeDbPath = path.join(f.dir, 'zcode.sqlite');
    const zdb = new DatabaseSync(zcodeDbPath);
    zdb.exec(`
      CREATE TABLE turn_usage (
        session_id TEXT,
        turn_id TEXT PRIMARY KEY,
        started_at INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_tokens INTEGER,
        cache_creation_input_tokens INTEGER,
        cache_read_input_tokens INTEGER,
        computed_total_tokens INTEGER
      );
      CREATE TABLE model_usage (
        turn_id TEXT,
        model_id TEXT
      );
    `);
    const insertTurn = zdb.prepare('INSERT INTO turn_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertModel = zdb.prepare('INSERT INTO model_usage VALUES (?, ?)');

    insertTurn.run('zs1', 'zt1', targetTs, 100, 50, 10, 20, 30, 150);
    insertModel.run('zt1', 'glm-5.3');
    insertTurn.run('zs1', 'zt2', targetTs + 1000, 200, 80, 20, 30, 40, 280);
    insertModel.run('zt2', 'glm-5.3');
    zdb.close();

    const adapter = createZCodeAdapter({ filePath: zcodeDbPath });

    // 1. First sweep: imports 2 turns
    const sweep1 = sweepUsage({ store, adapters: [adapter], now: 1792000000000 });
    assert.equal(sweep1.eventCount, 2, 'should import 2 zcode turns');

    // 2. Incremental sweep: adds 0
    const sweep2 = sweepUsage({ store, adapters: [adapter], now: 1792000001000 });
    assert.equal(sweep2.eventCount, 0, 'second sweep on unchanged zcode db must add 0 events');

    // 3. Superseding test: snapshot fact on targetDate must be superseded
    const snapRow = db.prepare("SELECT state FROM usage_events WHERE natural_key = 'snapshot:zcode:' || ? || ':snap1'").get(targetDate);
    assert.equal(snapRow.state, 'superseded', 'snapshot zcode fact must be superseded by native facts');

    // 4. Durability test: delete zcode sqlite file -> facts remain active, watermark not dirty
    fs.unlinkSync(zcodeDbPath);
    const sweep3 = sweepUsage({ store, adapters: [adapter], now: 1792000002000 });
    assert.equal(sweep3.eventCount, 0);

    const activeCount = db.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE client_id = 'zcode' AND source_kind = 'zcode-db' AND state = 'active'").get().c;
    assert.equal(activeCount, 2, 'all native zcode facts must remain active after db deletion');

    const wm = store.readSourceWatermark('zcode-db', adapter.sourceId);
    assert.equal(wm?.dirty, 0, 'watermark must remain clean');

    store.close();
  } finally {
    cleanup(f);
  }
});

function encodeVarint(value) {
  const bytes = [];
  let n = value >>> 0;
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n & 0x7f);
  return bytes;
}
function fieldVarint(tag, num) { return [...encodeVarint((tag << 3) | 0), ...encodeVarint(num)]; }
function fieldBytes(tag, bytes) { return [...encodeVarint((tag << 3) | 2), ...encodeVarint(bytes.length), ...bytes]; }
function fieldString(tag, str) { return fieldBytes(tag, Buffer.from(str, 'utf8')); }

function createMockAntigravityDb(filePath, opts = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('CREATE TABLE gen_metadata (idx INTEGER, data BLOB, retry BLOB)');
  db.exec('CREATE TABLE steps (step INTEGER, idx INTEGER, metadata BLOB, state BLOB)');

  const usageBytes = [
    ...fieldVarint(2, opts.uncachedInput || 1000),
    ...fieldVarint(3, opts.output || 500),
    ...fieldVarint(5, opts.cachedInput || 200),
    ...fieldVarint(9, opts.reasoning || 100),
    ...fieldString(11, opts.responseId || 'resp-1')
  ];
  const timestampBytes = [
    ...fieldVarint(1, opts.timestampSeconds || 1792400000),
    ...fieldVarint(2, 0)
  ];
  const timeContainer = [...fieldBytes(4, timestampBytes)];
  const dataBytes = [
    ...fieldString(19, opts.model || 'gemini-3.8-flash'),
    ...fieldBytes(4, usageBytes),
    ...fieldBytes(9, timeContainer)
  ];
  const payload = Buffer.from(fieldBytes(1, dataBytes));

  const ins = db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)');
  ins.run(0, payload);
  db.close();
}

test('durability on file/row deletion: once swept, deleting source files never removes facts, never supersedes/zeroes them, and canonicalFactDayRows totals stay unchanged (antigravity, codex, claude, opencode)', () => {
  const f = fixture();
  try {
    const store = createTokenLedgerStore({ path: f.ledger, homeDir: f.dir });
    const db = store.database();
    const today = '2026-10-24';

    // 1. ANTIGRAVITY DISK FIXTURE
    const agDir = path.join(f.dir, 'antigravity-convos');
    const agFile = path.join(agDir, 'sess-ag-1.db');
    // timestampSeconds: 1792400000 -> 2026-10-20
    createMockAntigravityDb(agFile, {
      model: 'gemini-3.8-flash',
      timestampSeconds: 1792400000,
      uncachedInput: 1000,
      cachedInput: 200,
      output: 500,
      reasoning: 100,
      responseId: 'ag-resp-durability-1'
    });

    const agAdapter = createAntigravityAdapter({
      sourceId: 'antigravity-disk',
      readRecords: () => readAntigravityUsage([agDir], 0).records
    });

    // 2. CODEX FIXTURE
    const codexDir = path.join(f.dir, 'codex-sessions');
    fs.mkdirSync(codexDir, { recursive: true });
    const codexFile = path.join(codexDir, 'sess-codex.jsonl');
    fs.writeFileSync(codexFile, [
      JSON.stringify({ timestamp: '2026-10-20T10:00:00Z', type: 'session_meta', payload: { id: 'sess-c-1' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      JSON.stringify({ timestamp: '2026-10-20T10:01:00Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 300, cached_input_tokens: 50, output_tokens: 150, reasoning_output_tokens: 30 } } } })
    ].join('\n') + '\n');
    const codexAdapter = createCodexAdapter({ sessionsDir: codexDir, cachePath: null });

    // 3. CLAUDE FIXTURE
    const claudeDir = path.join(f.dir, 'claude-projects');
    fs.mkdirSync(claudeDir, { recursive: true });
    const claudeFile = path.join(claudeDir, 'chat.jsonl');
    fs.writeFileSync(claudeFile, JSON.stringify({
      type: 'assistant',
      requestId: 'req-claude-dur',
      timestamp: '2026-10-20T10:00:00Z',
      message: { id: 'msg-cl-1', model: 'claude-sonnet-4-5', usage: { input_tokens: 400, output_tokens: 200 } }
    }) + '\n');
    const claudeAdapter = createClaudeAdapter({ dirPath: claudeDir, sourceId: 'claude-test' });

    // 4. OPENCODE FIXTURE
    const openDbPath = path.join(f.dir, 'opencode.db');
    const openDb = new DatabaseSync(openDbPath);
    openDb.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);');
    openDb.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(
      'm-open-dur', 's-open-1', 1792400000000, 1792400000000,
      JSON.stringify({ role: 'assistant', model: { id: 'gpt-6.1-sol' }, tokens: { input: 500, output: 250 } })
    );
    openDb.close();
    const opencodeAdapter = createOpenCodeAdapter({ filePath: openDbPath, sourceId: 'opencode-test' });

    const allAdapters = [agAdapter, codexAdapter, claudeAdapter, opencodeAdapter];

    // First sweep: imports all 4 clients
    const sweep1 = sweepUsage({ store, adapters: allAdapters, now: 1792400000000 });
    assert.ok(sweep1.eventCount > 0, 'first sweep should import events');

    const rowsBefore = canonicalFactDayRows(db, { today });
    const agBefore = rowsBefore.find((r) => r.perClient?.antigravity)?.perClient?.antigravity?.tokens;
    const codexBefore = rowsBefore.find((r) => r.perClient?.codex)?.perClient?.codex?.tokens;
    const claudeBefore = rowsBefore.find((r) => r.perClient?.claude)?.perClient?.claude?.tokens;
    const openBefore = rowsBefore.find((r) => r.perClient?.opencode)?.perClient?.opencode?.tokens;

    assert.ok(agBefore > 0, 'antigravity tokens before deletion');
    assert.ok(codexBefore > 0, 'codex tokens before deletion');
    assert.ok(claudeBefore > 0, 'claude tokens before deletion');
    assert.ok(openBefore > 0, 'opencode tokens before deletion');

    // DELETE SOURCE FILES / ROWS FOR ALL 4 CLIENTS
    fs.unlinkSync(agFile);
    fs.unlinkSync(codexFile);
    fs.unlinkSync(claudeFile);
    const openDb2 = new DatabaseSync(openDbPath);
    openDb2.prepare('DELETE FROM message WHERE id = ?').run('m-open-dur');
    openDb2.close();

    // Second sweep: files are gone
    const sweep2 = sweepUsage({ store, adapters: allAdapters, now: 1792400001000 });
    assert.equal(sweep2.eventCount, 0, 'second sweep with deleted files must add 0 events');

    // Assert that active events are NOT zeroed or superseded
    const supersededCounts = db.prepare("SELECT client_id, COUNT(*) as c FROM usage_events WHERE state = 'superseded' GROUP BY client_id").all();
    assert.equal(supersededCounts.length, 0, 'no events should be superseded on source deletion');

    // Assert canonicalFactDayRows still returns the exact same day totals
    const rowsAfter = canonicalFactDayRows(db, { today });
    const agAfter = rowsAfter.find((r) => r.perClient?.antigravity)?.perClient?.antigravity?.tokens;
    const codexAfter = rowsAfter.find((r) => r.perClient?.codex)?.perClient?.codex?.tokens;
    const claudeAfter = rowsAfter.find((r) => r.perClient?.claude)?.perClient?.claude?.tokens;
    const openAfter = rowsAfter.find((r) => r.perClient?.opencode)?.perClient?.opencode?.tokens;

    assert.equal(agAfter, agBefore, 'antigravity day totals must be unchanged after source file deletion');
    assert.equal(codexAfter, codexBefore, 'codex day totals must be unchanged after source file deletion');
    assert.equal(claudeAfter, claudeBefore, 'claude day totals must be unchanged after source file deletion');
    assert.equal(openAfter, openBefore, 'opencode day totals must be unchanged after source row deletion');

    store.close();
  } finally {
    cleanup(f);
  }
});
