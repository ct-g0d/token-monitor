'use strict';

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function hasPricing(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.pricing == null) return false;
  if (typeof result.pricing === 'object') {
    return Object.keys(result.pricing).length > 0;
  }
  return Boolean(result.pricing);
}

function createPricingLookupCache({ lookup, now = Date.now, ttlMs = DEFAULT_TTL_MS } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  let queue = Promise.resolve();

  function getTime() {
    return typeof now === 'function' ? now() : Date.now();
  }

  function runSerialized(task) {
    const run = () => task();
    const next = queue.then(run, run);
    queue = next.then(() => {}, () => {});
    return next;
  }

  async function get(modelId) {
    const key = typeof modelId === 'string' ? modelId.trim() : String(modelId || '').trim();
    const currentTime = getTime();

    const cached = cache.get(key);
    if (cached && cached.expiresAt > currentTime) {
      return cached.result;
    }

    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const performLookup = async () => {
      const freshTime = getTime();
      const freshCached = cache.get(key);
      if (freshCached && freshCached.expiresAt > freshTime) {
        return freshCached.result;
      }

      let result = null;
      try {
        if (typeof lookup === 'function') {
          const raw = await lookup(key);
          if (hasPricing(raw)) {
            result = raw;
          }
        }
      } catch (_) {
        result = null;
      }

      cache.set(key, {
        result,
        expiresAt: getTime() + ttlMs
      });
      return result;
    };

    const promise = runSerialized(performLookup).finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
  }

  return { get };
}

module.exports = {
  createPricingLookupCache
};
