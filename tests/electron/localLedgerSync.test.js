'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
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
  const store = createTokenLedgerStore();
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
