'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { withLocalLedgerHistory } = require('../../src/electron/localLedgerSync');
const { emptyPeriod } = require('../../src/shared/usage');
const { serializeSyncPayload } = require('../../src/shared/syncPayload');
const { collectUsageOnce, localTodayKey } = require('../../src/shared/collector');

function createSamplePeriods(overrides = {}) {
  const base = emptyPeriod();
  return {
    today: { ...base, ...overrides.today },
    month: { ...base, ...overrides.month },
    allTime: { ...base, ...overrides.allTime }
  };
}

test('history reader wiring: full tick invokes sweepUsage once; watch tick applies exact today delta and skips sweep', async () => {
  const operations = [];

  const mockRunTokscale = async ({ flags }) => {
    operations.push(`tokscale:${flags[0]}`);
    return {
      entries: [{ client: 'codex', sessionId: 'sess-1', model: 'gpt-4o', input: 50, output: 50, cost: 0.05, messages: 1 }]
    };
  };

  const mockSweep = ({ mode }) => {
    operations.push(`sweep:${mode}`);
    return { eventCount: 1, sources: [] };
  };

  // 1. Full collection tick
  const fullResult = await collectUsageOnce({
    clients: 'codex',
    deviceId: 'wiring-device',
    allTimeSince: '2026-01-01',
    limitsEnabled: false,
    projectsEnabled: false,
    wslScanEnabled: false,
    runTokscale: mockRunTokscale,
    sweepUsage: mockSweep
  });

  assert.equal(fullResult.today.totalTokens, 100);
  assert.deepEqual(operations, [
    'tokscale:--today',
    'tokscale:--month',
    'tokscale:--since',
    'sweep:full'
  ]);

  // 2. Watch collection tick
  operations.length = 0;
  const now = new Date();
  const anchor = {
    dateKey: localTodayKey(now),
    sessionIdentityVersion: 1,
    today: fullResult.today,
    month: fullResult.month,
    allTime: fullResult.allTime,
    todayPartitions: { codex: fullResult.today }
  };

  const watchResult = await collectUsageOnce({
    clients: 'codex',
    deviceId: 'wiring-device',
    allTimeSince: '2026-01-01',
    limitsEnabled: false,
    projectsEnabled: false,
    wslScanEnabled: false,
    todayOnlyAnchor: anchor,
    runTokscale: mockRunTokscale,
    sweepUsage: mockSweep
  });

  assert.deepEqual(operations, ['tokscale:--today']);
  assert.equal(watchResult.today.totalTokens, 100);
});

test('history reader wiring: stale anchor forces a full scan with sweep', async () => {
  const operations = [];
  const mockRunTokscale = async ({ flags }) => {
    operations.push(`tokscale:${flags[0]}`);
    return { entries: [{ client: 'claude', sessionId: 'c-1', model: 'sonnet', input: 20, messages: 1 }] };
  };

  const mockSweep = ({ mode }) => {
    operations.push(`sweep:${mode}`);
  };


  const summary = await collectUsageOnce({
    clients: 'claude',
    deviceId: 'stale-test',
    allTimeSince: '2026-01-01',
    limitsEnabled: false,
    projectsEnabled: false,
    wslScanEnabled: false,
    todayOnlyAnchor: null, // caller startCollector zeroes stale anchor
    runTokscale: mockRunTokscale,
    sweepUsage: mockSweep
  });

  assert.deepEqual(operations, [
    'tokscale:--today',
    'tokscale:--month',
    'tokscale:--since',
    'sweep:full'
  ]);
  assert.equal(summary.today.totalTokens, 20);
});

test('history reader wiring: SQL rollups take precedence over legacy archive when SQL coverage is complete', () => {
  const sqlDaily = [
    {
      date: '2026-10-18',
      tokens: 8000,
      cost: 0.8,
      messages: 8,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 7000,
      unclassifiedTokens: 0,
      perClient: { codex: { tokens: 8000, cost: 0.8, messages: 8 } },
      perModel: { 'gpt-4o': { tokens: 8000, cost: 0.8 } }
    }
  ];

  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-18',
        tokens: 4000, // Archive has fewer tokens
        cost: 0.4,
        perClient: { codex: { tokens: 4000, cost: 0.4 } }
      }
    ]
  };

  const mockDb = {
    prepare: (_sql) => ({
      get: () => (_sql.includes('dirty = 1') ? null : { ok: 1 }),
      all: () => [{ date_bucket: '2026-10-18', provider: 'codex', tokens: 8000 }]
    })
  };

  let overlaySentToReader = null;
  const mockStore = {
    database: () => mockDb,
    readHistory: (opts) => {
      overlaySentToReader = opts.overlayHistory;
      return { daily: sqlDaily, monthly: [], summary: { totalTokens: 8000 } };
    },
    readPeriods: () => createSamplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 8000 } })
  };

  const stats = {
    mode: 'local',
    periods: createSamplePeriods(),
    devices: [{ deviceId: 'prec-dev', periods: createSamplePeriods(), allTime: emptyPeriod() }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'prec-dev',
    today: '2026-10-23'
  });

  assert.equal(synced.history.summary.totalTokens, 8000);
  assert.equal(synced.history.sqlCoverageComplete, true);
  // Archive overlay was omitted because SQL is complete
  assert.equal(overlaySentToReader?.daily?.length || 0, 0);
});

test('history reader wiring: incomplete SQL coverage falls back to archive max-overlay with diagnostic reason', () => {
  const diagnostics = [];
  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-12',
        tokens: 15000,
        cost: 1.5,
        perClient: { codex: { tokens: 15000, cost: 1.5 } }
      }
    ]
  };

  const mockDb = {
    prepare: (_sql) => ({
      get: () => (_sql.includes('dirty = 1') ? { dirty: 1 } : { ok: 1 }),
      all: () => [{ date_bucket: '2026-10-12', provider: 'codex', tokens: 5000 }]
    })
  };

  let overlaySentToReader = null;
  const mockStore = {
    database: () => mockDb,
    readHistory: (opts) => {
      overlaySentToReader = opts.overlayHistory;
      return {
        daily: [{ date: '2026-10-12', tokens: 15000, perClient: { codex: { tokens: 15000 } } }],
        monthly: [],
        summary: { totalTokens: 15000 }
      };
    },
    readPeriods: () => createSamplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 15000 } })
  };

  const stats = {
    mode: 'local',
    periods: createSamplePeriods(),
    devices: [{ deviceId: 'fallback-dev', periods: createSamplePeriods(), allTime: emptyPeriod() }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'fallback-dev',
    today: '2026-10-23',
    onDiagnosticEvent: (event) => diagnostics.push(event)
  });

  assert.equal(synced.history.sqlCoverageComplete, false);
  assert.ok(synced.diagnosticReason);
  assert.equal(overlaySentToReader, archiveOverlay, 'full archive was passed to retain max merge');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'sql-coverage-incomplete');
});

test('history reader wiring: DSH client rows are filtered from accounting and do not enter rollups or wire history', () => {
  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-15',
        tokens: 50000,
        perClient: {
          dsh: { tokens: 50000, cost: 5.0 },
          claude: { tokens: 1000, cost: 0.1 }
        }
      }
    ]
  };

  const mockDb = {
    prepare: (_sql) => ({
      get: () => (_sql.includes('dirty = 1') ? null : { ok: 1 }),
      all: () => [{ date_bucket: '2026-10-15', provider: 'claude', tokens: 1000 }]
    })
  };

  const mockStore = {
    database: () => mockDb,
    readHistory: () => ({
      daily: [{ date: '2026-10-15', tokens: 1000, perClient: { claude: { tokens: 1000 } } }],
      monthly: [],
      summary: { totalTokens: 1000 }
    }),
    readPeriods: () => createSamplePeriods({
      allTime: {
        ...emptyPeriod(),
        totalTokens: 1000,
        clientModels: { dsh: { 'deepseek-chat': 50000 }, claude: { sonnet: 1000 } }
      }
    })
  };

  const stats = {
    mode: 'local',
    periods: createSamplePeriods({
      allTime: {
        ...emptyPeriod(),
        totalTokens: 1000,
        clientModels: { dsh: { 'deepseek-chat': 50000 }, claude: { sonnet: 1000 } }
      }
    }),
    devices: [{
      deviceId: 'dev-dsh-test',
      periods: createSamplePeriods({
        allTime: {
          ...emptyPeriod(),
          totalTokens: 1000,
          clientModels: { dsh: { 'deepseek-chat': 50000 }, claude: { sonnet: 1000 } }
        }
      }),
      allTime: emptyPeriod()
    }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-dsh-test',
    today: '2026-10-23'
  });

  assert.equal(synced.history.daily[0].perClient.dsh, undefined, 'dsh must not appear in perClient history');
  assert.equal(synced.periods.allTime.clientModels.dsh, undefined, 'dsh must not appear in clientModels period');
  assert.ok(synced.periods.allTime.clientModels.claude, 'claude must remain');
});

test('history reader wiring: Hub payload shape remains identical and contains no watermark data or source paths', () => {
  const mockStore = {
    readHistory: () => ({
      daily: [{ date: '2026-10-20', tokens: 5000 }],
      monthly: [{ month: '2026-10', tokens: 5000 }],
      summary: { totalTokens: 5000 }
    }),
    readPeriods: () => createSamplePeriods({
      today: { ...emptyPeriod(), totalTokens: 100 },
      month: { ...emptyPeriod(), totalTokens: 2000 },
      allTime: { ...emptyPeriod(), totalTokens: 5000 }
    })
  };

  const rawSummary = {
    deviceId: 'hub-device-1',
    hostname: 'test-host',
    platform: 'darwin-arm64',
    updatedAt: new Date().toISOString(),
    trackedClients: ['codex', 'claude'],
    periods: createSamplePeriods({
      today: { ...emptyPeriod(), totalTokens: 100 },
      month: { ...emptyPeriod(), totalTokens: 2000 },
      allTime: { ...emptyPeriod(), totalTokens: 5000 }
    }),
    today: { ...emptyPeriod(), totalTokens: 100 },
    month: { ...emptyPeriod(), totalTokens: 2000 },
    allTime: { ...emptyPeriod(), totalTokens: 5000 },
    devices: [{ deviceId: 'hub-device-1', periods: createSamplePeriods(), allTime: emptyPeriod() }],
    // Internal fields that must not be sent to Hub
    watermarks: [{ sourceKind: 'test', cursor: {} }],
    sourceWatermarks: { test: {} },
    sourcePaths: ['/tmp/source.log'],
    sweepResult: { eventCount: 10 }
  };

  const synced = withLocalLedgerHistory(rawSummary, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'hub-device-1',
    isWatchTick: false
  });

  // Ensure internal fields are stripped before Hub post
  delete synced.watermarks;
  delete synced.sourceWatermarks;
  delete synced.sourcePaths;
  delete synced.sweepResult;

  const serialized = serializeSyncPayload(synced);
  const payload = serialized.payload;

  assert.equal(payload.deviceId, 'hub-device-1');
  assert.equal(payload.today.totalTokens, 100);
  assert.equal(payload.month.totalTokens, 2000);
  assert.equal(payload.allTime.totalTokens, 5000);

  // Assert wire fields contain NO raw source paths or watermark data
  assert.equal(payload.watermarks, undefined);
  assert.equal(payload.sourceWatermarks, undefined);
  assert.equal(payload.sourcePaths, undefined);
  assert.equal(payload.sweepResult, undefined);

  // Verify wire schema structure
  assert.ok(payload.today && typeof payload.today === 'object');
  assert.ok(payload.month && typeof payload.month === 'object');
  assert.ok(payload.allTime && typeof payload.allTime === 'object');
});
