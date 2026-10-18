'use strict';

const ONE_MILLION = 1_000_000;

// Built-in offline rates per 1,000,000 tokens (USD)
const BUILTIN_MODEL_RATES = Object.freeze({
  // Google Gemini Family
  'gemini-3.8-flash': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075, cacheWritePerM: 0.75 },
  'gemini-3.8-flash-high': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075, cacheWritePerM: 0.75 },
  'gemini-3.8-flash-n': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075, cacheWritePerM: 0.75 },
  'gemini-3.8-flash-tiered': { inputPerM: 0.75, outputPerM: 3.75, cacheReadPerM: 0.075, cacheWritePerM: 0.75 },
  'gemini-2.5-flash': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.0375, cacheWritePerM: 0.15 },
  'gemini-2.5-flash-thinking': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.0375, cacheWritePerM: 0.15 },
  'gemini-2.5-flash-lite': { inputPerM: 0.075, outputPerM: 0.30, cacheReadPerM: 0.01875, cacheWritePerM: 0.075 },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 5.00, cacheReadPerM: 0.3125, cacheWritePerM: 1.25 },
  'gemini-3.1-pro': { inputPerM: 1.25, outputPerM: 5.00, cacheReadPerM: 0.3125, cacheWritePerM: 1.25 },
  'gemini-3-flash-preview': { inputPerM: 0.50, outputPerM: 2.00, cacheReadPerM: 0.05, cacheWritePerM: 0.50 },

  // OpenAI Codex / GPT Family (from production ledger & tokscale)
  'gpt-5.6-luna': { inputPerM: 0.20, outputPerM: 1.20, cacheReadPerM: 0.02, cacheWritePerM: 0.25 },
  'gpt-5.6-sol': { inputPerM: 1.00, outputPerM: 5.00, cacheReadPerM: 0.10, cacheWritePerM: 1.25 },
  'gpt-6.1-sol': { inputPerM: 2.00, outputPerM: 10.00, cacheReadPerM: 0.10, cacheWritePerM: 2.50 },
  'gpt-6-sol': { inputPerM: 2.00, outputPerM: 10.00, cacheReadPerM: 0.10, cacheWritePerM: 2.50 },
  'gpt-6-luna': { inputPerM: 0.30, outputPerM: 1.80, cacheReadPerM: 0.03, cacheWritePerM: 0.375 },
  'gpt-6-astra': { inputPerM: 1.50, outputPerM: 7.50, cacheReadPerM: 0.15, cacheWritePerM: 1.875 },
  'gpt-5.6-terra': { inputPerM: 0.50, outputPerM: 3.00, cacheReadPerM: 0.05, cacheWritePerM: 0.625 },
  'gpt-5.4-mini': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.015, cacheWritePerM: 0.1875 },
  'codex-auto-review': { inputPerM: 0.15, outputPerM: 0.60, cacheReadPerM: 0.015, cacheWritePerM: 0.1875 },
  'gpt-reserve': { inputPerM: 1.00, outputPerM: 5.00, cacheReadPerM: 0.10, cacheWritePerM: 1.25 },

  // Muse / OpenCode Family
  'muse-spark': { inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, cacheWritePerM: 1.25 },
  'muse-spark-1.3-contributor-free': { inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, cacheWritePerM: 1.25 },
  'muse-spark-open': { inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 0.15, cacheWritePerM: 1.25 },

  // Anthropic Claude Family
  'claude-sonnet-4': { inputPerM: 3.00, outputPerM: 15.00, cacheReadPerM: 0.30, cacheWritePerM: 3.75 },
  'claude-sonnet-4-5': { inputPerM: 3.00, outputPerM: 15.00, cacheReadPerM: 0.30, cacheWritePerM: 3.75 },
  'claude-sonnet-4-6': { inputPerM: 3.00, outputPerM: 15.00, cacheReadPerM: 0.30, cacheWritePerM: 3.75 },
  'claude-opus-4': { inputPerM: 15.00, outputPerM: 75.00, cacheReadPerM: 1.50, cacheWritePerM: 18.75 },
  'claude-opus-4-6': { inputPerM: 15.00, outputPerM: 75.00, cacheReadPerM: 1.50, cacheWritePerM: 18.75 },
  'claude-haiku-4-5': { inputPerM: 0.80, outputPerM: 4.00, cacheReadPerM: 0.08, cacheWritePerM: 1.00 }
});

module.exports = {
  ONE_MILLION,
  BUILTIN_MODEL_RATES
};
