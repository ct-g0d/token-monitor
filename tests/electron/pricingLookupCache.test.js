'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPricingLookupCache } = require('../../src/electron/pricingLookupCache');

test('5 concurrent gets of the same model → lookup called once', async () => {
  let callCount = 0;
  const lookup = async (id) => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      modelId: id,
      pricing: {
        inputCostPerToken: 0.000003,
        outputCostPerToken: 0.000015
      }
    };
  };

  const cache = createPricingLookupCache({ lookup });

  const results = await Promise.all([
    cache.get('claude-3-5-sonnet'),
    cache.get('claude-3-5-sonnet'),
    cache.get('claude-3-5-sonnet'),
    cache.get('claude-3-5-sonnet'),
    cache.get('claude-3-5-sonnet')
  ]);

  assert.strictEqual(callCount, 1);
  for (const res of results) {
    assert.deepStrictEqual(res, {
      modelId: 'claude-3-5-sonnet',
      pricing: {
        inputCostPerToken: 0.000003,
        outputCostPerToken: 0.000015
      }
    });
  }
});

test('gets for 3 different models → max in-flight concurrency observed is 1', async () => {
  let inFlightCount = 0;
  let maxInFlight = 0;
  const executionOrder = [];

  const lookup = async (id) => {
    inFlightCount++;
    maxInFlight = Math.max(maxInFlight, inFlightCount);
    await new Promise((resolve) => setTimeout(resolve, 25));
    inFlightCount--;
    executionOrder.push(id);
    return {
      modelId: id,
      pricing: { inputCostPerToken: 0.000001 }
    };
  };

  const cache = createPricingLookupCache({ lookup });

  const results = await Promise.all([
    cache.get('model-1'),
    cache.get('model-2'),
    cache.get('model-3')
  ]);

  assert.strictEqual(maxInFlight, 1);
  assert.deepStrictEqual(executionOrder, ['model-1', 'model-2', 'model-3']);
  assert.strictEqual(results[0].modelId, 'model-1');
  assert.strictEqual(results[1].modelId, 'model-2');
  assert.strictEqual(results[2].modelId, 'model-3');
});

test('a throwing lookup → null and cached until ttl; after ttl → lookup called again', async () => {
  let fakeTime = 100000;
  let callCount = 0;

  const lookup = async (_id) => {
    callCount++;
    throw new Error('tokscale lookup failed');
  };

  const cache = createPricingLookupCache({
    lookup,
    now: () => fakeTime,
    ttlMs: 5000
  });

  const res1 = await cache.get('unknown-model');
  assert.strictEqual(res1, null);
  assert.strictEqual(callCount, 1);

  // Before TTL expires: cached negative result returned, lookup not called again
  fakeTime += 2000;
  const res2 = await cache.get('unknown-model');
  assert.strictEqual(res2, null);
  assert.strictEqual(callCount, 1);

  // After TTL expires: lookup called again
  fakeTime += 4000; // total elapsed 6000 > ttlMs 5000
  const res3 = await cache.get('unknown-model');
  assert.strictEqual(res3, null);
  assert.strictEqual(callCount, 2);
});

test('lookup returning no pricing caches null until ttl', async () => {
  let fakeTime = 200000;
  let callCount = 0;

  const lookup = async () => {
    callCount++;
    return {};
  };

  const cache = createPricingLookupCache({
    lookup,
    now: () => fakeTime,
    ttlMs: 10000
  });

  const res1 = await cache.get('no-pricing-model');
  assert.strictEqual(res1, null);
  assert.strictEqual(callCount, 1);

  // Repeated call before TTL returns cached null
  fakeTime += 5000;
  const res2 = await cache.get('no-pricing-model');
  assert.strictEqual(res2, null);
  assert.strictEqual(callCount, 1);
});

test('caches per trimmed modelId', async () => {
  let callCount = 0;
  const lookup = async (id) => {
    callCount++;
    return {
      modelId: id,
      pricing: { inputCostPerToken: 0.000002 }
    };
  };

  const cache = createPricingLookupCache({ lookup });

  const res1 = await cache.get('  gpt-4o  ');
  const res2 = await cache.get('gpt-4o');

  assert.strictEqual(callCount, 1);
  assert.deepStrictEqual(res1, res2);
  assert.strictEqual(res1.modelId, 'gpt-4o');
});
