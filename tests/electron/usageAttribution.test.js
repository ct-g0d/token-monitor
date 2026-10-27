'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { register } = require('node:module');

// Register an inline extensionless ESM resolver so Node can import t3_app_ui TypeScript modules
const resolverCode = [
  "import fs from 'node:fs';",
  "import { fileURLToPath, pathToFileURL } from 'node:url';",
  "export async function resolve(specifier, context, nextResolve) {",
  "  try {",
  "    return await nextResolve(specifier, context);",
  "  } catch (err) {",
  "    if (specifier.startsWith('.') || specifier.startsWith('file:')) {",
  "      try {",
  "        const parentURL = context.parentURL ? new URL(context.parentURL) : null;",
  "        const targetURL = parentURL ? new URL(specifier, parentURL) : new URL(specifier);",
  "        const filePath = fileURLToPath(targetURL);",
  "        for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js']) {",
  "          if (fs.existsSync(filePath + ext)) {",
  "            return await nextResolve(pathToFileURL(filePath + ext).href, context);",
  "          }",
  "        }",
  "      } catch {}",
  "    }",
  "    throw err;",
  "  }",
  "}",
].join('\n');

register('data:text/javascript,' + encodeURIComponent(resolverCode));

async function loadUsageState() {
  return await import('../../t3_app_ui/src/adapters/usageState.ts');
}

test('live day with Codex gpt-6.1-terra and Antigravity gemini keeps models under own providers', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const todayKey = '2026-10-27';
  const now = new Date(`${todayKey}T12:00:00Z`);

  const mockStats = {
    periods: {
      today: {
        totalTokens: 60000,
        costUsd: 1.5,
        messages: 20,
        clients: {
          codex: 50000,
          antigravity: 10000,
        },
        clientCosts: {
          codex: 1.25,
          antigravity: 0.25,
        },
        models: {
          'gpt-6.1-terra': 50000,
          'gemini-3.8-flash-high': 10000,
        },
        modelCosts: {
          'gpt-6.1-terra': 1.25,
          'gemini-3.8-flash-high': 0.25,
        },
        clientModels: {
          codex: {
            'gpt-6.1-terra': 50000,
          },
          antigravity: {
            'gemini-3.8-flash-high': 10000,
          },
        },
      },
    },
  };

  const summary = buildUsageSummaryFromData(
    { daily: [] },
    mockStats,
    { sinceDay: todayKey, untilDay: todayKey, days: 1, timeZone: 'UTC' },
    now,
  );

  // 1. Antigravity buckets must only contain Antigravity models, never gpt-6.1-terra
  const antigravityBuckets = summary.buckets.filter((b) => b.provider === 'antigravity');
  assert.ok(antigravityBuckets.length > 0, 'Antigravity buckets should exist');
  assert.ok(
    antigravityBuckets.every((b) => b.model !== 'gpt-6.1-terra'),
    'gpt-6.1-terra must NOT appear under Antigravity on a live day',
  );
  assert.ok(
    antigravityBuckets.some((b) => b.model === 'gemini-3.8-flash-high'),
    'gemini-3.8-flash-high must appear under Antigravity',
  );
  const totalAgTokens = antigravityBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalAgTokens, 10000, 'Antigravity tokens must be exactly 10000');

  // 2. Codex buckets must own gpt-6.1-terra
  const codexBuckets = summary.buckets.filter((b) => b.provider === 'codex');
  assert.ok(codexBuckets.length > 0, 'Codex buckets should exist');
  assert.ok(
    codexBuckets.every((b) => b.model === 'gpt-6.1-terra'),
    'Codex buckets must only contain gpt-6.1-terra',
  );
  const totalCodexTokens = codexBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalCodexTokens, 50000, 'Codex tokens must be exactly 50000');
});

test('live day overwrite of existing ledger row preserves clientModels and attribution', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const todayKey = '2026-10-27';
  const now = new Date(`${todayKey}T12:00:00Z`);

  // Existing historical row in ledger for today (e.g. before latest collector tick)
  const existingLedgerRow = {
    date: todayKey,
    tokens: 30000,
    cost: 0.75,
    messages: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 5000,
    unclassifiedTokens: 25000,
    perClient: {
      codex: { tokens: 25000, cost: 0.65, messages: 8, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 21000 },
      antigravity: { tokens: 5000, cost: 0.10, messages: 2, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 4000 },
    },
    perModel: {
      'gpt-6.1-terra': { tokens: 25000, cost: 0.65, messages: 8, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 21000 },
      'gemini-3.8-flash-high': { tokens: 5000, cost: 0.10, messages: 2, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 4000 },
    },
    clientModels: {
      codex: { 'gpt-6.1-terra': 25000 },
      antigravity: { 'gemini-3.8-flash-high': 5000 },
    },
  };

  // Live updated stats period with more tokens
  const mockStats = {
    periods: {
      today: {
        totalTokens: 60000,
        costUsd: 1.5,
        messages: 20,
        clients: { codex: 50000, antigravity: 10000 },
        clientCosts: { codex: 1.25, antigravity: 0.25 },
        models: { 'gpt-6.1-terra': 50000, 'gemini-3.8-flash-high': 10000 },
        modelCosts: { 'gpt-6.1-terra': 1.25, 'gemini-3.8-flash-high': 0.25 },
        clientModels: {
          codex: { 'gpt-6.1-terra': 50000 },
          antigravity: { 'gemini-3.8-flash-high': 10000 },
        },
      },
    },
  };

  const summary = buildUsageSummaryFromData(
    { daily: [existingLedgerRow] },
    mockStats,
    { sinceDay: todayKey, untilDay: todayKey, days: 1, timeZone: 'UTC' },
    now,
  );

  const antigravityBuckets = summary.buckets.filter((b) => b.provider === 'antigravity');
  assert.ok(antigravityBuckets.every((b) => b.model !== 'gpt-6.1-terra'));
  assert.ok(antigravityBuckets.some((b) => b.model === 'gemini-3.8-flash-high'));

  const codexBuckets = summary.buckets.filter((b) => b.provider === 'codex');
  assert.ok(codexBuckets.every((b) => b.model === 'gpt-6.1-terra'));
});

test('historical day with Claude claude-opus-5-5 and Antigravity data never puts Opus under Antigravity', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const yesterdayKey = '2026-10-26';
  const todayKey = '2026-10-27';
  const now = new Date(`${todayKey}T12:00:00Z`);

  const mockHistory = {
    daily: [
      {
        date: yesterdayKey,
        tokens: 30000,
        cost: 0.8,
        messages: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5000,
        unclassifiedTokens: 25000,
        perClient: {
          claude: { tokens: 20000, cost: 0.6, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 16000 },
          antigravity: { tokens: 10000, cost: 0.2, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 9000 },
        },
        perModel: {
          'claude-opus-5-5': { tokens: 20000, cost: 0.6, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 16000 },
          'gemini-3.8-flash-high': { tokens: 10000, cost: 0.2, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 9000 },
        },
        clientModels: {
          claude: { 'claude-opus-5-5': 20000 },
          antigravity: { 'gemini-3.8-flash-high': 10000 },
        },
      },
    ],
  };

  const summary = buildUsageSummaryFromData(
    mockHistory,
    null,
    { sinceDay: yesterdayKey, untilDay: yesterdayKey, days: 1 },
    now,
  );

  const antigravityBuckets = summary.buckets.filter((b) => b.provider === 'antigravity');
  assert.ok(antigravityBuckets.length > 0, 'Antigravity buckets should exist');
  assert.ok(
    antigravityBuckets.every((b) => b.model !== 'claude-opus-5-5'),
    'claude-opus-5-5 must NEVER be attributed to Antigravity on historical ledger days',
  );
  assert.ok(
    antigravityBuckets.some((b) => b.model === 'gemini-3.8-flash-high'),
    'gemini-3.8-flash-high must be attributed to Antigravity',
  );

  const claudeBuckets = summary.buckets.filter((b) => b.provider === 'claude');
  assert.ok(claudeBuckets.length > 0, 'Claude buckets should exist');
  assert.ok(
    claudeBuckets.every((b) => b.model !== 'gemini-3.8-flash-high'),
    'gemini-3.8-flash-high must NOT be attributed to Claude',
  );
  assert.ok(
    claudeBuckets.some((b) => b.model === 'claude-opus-5-5'),
    'claude-opus-5-5 must be attributed to Claude',
  );
});

test('historical day without clientModels prevents smearing global models across unrelated clients', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const yesterdayKey = '2026-10-26';
  const todayKey = '2026-10-27';
  const now = new Date(`${todayKey}T12:00:00Z`);

  // Legacy or unpartitioned row where clientModels is absent
  const mockHistoryWithoutClientModels = {
    daily: [
      {
        date: yesterdayKey,
        tokens: 30000,
        cost: 0.8,
        messages: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5000,
        unclassifiedTokens: 25000,
        perClient: {
          claude: { tokens: 20000, cost: 0.6, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 16000 },
          antigravity: { tokens: 10000, cost: 0.2, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 9000 },
        },
        perModel: {
          'claude-opus-5-5': { tokens: 20000, cost: 0.6, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4000, unclassifiedTokens: 16000 },
          'gemini-3.8-flash-high': { tokens: 10000, cost: 0.2, messages: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1000, unclassifiedTokens: 9000 },
        },
        // clientModels is intentionally omitted
      },
    ],
  };

  const summary = buildUsageSummaryFromData(
    mockHistoryWithoutClientModels,
    null,
    { sinceDay: yesterdayKey, untilDay: yesterdayKey, days: 1 },
    now,
  );

  const antigravityBuckets = summary.buckets.filter((b) => b.provider === 'antigravity');
  assert.ok(
    antigravityBuckets.every((b) => b.model !== 'claude-opus-5-5'),
    'When clientModels is missing, fallback must NOT smear claude-opus-5-5 across to Antigravity',
  );

  const totalAgTokens = antigravityBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalAgTokens, 10000, 'Antigravity tokens total must be preserved');

  const claudeBuckets = summary.buckets.filter((b) => b.provider === 'claude');
  assert.ok(
    claudeBuckets.every((b) => b.model !== 'gemini-3.8-flash-high'),
    'When clientModels is missing, fallback must NOT smear gemini across to Claude',
  );
  const totalClaudeTokens = claudeBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalClaudeTokens, 20000, 'Claude tokens total must be preserved');
});

test('single-client historical day without clientModels retains unambiguous perModel fallback', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const yesterdayKey = '2026-10-26';
  const now = new Date('2026-10-27T12:00:00Z');

  // Single client active (Codex only), clientModels absent
  const mockSingleClientHistory = {
    daily: [
      {
        date: yesterdayKey,
        tokens: 50000,
        cost: 1.25,
        messages: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 5000,
        unclassifiedTokens: 45000,
        perClient: {
          codex: { tokens: 50000, cost: 1.25, messages: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5000, unclassifiedTokens: 45000 },
        },
        perModel: {
          'gpt-6.1-terra': { tokens: 50000, cost: 1.25, messages: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5000, unclassifiedTokens: 45000 },
        },
      },
    ],
  };

  const summary = buildUsageSummaryFromData(
    mockSingleClientHistory,
    null,
    { sinceDay: yesterdayKey, untilDay: yesterdayKey, days: 1 },
    now,
  );

  const codexBuckets = summary.buckets.filter((b) => b.provider === 'codex');
  assert.equal(codexBuckets.length, 1);
  assert.equal(codexBuckets[0].model, 'gpt-6.1-terra', 'Unambiguous single client should retain perModel model');
  assert.equal(
    codexBuckets[0].totals.uncachedInputTokens + codexBuckets[0].totals.outputTokens,
    50000,
  );
});

test('all-time baseline residual row does not duplicate full tokens or misattribute client models', async () => {
  const { buildUsageSummaryFromData } = await loadUsageState();

  const now = new Date('2026-10-27T12:00:00Z');

  const mockStats = {
    periods: {
      allTime: {
        totalTokens: 100000,
        costUsd: 2.50,
        messages: 40,
        clients: {
          codex: 70000,
          antigravity: 30000,
        },
        clientCosts: {
          codex: 1.75,
          antigravity: 0.75,
        },
        models: {
          'gpt-6.1-terra': 70000,
          'gemini-3.8-flash-high': 30000,
        },
        modelCosts: {
          'gpt-6.1-terra': 1.75,
          'gemini-3.8-flash-high': 0.75,
        },
        clientModels: {
          codex: { 'gpt-6.1-terra': 70000 },
          antigravity: { 'gemini-3.8-flash-high': 30000 },
        },
      },
    },
  };

  // Daily history has 75000 tokens accounted for (Codex: 55000, Antigravity: 20000)
  // Residual tokens = 25000 (Codex residual: 15000, Antigravity residual: 10000)
  const mockHistory = {
    daily: [
      {
        date: '2026-10-26',
        tokens: 75000,
        cost: 1.875,
        messages: 30,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 10000,
        unclassifiedTokens: 65000,
        perClient: {
          codex: { tokens: 55000, cost: 1.375, messages: 20, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 8000, unclassifiedTokens: 47000 },
          antigravity: { tokens: 20000, cost: 0.50, messages: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2000, unclassifiedTokens: 18000 },
        },
        perModel: {
          'gpt-6.1-terra': { tokens: 55000, cost: 1.375, messages: 20, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 8000, unclassifiedTokens: 47000 },
          'gemini-3.8-flash-high': { tokens: 20000, cost: 0.50, messages: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2000, unclassifiedTokens: 18000 },
        },
        clientModels: {
          codex: { 'gpt-6.1-terra': 55000 },
          antigravity: { 'gemini-3.8-flash-high': 20000 },
        },
      },
    ],
  };

  const summary = buildUsageSummaryFromData(
    mockHistory,
    mockStats,
    { days: 0 }, // 'all' window
    now,
  );

  // Total tokens across all buckets should equal allTime (100,000) exactly - NO duplication!
  const totalTokens = summary.buckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalTokens, 100000, 'Total tokens must equal 100000 without duplicating unreduced all-time tokens');

  // Total cost across all buckets should equal allTime (2.50)
  const totalCost = Number(summary.buckets.reduce((sum, b) => sum + b.costUsd, 0).toFixed(6));
  assert.equal(totalCost, 2.50, 'Total cost must equal 2.50');

  // Antigravity buckets must never contain gpt-6.1-terra
  const antigravityBuckets = summary.buckets.filter((b) => b.provider === 'antigravity');
  assert.ok(
    antigravityBuckets.every((b) => b.model !== 'gpt-6.1-terra'),
    'gpt-6.1-terra must never be attributed to Antigravity in baseline residual',
  );

  const totalAgTokens = antigravityBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalAgTokens, 30000, 'Antigravity total tokens across history + residual must equal 30000');

  // Codex buckets must never contain gemini
  const codexBuckets = summary.buckets.filter((b) => b.provider === 'codex');
  assert.ok(
    codexBuckets.every((b) => b.model === 'gpt-6.1-terra'),
    'Codex buckets must only contain gpt-6.1-terra',
  );
  const totalCodexTokens = codexBuckets.reduce(
    (sum, b) => sum + b.totals.uncachedInputTokens + b.totals.outputTokens + b.totals.cachedInputTokens + b.totals.cacheCreationTokens,
    0,
  );
  assert.equal(totalCodexTokens, 70000, 'Codex total tokens across history + residual must equal 70000');
});
