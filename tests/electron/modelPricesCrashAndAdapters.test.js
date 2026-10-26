'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deriveUsagePriceTarget,
  evaluateSessionAccess,
  toUsagePriceOverrides,
  applyPriceOverridesPatch,
  applyModelAliasesPatch,
  parseUnitPrice,
} = require('../../t3_app_ui/src/adapters/pricingTargetHelpers.ts');

test('evaluateSessionAccess handles various session permission states', () => {
  assert.equal(evaluateSessionAccess(null), 'denied');
  assert.equal(evaluateSessionAccess({ _tag: 'Failure' }), 'denied');
  assert.equal(evaluateSessionAccess({ waiting: true }), 'pending');
  assert.equal(evaluateSessionAccess({ authenticated: false }), 'denied');
  assert.equal(evaluateSessionAccess({ authenticated: true, permissions: [] }), 'denied');
  assert.equal(evaluateSessionAccess({ authenticated: true, permissions: ['settings:write'] }), 'granted');
  assert.equal(evaluateSessionAccess({ authenticated: true, scopes: ['settings:write'] }), 'granted');
  assert.equal(evaluateSessionAccess({ authenticated: true, scopes: ['orchestration:operate'] }), 'granted');
  assert.equal(evaluateSessionAccess({ _tag: 'Success', value: { authenticated: true, permissions: ['settings:write'] } }), 'granted');
});

test('parseUnitPrice safely parses numbers and numeric strings', () => {
  assert.equal(parseUnitPrice(10), 10);
  assert.equal(parseUnitPrice('2.5'), 2.5);
  assert.equal(parseUnitPrice(0), 0);
  assert.equal(parseUnitPrice(-5), undefined);
  assert.equal(parseUnitPrice('invalid'), undefined);
  assert.equal(parseUnitPrice(null), undefined);
  assert.equal(parseUnitPrice(undefined), undefined);
});

test('deriveUsagePriceTarget prevents crash when serverConfig.environment is missing', () => {
  const envWithoutEnvironment = {
    entry: { target: { label: 'Token Monitor Workstation' } },
    connection: { phase: 'connected' },
    serverConfig: {}, // environment missing
  };

  const target = deriveUsagePriceTarget(
    'primary',
    envWithoutEnvironment,
    { usagePriceOverrides: {} },
    { authenticated: true, permissions: ['settings:write'] },
  );

  assert.equal(target.environmentId, 'primary');
  assert.equal(target.label, 'Token Monitor Workstation');
  assert.equal(target.unavailable, 'Update server to edit prices');
  assert.equal(target.aliases, null);
  assert.deepEqual(target.prices, {});
});

test('deriveUsagePriceTarget prevents crash when serverConfig is null or undefined', () => {
  const envWithoutServerConfig = {
    entry: { target: { label: 'Token Monitor Workstation' } },
    connection: { phase: 'connected' },
    serverConfig: null,
  };

  const target = deriveUsagePriceTarget(
    'primary',
    envWithoutServerConfig,
    {},
    { authenticated: true, permissions: ['settings:write'] },
  );

  assert.equal(target.environmentId, 'primary');
  assert.equal(target.unavailable, 'Update server to edit prices');
});

test('deriveUsagePriceTarget prevents crash when environment entry is missing', () => {
  const target = deriveUsagePriceTarget(
    'env-1',
    undefined,
    {},
    { authenticated: true, permissions: ['settings:write'] },
  );

  assert.equal(target.environmentId, 'env-1');
  assert.equal(target.label, 'Token Monitor Workstation');
  assert.equal(target.unavailable, 'Offline');
  assert.equal(target.prices, null);
  assert.equal(target.aliases, null);
});

test('deriveUsagePriceTarget flags incompatible connection and settings states', () => {
  const capableEnv = {
    connection: { phase: 'connected' },
    serverConfig: {
      environment: {
        capabilities: {
          usagePriceOverrides: true,
          usageModelAliases: true,
        },
      },
    },
  };

  // Disconnected
  const disconnectedEnv = {
    connection: { phase: 'disconnected' },
    serverConfig: capableEnv.serverConfig,
  };
  const disconnectedTarget = deriveUsagePriceTarget(
    'env-disc',
    disconnectedEnv,
    {},
    { authenticated: true, permissions: ['settings:write'] },
  );
  assert.equal(disconnectedTarget.unavailable, 'Offline');

  // Connecting
  const connectingEnv = {
    connection: { phase: 'connecting' },
    serverConfig: capableEnv.serverConfig,
  };
  const connectingTarget = deriveUsagePriceTarget(
    'env-conn',
    connectingEnv,
    {},
    { authenticated: true, permissions: ['settings:write'] },
  );
  assert.equal(connectingTarget.unavailable, 'Offline');

  // Settings not loaded
  const unloadedTarget = deriveUsagePriceTarget(
    'env-unloaded',
    capableEnv,
    null,
    { authenticated: true, permissions: ['settings:write'] },
  );
  assert.equal(unloadedTarget.unavailable, 'Prices not loaded');

  // Permission pending
  const pendingTarget = deriveUsagePriceTarget(
    'env-pending',
    capableEnv,
    {},
    { waiting: true },
  );
  assert.equal(pendingTarget.unavailable, 'Checking permissions…');

  // Permission denied
  const deniedTarget = deriveUsagePriceTarget(
    'env-denied',
    capableEnv,
    {},
    { authenticated: true, permissions: [] },
  );
  assert.equal(deniedTarget.unavailable, 'Read-only access');

  // Server lacks usagePriceOverrides capability
  const noPriceCapabilityEnv = {
    connection: { phase: 'connected' },
    serverConfig: {
      environment: {
        capabilities: {
          usagePriceOverrides: false,
          usageModelAliases: true,
        },
      },
    },
  };
  const noPriceTarget = deriveUsagePriceTarget(
    'env-no-price',
    noPriceCapabilityEnv,
    {},
    { authenticated: true, permissions: ['settings:write'] },
  );
  assert.equal(noPriceTarget.unavailable, 'Update server to edit prices');

  // Server lacks usageModelAliases capability
  const noAliasCapabilityEnv = {
    connection: { phase: 'connected' },
    serverConfig: {
      environment: {
        capabilities: {
          usagePriceOverrides: true,
          usageModelAliases: false,
        },
      },
    },
  };
  const noAliasTarget = deriveUsagePriceTarget(
    'env-no-alias',
    noAliasCapabilityEnv,
    { usageModelAliases: { 'model-a': 'alias-a' } },
    { authenticated: true, permissions: ['settings:write'] },
  );
  assert.equal(noAliasTarget.unavailable, null);
  assert.equal(noAliasTarget.aliases, null, 'aliases are null when server lacks usageModelAliases capability');
});

test('deriveUsagePriceTarget populates valid workstation targets with prices and aliases', () => {
  const workstationEnv = {
    entry: { target: { label: 'Token Monitor Workstation' } },
    connection: { phase: 'connected' },
    serverConfig: {
      environment: {
        capabilities: {
          usagePriceOverrides: true,
          usageModelAliases: true,
        },
      },
    },
  };
  const settings = {
    usagePriceOverrides: {
      'gpt-4o': { inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10 },
    },
    usageModelAliases: {
      'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
    },
  };
  const session = { authenticated: true, permissions: ['settings:write'] };

  const target = deriveUsagePriceTarget('primary', workstationEnv, settings, session);
  assert.equal(target.unavailable, null);
  assert.equal(target.label, 'Token Monitor Workstation');
  assert.deepEqual(target.prices, settings.usagePriceOverrides);
  assert.deepEqual(target.aliases, settings.usageModelAliases);
});

test('toUsagePriceOverrides normalizes customModelPricing array to per-million rate object', () => {
  const customPricing = [
    { modelId: 'gpt-4o', inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 3.75 },
    { modelId: 'free-model', inputPerM: 0, outputPerM: 0 },
    { modelId: '   ', inputPerM: 1 },
    null,
  ];

  const overrides = toUsagePriceOverrides(customPricing);
  assert.deepEqual(overrides, {
    'gpt-4o': {
      inputCostPerMillionTokens: 2.5,
      outputCostPerMillionTokens: 10,
      cacheReadCostPerMillionTokens: 1.25,
      cacheWriteCostPerMillionTokens: 3.75,
    },
    'free-model': {
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
  });
});

test('applyPriceOverridesPatch upserts, updates and removes price overrides while preserving extra fields', () => {
  const existing = [
    { modelId: 'model-a', inputPerM: 1, outputPerM: 2, cacheWrite1hPerM: 5 },
    { modelId: 'model-b', inputPerM: 3, outputPerM: 6 },
  ];

  const patch = {
    'model-a': { inputCostPerMillionTokens: 1.5, outputCostPerMillionTokens: 2.5 },
    'model-b': null, // Remove
    'model-c': { inputCostPerMillionTokens: 4, outputCostPerMillionTokens: 8, cacheReadCostPerMillionTokens: 0.4 },
  };

  const updated = applyPriceOverridesPatch(existing, patch);

  assert.equal(updated.length, 2);
  const modelA = updated.find((e) => e.modelId === 'model-a');
  assert.equal(modelA.inputPerM, 1.5);
  assert.equal(modelA.outputPerM, 2.5);
  assert.equal(modelA.cacheWrite1hPerM, 5, 'preserves cacheWrite1hPerM');

  assert.equal(updated.find((e) => e.modelId === 'model-b'), undefined, 'model-b removed');

  const modelC = updated.find((e) => e.modelId === 'model-c');
  assert.equal(modelC.inputPerM, 4);
  assert.equal(modelC.outputPerM, 8);
  assert.equal(modelC.cacheReadPerM, 0.4);
});

test('applyModelAliasesPatch adds, updates and deletes model aliases', () => {
  const existing = {
    'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
    'legacy-model': 'old-alias',
  };

  const patch = {
    'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet', // update
    'legacy-model': null, // delete
    'gpt-4o-2024-08-06': 'gpt-4o', // add
    'blank-alias': '', // delete / skip
  };

  const updated = applyModelAliasesPatch(existing, patch);
  assert.deepEqual(updated, {
    'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
    'gpt-4o-2024-08-06': 'gpt-4o',
  });
});
