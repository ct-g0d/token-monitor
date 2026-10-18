'use strict';

const { ONE_MILLION } = require('./constants');

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function positive(value) {
  return Math.max(0, finite(value));
}

/**
 * Standard 4-component cost calculation.
 * cost = (uncached_input * r.input) + (cached_input * r.cacheRead) + (cache_write * r.cacheWrite) + (output * r.output)
 */
function calculateTurnCost(usage = {}, rates = {}) {
  const uncachedInput = positive(usage.uncached_input ?? usage.uncachedInput ?? usage.input);
  const cachedInput = positive(usage.cached_input ?? usage.cachedInput ?? usage.cacheRead);
  const cacheWrite = positive(usage.cache_write ?? usage.cacheWrite);
  const outputTokens = positive(usage.output_tokens ?? usage.outputTokens ?? usage.output);

  const inputRate = rates.inputCostPerToken ?? (positive(rates.inputPerM ?? rates.inputCostPerMillion) / ONE_MILLION);
  const outputRate = rates.outputCostPerToken ?? (positive(rates.outputPerM ?? rates.outputCostPerMillion) / ONE_MILLION);
  const cacheReadRate = rates.cacheReadCostPerToken ?? (rates.cacheReadPerM !== undefined || rates.cacheReadCostPerMillion !== undefined
    ? positive(rates.cacheReadPerM ?? rates.cacheReadCostPerMillion) / ONE_MILLION
    : (inputRate * 0.1));
  const cacheWriteRate = rates.cacheWriteCostPerToken ?? (rates.cacheWritePerM !== undefined || rates.cacheWriteCostPerMillion !== undefined
    ? positive(rates.cacheWritePerM ?? rates.cacheWriteCostPerMillion) / ONE_MILLION
    : inputRate);

  const cost = (uncachedInput * inputRate)
    + (cachedInput * cacheReadRate)
    + (cacheWrite * cacheWriteRate)
    + (outputTokens * outputRate);

  return Number(cost.toFixed(6));
}

/**
 * Native Cache Savings calculation.
 * savingsUsd = cached_input * max(0, r.input - r.cacheRead)
 * savingsPct = cached_input / (uncached_input + cached_input) * 100
 */
function calculateCacheSavings(usage = {}, rates = {}) {
  const uncachedInput = positive(usage.uncached_input ?? usage.uncachedInput ?? usage.input);
  const cachedInput = positive(usage.cached_input ?? usage.cachedInput ?? usage.cacheRead);

  const inputRate = rates.inputCostPerToken ?? (positive(rates.inputPerM ?? rates.inputCostPerMillion) / ONE_MILLION);
  const cacheReadRate = rates.cacheReadCostPerToken ?? (rates.cacheReadPerM !== undefined || rates.cacheReadCostPerMillion !== undefined
    ? positive(rates.cacheReadPerM ?? rates.cacheReadCostPerMillion) / ONE_MILLION
    : (inputRate * 0.1));

  const unitSavings = Math.max(0, inputRate - cacheReadRate);
  const savingsUsd = Number((cachedInput * unitSavings).toFixed(6));

  const totalInput = uncachedInput + cachedInput;
  const savingsPct = totalInput > 0 ? Number(((cachedInput / totalInput) * 100).toFixed(2)) : 0.0;

  return { savingsUsd, savingsPct };
}

module.exports = {
  calculateTurnCost,
  calculateCacheSavings
};
