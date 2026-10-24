'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deriveStatsRevisionKey,
  isUsageAffectingSettingsChange,
  getLimitsKey,
  cheapStableHash,
  createProviderIdentityCache,
} = require('../../t3_app_ui/src/adapters/renderPerfHelpers.ts');

test('deriveStatsRevisionKey returns stable key from updatedAt and historyRevision', () => {
  const stats1 = {
    updatedAt: '2026-10-24T12:00:00.000Z',
    historyRevision: 42,
    periods: { today: { totalTokens: 100 } }
  };
  const nullHash = cheapStableHash(JSON.stringify(null));
  const key1 = deriveStatsRevisionKey(stats1);
  assert.equal(key1, `2026-10-24T12:00:00.000Z:42:${nullHash}`);

  // Session activity pushes leave updatedAt and historyRevision unchanged
  const sessionActivityPush = {
    ...stats1,
    activeSessions: [{ id: 's1' }]
  };
  const key2 = deriveStatsRevisionKey(sessionActivityPush);
  assert.equal(key1, key2);

  // When stats actually update, key changes
  const statsUpdated = {
    ...stats1,
    updatedAt: '2026-10-24T12:00:02.000Z'
  };
  assert.notEqual(deriveStatsRevisionKey(statsUpdated), key1);

  const historyUpdated = {
    ...stats1,
    historyRevision: 43
  };
  assert.notEqual(deriveStatsRevisionKey(historyUpdated), key1);
});

test('deriveStatsRevisionKey differentiates limits-only updates with same updatedAt/historyRevision', () => {
  const statsBase = {
    updatedAt: '2026-10-24T12:00:00.000Z',
    historyRevision: 42,
    limits: {
      providers: [{ provider: 'claude', status: 'ok' }]
    }
  };
  const statsIdentical = {
    updatedAt: '2026-10-24T12:00:00.000Z',
    historyRevision: 42,
    limits: {
      providers: [{ provider: 'claude', status: 'ok' }]
    }
  };
  const statsLimitsChanged = {
    updatedAt: '2026-10-24T12:00:00.000Z',
    historyRevision: 42,
    limits: {
      providers: [{ provider: 'claude', status: 'rateLimited' }]
    }
  };

  const keyBase = deriveStatsRevisionKey(statsBase);
  const keyIdentical = deriveStatsRevisionKey(statsIdentical);
  const keyLimitsChanged = deriveStatsRevisionKey(statsLimitsChanged);

  assert.equal(keyBase, keyIdentical);
  assert.notEqual(keyBase, keyLimitsChanged);
});

test('deriveStatsRevisionKey falls back to period tokens when updatedAt/historyRevision missing', () => {
  const statsWithoutHeader = {
    periods: {
      today: { totalTokens: 500 },
      month: { totalTokens: 2000 },
      allTime: { totalTokens: 10000 }
    }
  };
  const nullHash = cheapStableHash(JSON.stringify(null));
  const key1 = deriveStatsRevisionKey(statsWithoutHeader);
  assert.equal(key1, `500:2000:10000:none:${nullHash}`);

  const unchanged = { ...statsWithoutHeader };
  assert.equal(deriveStatsRevisionKey(unchanged), key1);

  const tokenChange = {
    periods: {
      today: { totalTokens: 501 },
      month: { totalTokens: 2000 },
      allTime: { totalTokens: 10001 }
    }
  };
  assert.notEqual(deriveStatsRevisionKey(tokenChange), key1);
});

test('isUsageAffectingSettingsChange detects usage keys vs non-usage keys', () => {
  const baseSettings = {
    theme: 'dark',
    accentColor: 'blue',
    customModelPricing: { 'gpt-4o': 5 },
    modelAliases: { 'claude-3-5-sonnet': 'sonnet' },
    pricingModel: 'custom',
    currency: 'USD',
    trackedClients: ['cursor', 'codex'],
    hiddenProviders: ['copilot']
  };

  // Irrelevant UI setting change does not trigger usage refetch
  const nonUsageChange = {
    ...baseSettings,
    theme: 'light',
    accentColor: 'purple'
  };
  assert.equal(isUsageAffectingSettingsChange(baseSettings, nonUsageChange), false);

  // Changes to usage keys trigger refetch
  assert.equal(isUsageAffectingSettingsChange(baseSettings, {
    ...baseSettings,
    customModelPricing: { 'gpt-4o': 10 }
  }), true);

  assert.equal(isUsageAffectingSettingsChange(baseSettings, {
    ...baseSettings,
    modelAliases: { 'claude-3-5-sonnet': 'sonnet-3.5' }
  }), true);

  assert.equal(isUsageAffectingSettingsChange(baseSettings, {
    ...baseSettings,
    currency: 'EUR'
  }), true);

  assert.equal(isUsageAffectingSettingsChange(baseSettings, {
    ...baseSettings,
    trackedClients: ['cursor']
  }), true);

  assert.equal(isUsageAffectingSettingsChange(baseSettings, {
    ...baseSettings,
    hiddenProviders: []
  }), true);
});

test('getLimitsKey derives stable structural key and handles email masking', () => {
  const limitsWithUpdated = {
    updatedAt: '2026-10-24T12:00:00Z',
    providers: [{ provider: 'claude', status: 'ok' }]
  };
  assert.equal(getLimitsKey(limitsWithUpdated, false), 'u:2026-10-24T12:00:00Z');
  assert.equal(getLimitsKey(limitsWithUpdated, true), 'm:2026-10-24T12:00:00Z');

  // Fallback hash when updatedAt is absent
  const limitsNoHeader = {
    providers: [{ provider: 'codex', status: 'ok' }]
  };
  const key1 = getLimitsKey(limitsNoHeader, false);
  const key2 = getLimitsKey({ providers: [{ provider: 'codex', status: 'ok' }] }, false);
  assert.equal(key1, key2);

  const changedLimits = {
    providers: [{ provider: 'codex', status: 'rateLimited' }]
  };
  assert.notEqual(getLimitsKey(changedLimits, false), key1);
});

test('createProviderIdentityCache preserves exact array reference when key unchanged', () => {
  const cache = createProviderIdentityCache();
  let computeCount = 0;

  const compute = () => {
    computeCount += 1;
    return [{ id: 'p1', name: 'Claude' }, { id: 'p2', name: 'Codex' }];
  };

  const keyA = 'u:2026-10-24T12:00:00Z';
  const first = cache.getOrCompute(keyA, compute);
  assert.equal(first.reused, false);
  assert.equal(computeCount, 1);

  // Subsequent call with identical structural key returns exact same reference
  const second = cache.getOrCompute(keyA, compute);
  assert.equal(second.reused, true);
  assert.equal(computeCount, 1);
  assert.strictEqual(first.result, second.result);

  // Changed key causes recomputation and new reference
  const keyB = 'u:2026-10-24T12:05:00Z';
  const third = cache.getOrCompute(keyB, compute);
  assert.equal(third.reused, false);
  assert.equal(computeCount, 2);
  assert.notStrictEqual(second.result, third.result);
});
