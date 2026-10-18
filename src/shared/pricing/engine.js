'use strict';

const { ONE_MILLION, BUILTIN_MODEL_RATES } = require('./constants');
const { calculateTurnCost, calculateCacheSavings } = require('./formula');

class PricingEngine {
  constructor(options = {}) {
    this.overrides = new Map();
    this.catalogCache = new Map();
    this.fallbackLookup = options.lookupModelPricing || null;
    if (options.customModelPricing) {
      this.loadOverrides(options.customModelPricing);
    }
  }

  loadOverrides(overrides) {
    this.overrides.clear();
    const entries = Array.isArray(overrides)
      ? overrides
      : (overrides && typeof overrides === 'object' ? Object.entries(overrides).map(([k, v]) => ({ modelId: k, ...v })) : []);

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String(entry.modelId || entry.model || '').trim().toLowerCase();
      if (!id) continue;

      const inputPerM = entry.inputCostPerMillion ?? entry.inputPerM;
      const outputPerM = entry.outputCostPerMillion ?? entry.outputPerM;
      const cacheReadPerM = entry.cacheReadCostPerMillion ?? entry.cacheReadPerM;
      const cacheWritePerM = entry.cacheWriteCostPerMillion ?? entry.cacheWritePerM;

      this.overrides.set(id, {
        inputPerM: inputPerM !== undefined ? Number(inputPerM) : undefined,
        outputPerM: outputPerM !== undefined ? Number(outputPerM) : undefined,
        cacheReadPerM: cacheReadPerM !== undefined ? Number(cacheReadPerM) : undefined,
        cacheWritePerM: cacheWritePerM !== undefined ? Number(cacheWritePerM) : undefined,
        source: 'user_override'
      });
    }
  }

  normalizeModelId(modelId) {
    return String(modelId || '')
      .trim()
      .toLowerCase()
      .replace(/^opencode\//, '')
      .replace(/^openai\//, '')
      .replace(/^google\//, '')
      .replace(/^anthropic\//, '');
  }

  resolveRates(modelId) {
    const rawId = String(modelId || '').trim().toLowerCase();
    const norm = this.normalizeModelId(rawId);

    // 1. Direct or normalized match in user overrides
    if (this.overrides.has(norm)) return this._toPerToken(this.overrides.get(norm));
    if (this.overrides.has(rawId)) return this._toPerToken(this.overrides.get(rawId));

    // 2. Prefix/fuzzy match in user overrides
    for (const [key, val] of this.overrides.entries()) {
      if (norm.startsWith(key) || key.startsWith(norm)) return this._toPerToken(val);
    }

    // 3. Direct match in built-in fallback catalog
    if (BUILTIN_MODEL_RATES[norm]) return this._toPerToken({ ...BUILTIN_MODEL_RATES[norm], source: 'builtin' });
    if (BUILTIN_MODEL_RATES[rawId]) return this._toPerToken({ ...BUILTIN_MODEL_RATES[rawId], source: 'builtin' });

    // 4. Family prefix match in built-in catalog
    // Handle muse-spark family specifically (prevents contributor-free from evaluating to $0)
    if (norm.includes('muse-spark')) {
      return this._toPerToken({ ...BUILTIN_MODEL_RATES['muse-spark'], source: 'builtin_family' });
    }
    for (const [key, val] of Object.entries(BUILTIN_MODEL_RATES)) {
      if (norm.startsWith(key)) return this._toPerToken({ ...val, source: 'builtin_prefix' });
    }

    // 5. Memory cache
    if (this.catalogCache.has(norm)) return this.catalogCache.get(norm);

    return null;
  }

  async resolveRatesAsync(modelId) {
    const local = this.resolveRates(modelId);
    if (local) return local;

    if (this.fallbackLookup) {
      try {
        const remote = await this.fallbackLookup(modelId);
        const p = remote?.pricing;
        if (p) {
          const rates = {
            inputCostPerToken: p.inputCostPerToken || 0,
            outputCostPerToken: p.outputCostPerToken || 0,
            cacheReadCostPerToken: p.cacheReadInputTokenCost || 0,
            cacheWriteCostPerToken: p.cacheCreationInputTokenCost || p.inputCostPerToken || 0,
            source: 'tokscale_remote'
          };
          this.catalogCache.set(this.normalizeModelId(modelId), rates);
          return rates;
        }
      } catch (_) {}
    }

    return null;
  }

  priceTurn(usage, modelId) {
    const rates = this.resolveRates(modelId);
    if (!rates) {
      return { cost: 0.0, savingsUsd: 0.0, savingsPct: 0.0, status: 'unknown' };
    }
    const cost = calculateTurnCost(usage, rates);
    const { savingsUsd, savingsPct } = calculateCacheSavings(usage, rates);
    return { cost, savingsUsd, savingsPct, status: 'priced', rates };
  }

  _toPerToken(entry) {
    const inM = entry.inputPerM ?? 0;
    const outM = entry.outputPerM ?? 0;
    const readM = entry.cacheReadPerM ?? (inM * 0.1);
    const writeM = entry.cacheWritePerM ?? inM;
    return {
      inputCostPerToken: inM / ONE_MILLION,
      outputCostPerToken: outM / ONE_MILLION,
      cacheReadCostPerToken: readM / ONE_MILLION,
      cacheWriteCostPerToken: writeM / ONE_MILLION,
      inputPerM: inM,
      outputPerM: outM,
      cacheReadPerM: readM,
      cacheWritePerM: writeM,
      source: entry.source
    };
  }
}

module.exports = {
  PricingEngine
};
