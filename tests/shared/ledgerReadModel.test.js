'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const {
  ensureSchema,
  createTokenLedgerStore,
  beginSweepRun,
  finishSweepRun,
  upsertUsageEvent
} = require('../../src/shared/usage/tokenLedger');
const {
  buildLedgerReadModel,
  writeLedgerReadModel,
  readLedgerReadModel,
  readModelHistory,
  readModelPeriods,
  sanitizeHistoryAccounting,
  clonePeriods
} = require('../../src/shared/usage/ledgerReadModel');
const {
  localLedgerHistory,
  withLocalLedgerHistory
} = require('../../src/electron/localLedgerSync');
const { emptyPeriod } = require('../../src/shared/usage');

function createFixtureLedger() {
  const db = new DatabaseSync(':memory:');
  ensureSchema(db);

  const sweepId = beginSweepRun(db, { mode: 'full' });

  const events = [
    // 2026-10-21: codex & claude
    {
      naturalKey: 'test:codex:1',
      clientId: 'codex',
      sourceKind: 'codex-sessions',
      sessionId: 'sess-codex-1',
      occurredAtMs: Date.parse('2026-10-21T10:00:00Z'),
      dateBucket: '2026-10-21',
      modelId: 'gpt-4o',
      inputTokens: 1000,
      cachedInputTokens: 200,
      cacheWriteTokens: 100,
      outputTokens: 500,
      totalTokens: 1800,
      costUsd: 0.05,
      state: 'active'
    },
    {
      naturalKey: 'test:claude:1',
      clientId: 'claude',
      sourceKind: 'claude-projects',
      sessionId: 'sess-claude-1',
      occurredAtMs: Date.parse('2026-10-21T11:00:00Z'),
      dateBucket: '2026-10-21',
      modelId: 'claude-3-5-sonnet',
      inputTokens: 2000,
      cachedInputTokens: 500,
      cacheWriteTokens: 200,
      outputTokens: 800,
      totalTokens: 3500,
      costUsd: 0.12,
      state: 'active'
    },
    // 2026-10-22: antigravity & opencode
    {
      naturalKey: 'test:antigravity:1',
      clientId: 'antigravity',
      sourceKind: 'antigravity-disk',
      sessionId: 'sess-ag-1',
      occurredAtMs: Date.parse('2026-10-22T09:00:00Z'),
      dateBucket: '2026-10-22',
      modelId: 'gemini-3.8-flash',
      inputTokens: 5000,
      cachedInputTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 1000,
      totalTokens: 7000,
      costUsd: 0.02,
      state: 'active'
    },
    {
      naturalKey: 'test:opencode:1',
      clientId: 'opencode',
      sourceKind: 'opencode-db',
      sessionId: 'sess-oc-1',
      occurredAtMs: Date.parse('2026-10-22T14:00:00Z'),
      dateBucket: '2026-10-22',
      modelId: 'deepseek-coder',
      inputTokens: 3000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1500,
      totalTokens: 4500,
      costUsd: 0.08,
      state: 'active'
    },
    // 2026-10-23 (today): codex & antigravity
    {
      naturalKey: 'test:codex:2',
      clientId: 'codex',
      sourceKind: 'codex-sessions',
      sessionId: 'sess-codex-2',
      occurredAtMs: Date.parse('2026-10-23T08:00:00Z'),
      dateBucket: '2026-10-23',
      modelId: 'gpt-4o',
      inputTokens: 4000,
      cachedInputTokens: 1000,
      cacheWriteTokens: 500,
      outputTokens: 2000,
      totalTokens: 7500,
      costUsd: 0.15,
      state: 'active'
    },
    {
      naturalKey: 'test:antigravity:2',
      clientId: 'antigravity',
      sourceKind: 'antigravity-disk',
      sessionId: 'sess-ag-2',
      occurredAtMs: Date.parse('2026-10-23T12:00:00Z'),
      dateBucket: '2026-10-23',
      modelId: 'gemini-3.8-flash',
      inputTokens: 8000,
      cachedInputTokens: 2000,
      cacheWriteTokens: 0,
      outputTokens: 3000,
      totalTokens: 13000,
      costUsd: 0.04,
      state: 'active'
    }
  ];

  for (const ev of events) {
    upsertUsageEvent(db, ev, { runId: sweepId });
  }

  finishSweepRun(db, sweepId, { status: 'completed' });
  return { db, sweepId };
}

test('buildLedgerReadModel equivalence: periods, history, sessionsByWindow, and dayRows deep-equal current reader functions', () => {
  const { db, sweepId } = createFixtureLedger();
  const store = createTokenLedgerStore({ database: db });
  const today = '2026-10-23';

  // Compute read model
  const readModel = buildLedgerReadModel(store, { today, historyDays: 90 });

  // Current reader function outputs
  const currentPeriods = clonePeriods(store.readPeriods({ today }));
  const currentSessionsByWindow = store.sessionsByWindow({ today });
  const currentDayRows = store.canonicalFactDayRows({ today });

  const rawHistory = store.readHistory({
    today,
    historyDays: 90,
    sqlCoverageComplete: true,
    overlayHistory: { daily: [] }
  });
  const currentHistory = sanitizeHistoryAccounting(rawHistory);
  currentHistory.sqlCoverageComplete = true;
  currentHistory.sessionsByWindow = currentSessionsByWindow;

  // Assert equivalence
  assert.deepEqual(readModel.periods, currentPeriods, 'periods deep-equal');
  assert.deepEqual(readModel.history, currentHistory, 'history deep-equal');
  assert.deepEqual(readModel.sessionsByWindow, currentSessionsByWindow, 'sessionsByWindow deep-equal');
  assert.deepEqual(readModel.dayRows, currentDayRows, 'dayRows deep-equal');

  // Verify write and read round-trip
  writeLedgerReadModel(db, readModel);
  const readBack = readLedgerReadModel(db);
  assert.equal(readBack.sweepId, sweepId);
  assert.equal(readBack.localDay, today);
  assert.deepEqual(readBack.payload.periods, currentPeriods);
  assert.deepEqual(readBack.payload.history, currentHistory);
  assert.deepEqual(readBack.payload.sessionsByWindow, currentSessionsByWindow);
  assert.deepEqual(readBack.payload.dayRows, currentDayRows);

  // Now that read model is in DB, localLedgerHistory returns the exact same history
  const servedHistory = localLedgerHistory(null, { tokenLedgerStore: store, today });
  assert.deepEqual(servedHistory, currentHistory, 'served localLedgerHistory equals readModel history');
});

test('equivalence with overlay and basePeriods: readModelHistory and readModelPeriods deep-equal store functions', () => {
  const { db } = createFixtureLedger();
  const store = createTokenLedgerStore({ database: db });
  const today = '2026-10-23';

  const readModel = buildLedgerReadModel(store, { today });

  // Overlay containing:
  // (i) today with MORE tokens than the ledger (e.g. codex 15000 > 7500)
  // (ii) a new client today ('cline')
  // (iii) a past day ('2026-10-20')
  const overlay = [
    {
      date: today,
      tokens: 33000,
      cost: 0.35,
      cacheReadTokens: 4000,
      cacheWriteTokens: 1000,
      outputTokens: 8000,
      unclassifiedTokens: 0,
      perClient: {
        codex: {
          tokens: 15000,
          cost: 0.25,
          cacheReadTokens: 2000,
          cacheWriteTokens: 1000,
          outputTokens: 4000,
          unclassifiedTokens: 0
        },
        antigravity: {
          tokens: 13000,
          cost: 0.04,
          cacheReadTokens: 2000,
          cacheWriteTokens: 0,
          outputTokens: 3000,
          unclassifiedTokens: 0
        },
        cline: {
          tokens: 5000,
          cost: 0.06,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 1000,
          unclassifiedTokens: 0
        }
      },
      perModel: {
        'gpt-4o': {
          tokens: 15000,
          cost: 0.25,
          cacheReadTokens: 2000,
          cacheWriteTokens: 1000,
          outputTokens: 4000,
          unclassifiedTokens: 0
        },
        'gemini-3.8-flash': {
          tokens: 13000,
          cost: 0.04,
          cacheReadTokens: 2000,
          cacheWriteTokens: 0,
          outputTokens: 3000,
          unclassifiedTokens: 0
        },
        'claude-3-5-sonnet': {
          tokens: 5000,
          cost: 0.06,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 1000,
          unclassifiedTokens: 0
        }
      }
    },
    {
      date: '2026-10-20',
      tokens: 50000,
      cost: 1.0,
      perClient: {
        codex: { tokens: 50000, cost: 1.0 }
      }
    }
  ];

  // basePeriods with basePeriods.today.totalTokens set above the ledger value (ledger was 20500)
  const basePeriods = {
    today: {
      totalTokens: 45000,
      costUsd: 0.50,
      cacheReadTokens: 6000,
      cacheWriteTokens: 1500,
      outputTokens: 12000,
      unclassifiedTokens: 0
    },
    month: {
      totalTokens: 75000,
      costUsd: 1.20
    },
    allTime: {
      totalTokens: 150000,
      costUsd: 2.50
    }
  };

  // - readModelHistory(model, overlay, today) deep-equals sanitized store.readHistory({ overlayHistory: { daily: overlay }, today, sqlCoverageComplete: true }) on .daily
  const expectedHistory = sanitizeHistoryAccounting(store.readHistory({
    overlayHistory: { daily: overlay },
    today,
    sqlCoverageComplete: true
  }));
  const modelHistory = readModelHistory(readModel, overlay, today);
  assert.deepEqual(modelHistory.daily, expectedHistory.daily, 'readModelHistory daily deep-equals store.readHistory daily');

  // - readModelPeriods(model, { overlayHistory: { daily: overlay }, basePeriods, today }) deep-equals store.readPeriods({ same args }) for today/month/allTime
  const periodsArgs = {
    overlayHistory: { daily: overlay },
    basePeriods,
    today
  };
  const expectedPeriods = store.readPeriods(periodsArgs);
  const modelPeriods = readModelPeriods(readModel, periodsArgs);
  for (const name of ['today', 'month', 'allTime']) {
    assert.deepEqual(modelPeriods[name], expectedPeriods[name], `readModelPeriods ${name} deep-equals store.readPeriods ${name}`);
  }

  // Also verify localLedgerHistory with overlay matches modelHistory
  writeLedgerReadModel(db, readModel);
  const servedHistory = localLedgerHistory({ daily: overlay }, { tokenLedgerStore: store, today });
  assert.deepEqual(servedHistory.daily, modelHistory.daily, 'served localLedgerHistory equals modelHistory with overlay');
});

test('guard test: with read model present, main readers do not call queryDistinctSessionMap, canonicalFactDayRows, or computeSessionsByWindow', () => {
  const { db } = createFixtureLedger();
  const store = createTokenLedgerStore({ database: db });
  const today = '2026-10-23';

  // Build and write the read model
  const readModel = buildLedgerReadModel(store, { today });
  writeLedgerReadModel(db, readModel);

  // Set up spies on the forbidden functions
  let canonicalFactDayRowsCalls = 0;
  let computeSessionsByWindowCalls = 0;

  const originalCanonicalFactDayRows = store.canonicalFactDayRows;
  const originalSessionsByWindow = store.sessionsByWindow;

  store.canonicalFactDayRows = (...args) => {
    canonicalFactDayRowsCalls++;
    return originalCanonicalFactDayRows.apply(store, args);
  };
  store.sessionsByWindow = (...args) => {
    computeSessionsByWindowCalls++;
    return originalSessionsByWindow.apply(store, args);
  };

  // Also spy on database.prepare to catch direct SQL calls to queryDistinctSessionMap or canonicalFactRows
  let queryDistinctSessionMapSqlCalls = 0;
  let canonicalFactRowsSqlCalls = 0;
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql, ...rest) => {
    if (sql.includes('COUNT(DISTINCT ue.session_id)')) {
      queryDistinctSessionMapSqlCalls++;
    }
    if (sql.includes('canonicalFactRows') || (sql.includes('FROM usage_events') && sql.includes('GROUP BY date_bucket, client_id'))) {
      canonicalFactRowsSqlCalls++;
    }
    return originalPrepare(sql, ...rest);
  };

  // Execute main's reader paths
  // 1. localLedgerHistory
  const h = localLedgerHistory(null, { tokenLedgerStore: store, today });
  assert.ok(h);
  assert.equal(h.sqlCoverageComplete, true);

  // 2. withLocalLedgerHistory
  const samplePeriod = () => ({ ...emptyPeriod() });
  const stats = {
    mode: 'local',
    periods: { today: samplePeriod(), month: samplePeriod(), allTime: samplePeriod() },
    devices: [{ deviceId: 'test-device', periods: { today: samplePeriod(), month: samplePeriod(), allTime: samplePeriod() } }]
  };
  const synced = withLocalLedgerHistory(stats, null, { tokenLedgerStore: store, today });
  assert.ok(synced);
  assert.ok(synced.periods);

  // Verify none of the forbidden functions or SQL queries were called
  assert.equal(canonicalFactDayRowsCalls, 0, 'canonicalFactDayRows must not be called');
  assert.equal(computeSessionsByWindowCalls, 0, 'computeSessionsByWindow must not be called');
  assert.equal(queryDistinctSessionMapSqlCalls, 0, 'queryDistinctSessionMap must not be called in SQL');
  assert.equal(canonicalFactRowsSqlCalls, 0, 'canonicalFactRows must not be called in SQL');
});
