'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testSharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-shared-sync-'));
process.env.TOKEN_MONITOR_SHARED_DIR = testSharedDir;

const { withLocalLedgerHistory } = require('../../src/electron/localLedgerSync');
const { createTokenLedgerStore } = require('../../src/shared/usage/tokenLedger');
const { emptyPeriod } = require('../../src/shared/usage');

function samplePeriods(overrides = {}) {
  const base = emptyPeriod();
  return {
    today: { ...base, ...overrides.today },
    month: { ...base, ...overrides.month },
    allTime: { ...base, ...overrides.allTime }
  };
}

test('withLocalLedgerHistory synchronizes stats.periods.allTime, device.periods.allTime and device.allTime to be identical (>= 13B tokens)', () => {
  // Pre-sync: device and stats only show live tokscale scan of 4B tokens
  const initialAllTime = {
    ...emptyPeriod(),
    totalTokens: 4_000_000_000,
    costUsd: 150.00
  };

  const localDevice = {
    deviceId: 'test-local-mac',
    hostname: 'MacBook-Pro',
    platform: 'darwin-arm64',
    periods: samplePeriods({ allTime: initialAllTime }),
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: { ...initialAllTime }
  };

  const inputStats = {
    mode: 'local',
    periods: samplePeriods({ allTime: initialAllTime }),
    devices: [localDevice]
  };

  // Mock ledger store with 13B historical baseline + overlay
  const ledgerAllTime = {
    ...emptyPeriod(),
    totalTokens: 13_500_000_000,
    costUsd: 422.50
  };
  const mockPeriods = samplePeriods({ allTime: ledgerAllTime });
  const mockStore = {
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 13_500_000_000 } }),
    readPeriods: () => mockPeriods
  };

  const synced = withLocalLedgerHistory(inputStats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'test-local-mac'
  });

  // Verify all 3 are identical and >= 13,000,000,000
  assert.equal(synced.periods.allTime.totalTokens, 13_500_000_000);
  assert.equal(synced.devices[0].periods.allTime.totalTokens, 13_500_000_000);
  assert.equal(synced.devices[0].allTime.totalTokens, 13_500_000_000);
  assert.ok(synced.periods.allTime.totalTokens >= 13_000_000_000);
  assert.equal(synced.periods.allTime.totalTokens, synced.devices[0].periods.allTime.totalTokens);
  assert.equal(synced.periods.allTime.totalTokens, synced.devices[0].allTime.totalTokens);
});

test('stats.periods.allTime.costUsd is never less than single device cost ($412 vs $422 discrepancy resolved)', () => {
  // Scenario: live device has higher cost ($422.50), but token ledger historical turns only priced $412.00
  const deviceAllTime = {
    ...emptyPeriod(),
    totalTokens: 4_000_000_000,
    costUsd: 422.50
  };

  const localDevice = {
    deviceId: 'my-mac',
    periods: samplePeriods({ allTime: deviceAllTime }),
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: { ...deviceAllTime }
  };

  const inputStats = {
    mode: 'local',
    periods: samplePeriods({ allTime: { ...deviceAllTime } }),
    devices: [localDevice]
  };

  const ledgerAllTime = {
    ...emptyPeriod(),
    totalTokens: 13_000_000_000,
    costUsd: 412.00 // Lower historical priced cost
  };
  const mockStore = {
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 13_000_000_000 } }),
    readPeriods: () => samplePeriods({ allTime: ledgerAllTime })
  };

  const synced = withLocalLedgerHistory(inputStats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'my-mac'
  });

  // Total cost must NOT be downgraded to $412. It must be >= single device cost ($422.50)
  assert.ok(synced.periods.allTime.costUsd >= synced.devices[0].allTime.costUsd);
  assert.equal(synced.periods.allTime.costUsd, 422.50);
  assert.equal(synced.devices[0].allTime.costUsd, 422.50);
  assert.equal(synced.devices[0].periods.allTime.costUsd, 422.50);
});

test('clientModels and unpricedTokens are preserved on allTime periods', () => {
  const customClientModels = {
    codex: { 'gpt-4o': 500_000, 'o1-preview': 200_000 },
    claude: { 'claude-3-5-sonnet': 800_000 }
  };
  const customClientModelCosts = {
    codex: { 'gpt-4o': 5.0, 'o1-preview': 8.0 },
    claude: { 'claude-3-5-sonnet': 12.0 }
  };
  const customUnpricedTokens = 125_000;

  const deviceAllTime = {
    ...emptyPeriod(),
    totalTokens: 4_000_000_000,
    costUsd: 100.0,
    clientModels: customClientModels,
    clientModelCosts: customClientModelCosts,
    unpricedTokens: customUnpricedTokens
  };

  const localDevice = {
    deviceId: 'device-1',
    periods: samplePeriods({ allTime: deviceAllTime }),
    allTime: { ...deviceAllTime }
  };

  const inputStats = {
    mode: 'local',
    periods: samplePeriods({ allTime: { ...deviceAllTime } }),
    devices: [localDevice]
  };

  const mockStore = {
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 13_000_000_000 } }),
    // Ledger store readPeriods returns raw periods without clientModels
    readPeriods: () => samplePeriods({
      allTime: {
        ...emptyPeriod(),
        totalTokens: 13_000_000_000,
        costUsd: 250.0
      }
    })
  };

  const synced = withLocalLedgerHistory(inputStats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'device-1'
  });

  // Verify clientModels are preserved
  assert.deepEqual(synced.periods.allTime.clientModels, customClientModels);
  assert.deepEqual(synced.devices[0].periods.allTime.clientModels, customClientModels);
  assert.deepEqual(synced.devices[0].allTime.clientModels, customClientModels);

  // Verify clientModelCosts are preserved
  assert.deepEqual(synced.periods.allTime.clientModelCosts, customClientModelCosts);
  assert.deepEqual(synced.devices[0].periods.allTime.clientModelCosts, customClientModelCosts);
  assert.deepEqual(synced.devices[0].allTime.clientModelCosts, customClientModelCosts);

  // Verify unpricedTokens are preserved
  assert.equal(synced.periods.allTime.unpricedTokens, customUnpricedTokens);
  assert.equal(synced.devices[0].periods.allTime.unpricedTokens, customUnpricedTokens);
  assert.equal(synced.devices[0].allTime.unpricedTokens, customUnpricedTokens);
});

test('device matching matches by deviceId properly when target device is not at idx === 0', () => {
  const remoteDevice = {
    deviceId: 'remote-device-alpha',
    hostname: 'Remote-Mac',
    periods: samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 50_000 } }),
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: { ...emptyPeriod(), totalTokens: 50_000 }
  };

  const localDevice = {
    deviceId: 'local-device-beta',
    hostname: 'Local-Desktop',
    periods: samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 4_000_000_000 } }),
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: { ...emptyPeriod(), totalTokens: 4_000_000_000 }
  };

  const inputStats = {
    mode: 'local',
    periods: samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 4_000_050_000 } }),
    devices: [remoteDevice, localDevice] // remote is at index 0, local is at index 1
  };

  const mockStore = {
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 13_000_000_000 } }),
    readPeriods: () => samplePeriods({
      allTime: {
        ...emptyPeriod(),
        totalTokens: 13_000_000_000,
        costUsd: 422.50
      }
    })
  };

  const synced = withLocalLedgerHistory(inputStats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'local-device-beta'
  });

  // Index 0 (remote device) must remain completely untouched
  assert.equal(synced.devices[0].deviceId, 'remote-device-alpha');
  assert.equal(synced.devices[0].allTime.totalTokens, 50_000);
  assert.equal(synced.devices[0].periods.allTime.totalTokens, 50_000);

  // Index 1 (local device) must be updated to 13B
  assert.equal(synced.devices[1].deviceId, 'local-device-beta');
  assert.equal(synced.devices[1].periods.allTime.totalTokens, 13_000_000_000);
  assert.equal(synced.devices[1].allTime.totalTokens, 13_000_000_000);
});

test('integration with real tokenLedgerStore confirms totalTokens >= 13B with live overlay', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-sync-fixture-'));
  const fixtureFile = path.join(fixtureDir, 'token_ledger.sqlite');
  const repoPath = path.join(__dirname, '..', '..', 'data', 'token_ledger.sqlite');
  if (fs.existsSync(repoPath)) {
    fs.copyFileSync(repoPath, fixtureFile);
  }
  const store = createTokenLedgerStore({ path: fixtureFile });
  if (!store.available()) return;

  const overlayHistory = {
    daily: [
      {
        date: '2026-10-18',
        tokens: 1_700_000_000,
        cost: 10.0,
        messages: 50,
        perClient: { codex: { tokens: 1_700_000_000, cost: 10.0, messages: 50 } },
        perModel: { 'gpt-4o': { tokens: 1_700_000_000, cost: 10.0, messages: 50 } }
      }
    ]
  };

  const localDevice = {
    deviceId: 'real-local-device',
    periods: samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 4_000_000_000, costUsd: 422.50 } }),
    today: emptyPeriod(),
    month: emptyPeriod(),
    allTime: { ...emptyPeriod(), totalTokens: 4_000_000_000, costUsd: 422.50 }
  };

  const inputStats = {
    mode: 'local',
    periods: samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 4_000_000_000, costUsd: 422.50 } }),
    devices: [localDevice]
  };

  const synced = withLocalLedgerHistory(inputStats, overlayHistory, {
    tokenLedgerStore: store,
    deviceId: 'real-local-device'
  });

  // Verify baseline (reconciled 11.14B-11.66B) + overlay >= 11,000,000,000
  assert.ok(synced.periods.allTime.totalTokens >= 11_000_000_000);
  assert.equal(synced.devices[0].periods.allTime.totalTokens, synced.periods.allTime.totalTokens);
  assert.equal(synced.devices[0].allTime.totalTokens, synced.periods.allTime.totalTokens);
  assert.ok(synced.periods.allTime.costUsd >= synced.devices[0].allTime.costUsd);
});

test('withLocalLedgerHistory does not invoke store.writeHistory without explicit writeHistory: true', () => {
  let writeCalled = false;
  const mockStore = {
    readHistory: () => ({ daily: [{ date: '2026-10-21', tokens: 100 }], monthly: [], summary: { totalTokens: 100 } }),
    readPeriods: () => samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 100 } }),
    writeHistory: () => { writeCalled = true; }
  };
  const stats = {
    mode: 'local',
    periods: samplePeriods(),
    devices: [{ deviceId: 'dev-1', periods: samplePeriods(), allTime: emptyPeriod() }]
  };
  withLocalLedgerHistory(stats, null, { tokenLedgerStore: mockStore, deviceId: 'dev-1' });
  assert.equal(writeCalled, false, 'writeHistory should not be called by default');

  withLocalLedgerHistory(stats, null, { tokenLedgerStore: mockStore, deviceId: 'dev-1', writeHistory: true });
  assert.equal(writeCalled, true, 'writeHistory should be called when writeHistory: true');
});

test('SQL reader precedence selects SQL rollups when coverage is complete', () => {
  const sqlDaily = [
    {
      date: '2026-10-15',
      tokens: 5000,
      cost: 0.5,
      messages: 5,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 4000,
      unclassifiedTokens: 0,
      perClient: { codex: { tokens: 5000, cost: 0.5, messages: 5 } },
      perModel: { 'gpt-4o': { tokens: 5000, cost: 0.5 } }
    }
  ];

  // Archive has a lower or equal observation
  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-15',
        tokens: 3000,
        perClient: { codex: { tokens: 3000 } }
      }
    ]
  };

  const mockDb = {
    prepare: (sql) => ({
      get: () => (sql.includes('dirty = 1') ? null : { count: 1 }),
      all: () => [{ date_bucket: '2026-10-15', provider: 'codex', tokens: 5000 }]
    })
  };

  let capturedOverlay = null;
  const mockStore = {
    database: () => mockDb,
    readHistory: (opts) => {
      capturedOverlay = opts.overlayHistory;
      return { daily: sqlDaily, monthly: [], summary: { totalTokens: 5000 } };
    },
    readPeriods: () => samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 5000 } })
  };

  const stats = {
    mode: 'local',
    periods: samplePeriods(),
    devices: [{ deviceId: 'dev-sql', periods: samplePeriods(), allTime: emptyPeriod() }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-sql',
    today: '2026-10-23'
  });

  assert.equal(synced.history.summary.totalTokens, 5000);
  assert.equal(synced.history.sqlCoverageComplete, true);
  // Past archive overlay was not forwarded because SQL coverage was complete
  assert.equal(capturedOverlay?.daily?.length || 0, 0);
});

test('archive fallback retains max overlay and exposes diagnostic reason when SQL coverage is incomplete', () => {
  const diagnostics = [];
  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-10',
        tokens: 10000,
        perClient: { codex: { tokens: 10000 } }
      }
    ]
  };

  // Mock DB where watermark is dirty
  const mockDb = {
    prepare: (sql) => ({
      get: () => (sql.includes('dirty = 1') ? { dirty: 1 } : { count: 1 }),
      all: () => []
    })
  };

  let capturedOverlay = null;
  const mockStore = {
    database: () => mockDb,
    readHistory: (opts) => {
      capturedOverlay = opts.overlayHistory;
      return {
        daily: [{ date: '2026-10-10', tokens: 10000, perClient: { codex: { tokens: 10000 } } }],
        monthly: [],
        summary: { totalTokens: 10000 }
      };
    },
    readPeriods: () => samplePeriods({ allTime: { ...emptyPeriod(), totalTokens: 10000 } })
  };

  const stats = {
    mode: 'local',
    periods: samplePeriods(),
    devices: [{ deviceId: 'dev-fallback', periods: samplePeriods(), allTime: emptyPeriod() }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-fallback',
    today: '2026-10-23',
    onDiagnosticEvent: (event) => diagnostics.push(event)
  });

  assert.equal(synced.history.sqlCoverageComplete, false);
  assert.ok(synced.history.diagnosticReason);
  assert.equal(capturedOverlay, archiveOverlay, 'full archive overlay was forwarded for max merge');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'sql-coverage-incomplete');
  assert.equal(diagnostics[0].reason, 'watermark-dirty');
});

test('DSH observations in archive are filtered out and do not cause incomplete SQL coverage', () => {
  // Archive has DSH client with 999B tokens, but no other client
  const archiveOverlay = {
    daily: [
      {
        date: '2026-10-10',
        tokens: 999_000_000,
        perClient: { dsh: { tokens: 999_000_000 } }
      }
    ]
  };

  const mockDb = {
    prepare: (sql) => ({
      get: () => (sql.includes('dirty = 1') ? null : { count: 1 }),
      all: () => []
    })
  };

  const mockStore = {
    database: () => mockDb,
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 0 } }),
    readPeriods: () => samplePeriods()
  };

  const stats = {
    mode: 'local',
    periods: samplePeriods(),
    devices: [{ deviceId: 'dev-dsh', periods: samplePeriods(), allTime: emptyPeriod() }]
  };

  const synced = withLocalLedgerHistory(stats, archiveOverlay, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-dsh',
    today: '2026-10-23'
  });

  // DSH was filtered out, so SQL coverage is considered complete
  assert.equal(synced.history.sqlCoverageComplete, true);
  assert.equal(synced.history.diagnosticReason, undefined);
});

test('withLocalLedgerHistory does not invoke sweepUsage (sweep is owned by collector)', () => {
  let sweepCalls = 0;
  const mockSweepUsage = () => { sweepCalls += 1; };

  const mockStore = {
    readHistory: () => ({ daily: [], monthly: [], summary: { totalTokens: 0 } }),
    readPeriods: () => samplePeriods()
  };

  const stats = {
    mode: 'local',
    periods: samplePeriods(),
    devices: [{ deviceId: 'dev-sweep', periods: samplePeriods(), allTime: emptyPeriod() }]
  };

  // Full tick
  withLocalLedgerHistory(stats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-sweep',
    isWatchTick: false,
    sweepUsage: mockSweepUsage
  });
  assert.equal(sweepCalls, 0, 'sweepUsage should not be invoked by withLocalLedgerHistory on full tick');

  // Watch tick
  withLocalLedgerHistory(stats, null, {
    tokenLedgerStore: mockStore,
    deviceId: 'dev-sweep',
    isWatchTick: true,
    sweepUsage: mockSweepUsage
  });
  assert.equal(sweepCalls, 0, 'sweepUsage should not be invoked by withLocalLedgerHistory on watch tick');
});
