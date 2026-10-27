import {
  EnvironmentId,
  UsageDay,
  USAGE_CONTRACT_VERSION,
  type UsageSummaryInput,
  type UsageProviderKind,
  type UsageSummary,
  type UsageBucket,
} from "@t3tools/contracts";
import { mergeUsage, type EnvironmentUsage, type MergedUsage } from "@t3tools/shared/usageMerge";
import { enumerateHourStarts } from "@t3tools/shared/usageFormat";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type {
  DashboardHistory,
  DashboardHistoryDay,
  TokenMonitorStats,
  WindowKey,
  WindowSessions,
  SessionsByWindow,
} from "../types/tokenMonitor";
import { PRIMARY_ENV_ID, syncStatsToPresentation } from "./presentationState";
import { syncSettingsToPricing } from "./serverState";

export interface EnvironmentUsageStatus {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly isPending: boolean;
  readonly canReadDiagnostics: boolean;
  readonly isConnected: boolean;
  readonly error: string | null;
  readonly summary: UsageSummary | null;
  readonly needsCursorKeychainAccess: boolean;
}

export interface UsageView {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly merged: MergedUsage;
  readonly isPending: boolean;
  readonly shown: {
    readonly window: UsageSummaryInput;
    readonly merged: MergedUsage;
  } | null;
  readonly isPartial: boolean;
  readonly refresh: (input?: UsageSummaryInput) => Promise<void>;
  readonly stats?: TokenMonitorStats | null;
  readonly activeDays?: number;
  readonly peakDayTokens?: number;
  readonly hasWindowSessions?: boolean;
  readonly windowSessions?: WindowSessions;
}

export interface ModelPricingRates {
  readonly inputCostPerToken: number;
  readonly cacheReadCostPerToken: number;
  readonly cacheWriteCostPerToken: number;
  readonly outputCostPerToken: number;
}

import { deriveStatsRevisionKey, isUsageAffectingSettingsChange } from "./renderPerfHelpers";
export { deriveStatsRevisionKey, isUsageAffectingSettingsChange };

interface CachedDayBuckets {
  dayRow: DashboardHistoryDay;
  pricingMap: Record<string, ModelPricingRates | null>;
  buckets: UsageBucket[];
}

const dayBucketsCache = new Map<string, CachedDayBuckets>();
let cachedHistoryRevision: string | null = null;

export function invalidateDayBucketsCache(newHistoryRevision?: string | null) {
  dayBucketsCache.clear();
  cachedHistoryRevision = newHistoryRevision ?? null;
}

// Session memoization: lookup each distinct model id once per session via IPC
const sessionPricingCache = new Map<string, Promise<ModelPricingRates | null>>();
const sessionResolvedRates = new Map<string, ModelPricingRates | null>();

function extractRatesFromPricingResult(res: any): ModelPricingRates | null {
  if (!res || !res.ok || !res.result) {
    return null;
  }
  const p = res.result.pricing;
  if (!p || typeof p !== "object") {
    return null;
  }
  const inputRate =
    p.inputCostPerToken ??
    p.input_cost_per_token ??
    (p.inputPerM != null ? Number(p.inputPerM) / 1_000_000 : null) ??
    (p.input_cost_per_million_tokens != null ? Number(p.input_cost_per_million_tokens) / 1_000_000 : null);

  const cacheReadRate =
    p.cacheReadInputTokenCost ??
    p.cacheReadCostPerToken ??
    p.cache_read_input_token_cost ??
    (p.cacheReadPerM != null ? Number(p.cacheReadPerM) / 1_000_000 : null) ??
    (p.cache_read_input_token_cost_per_million_tokens != null ? Number(p.cache_read_input_token_cost_per_million_tokens) / 1_000_000 : null);

  const cacheWriteRate =
    p.cacheCreationInputTokenCost ??
    p.cacheWriteCostPerToken ??
    p.cache_write_input_token_cost ??
    (p.cacheWritePerM != null ? Number(p.cacheWritePerM) / 1_000_000 : null) ??
    (p.cache_creation_input_token_cost_per_million_tokens != null
      ? Number(p.cache_creation_input_token_cost_per_million_tokens) / 1_000_000
      : null);

  const outputRate =
    p.outputCostPerToken ??
    p.output_cost_per_token ??
    (p.outputPerM != null ? Number(p.outputPerM) / 1_000_000 : null) ??
    (p.output_cost_per_million_tokens != null ? Number(p.output_cost_per_million_tokens) / 1_000_000 : null);

  const finalInputRate = inputRate != null && Number.isFinite(inputRate) ? Math.max(0, inputRate) : null;
  if (finalInputRate === null) {
    return null;
  }

  const finalCacheReadRate = cacheReadRate != null && Number.isFinite(cacheReadRate) ? Math.max(0, cacheReadRate) : 0;
  const finalCacheWriteRate = cacheWriteRate != null && Number.isFinite(cacheWriteRate)
    ? Math.max(0, cacheWriteRate)
    : finalInputRate;
  const finalOutputRate = outputRate != null && Number.isFinite(outputRate) ? Math.max(0, outputRate) : 0;

  return {
    inputCostPerToken: finalInputRate,
    cacheReadCostPerToken: finalCacheReadRate,
    cacheWriteCostPerToken: finalCacheWriteRate,
    outputCostPerToken: finalOutputRate,
  };
}

export function lookupModelPricingMemoized(modelId: string): Promise<ModelPricingRates | null> {
  const key = modelId.trim();
  if (!key || key === "unknown") return Promise.resolve(null);

  const existing = sessionPricingCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (typeof window === "undefined" || !window.tokenMonitor?.lookupModelPricing) {
        return null;
      }
      const res = await window.tokenMonitor.lookupModelPricing(key);
      const rates = extractRatesFromPricingResult(res);
      sessionResolvedRates.set(key, rates);
      return rates;
    } catch {
      sessionResolvedRates.set(key, null);
      return null;
    }
  })();

  sessionPricingCache.set(key, promise);
  return promise;
}

function parseCustomPricing(customModelPricing: any[] | undefined | null): Map<string, ModelPricingRates> {
  const overrides = new Map<string, ModelPricingRates>();
  if (!Array.isArray(customModelPricing)) return overrides;
  for (const item of customModelPricing) {
    if (!item || !item.modelId) continue;
    const modelId = String(item.modelId).trim();
    if (!modelId) continue;

    const inputRate = item.inputCostPerToken !== undefined
      ? Number(item.inputCostPerToken)
      : (item.inputPerM !== undefined && item.inputPerM !== null && item.inputPerM !== ""
        ? Number(item.inputPerM) / 1_000_000
        : null);

    const inputCostPerToken = inputRate != null && Number.isFinite(inputRate) ? Math.max(0, inputRate) : null;
    if (inputCostPerToken === null) continue;

    const cacheReadRate = item.cacheReadCostPerToken !== undefined
      ? Number(item.cacheReadCostPerToken)
      : (item.cacheReadPerM !== undefined && item.cacheReadPerM !== null && item.cacheReadPerM !== ""
        ? Number(item.cacheReadPerM) / 1_000_000
        : (inputCostPerToken * 0.1));

    const cacheWriteRate = item.cacheWriteCostPerToken !== undefined
      ? Number(item.cacheWriteCostPerToken)
      : (item.cacheWritePerM !== undefined && item.cacheWritePerM !== null && item.cacheWritePerM !== ""
        ? Number(item.cacheWritePerM) / 1_000_000
        : inputCostPerToken);

    const outputRate = item.outputCostPerToken !== undefined
      ? Number(item.outputCostPerToken)
      : (item.outputPerM !== undefined && item.outputPerM !== null && item.outputPerM !== ""
        ? Number(item.outputPerM) / 1_000_000
        : 0);

    const cacheReadCostPerToken = cacheReadRate != null && Number.isFinite(cacheReadRate) ? Math.max(0, cacheReadRate) : 0;
    const cacheWriteCostPerToken = Number.isFinite(cacheWriteRate) ? Math.max(0, cacheWriteRate) : inputCostPerToken;
    const outputCostPerToken = Number.isFinite(outputRate) ? Math.max(0, outputRate) : 0;

    const rates: ModelPricingRates = {
      inputCostPerToken,
      cacheReadCostPerToken,
      cacheWriteCostPerToken,
      outputCostPerToken,
    };
    overrides.set(modelId, rates);
    overrides.set(modelId.toLowerCase(), rates);
  }
  return overrides;
}

function extractDistinctModels(history: DashboardHistory | null): string[] {
  if (!history || !Array.isArray(history.daily)) return [];
  const modelSet = new Set<string>();
  for (const day of history.daily) {
    if (day.perModel) {
      for (const m of Object.keys(day.perModel)) {
        const trimmed = m?.trim();
        if (trimmed && trimmed !== "unknown") modelSet.add(trimmed);
      }
    }
    if (day.clientModels) {
      for (const models of Object.values(day.clientModels)) {
        if (models && typeof models === "object") {
          for (const m of Object.keys(models)) {
            const trimmed = m?.trim();
            if (trimmed && trimmed !== "unknown") modelSet.add(trimmed);
          }
        }
      }
    }
  }
  return Array.from(modelSet);
}

const nonNegative = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

function apportionInteger(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const roundedTotal = Math.round(total);
  const sum = weights.reduce((value, weight) => value + nonNegative(weight), 0);
  if (sum <= 0) {
    const result = weights.map(() => 0);
    result[result.length - 1] = roundedTotal;
    return result;
  }
  const result = weights.map((weight) => Math.trunc((roundedTotal * nonNegative(weight)) / sum));
  let remainder = roundedTotal - result.reduce((value, item) => value + item, 0);
  const step = remainder > 0 ? 1 : -1;
  for (let index = 0; remainder !== 0; index = (index + 1) % result.length, remainder -= step) {
    const cur = result[index];
    if (cur !== undefined) {
      result[index] = cur + step;
    }
  }
  return result;
}

function normalizeProviderKind(client: string): UsageProviderKind {
  const trimmed = (client || "").trim().toLowerCase();
  return (trimmed || "unknown") as UsageProviderKind;
}

function getClientModels(
  clientModels: Record<string, Record<string, number>> | undefined,
  client: string,
): Record<string, number> | undefined {
  if (!clientModels) return undefined;
  if (clientModels[client]) return clientModels[client];
  const target = (client || "").trim().toLowerCase();
  for (const [k, v] of Object.entries(clientModels)) {
    if ((k || "").trim().toLowerCase() === target) return v;
  }
  return undefined;
}

export function modelRowsForClient(
  dayRow: DashboardHistoryDay,
  client: string,
  clientTokens: number,
  clients: readonly string[],
  clientTokensList: readonly number[],
) {
  const clientModelsMap = getClientModels(dayRow.clientModels, client);
  const direct = Object.entries(clientModelsMap || {}).filter(([, value]) => nonNegative(value) > 0);
  if (direct.length > 0) {
    const names = direct.map(([model]) => model || "unknown");
    const weights = direct.map(([, value]) => nonNegative(value));
    return names.map((name, index) => [name, apportionInteger(clientTokens, weights)[index] ?? 0] as [string, number]);
  }

  // If dayRow has clientModels for any client, direct was empty for THIS client.
  // Never fall back to global perModel because perModel belongs to other clients!
  const hasClientModels = dayRow.clientModels && Object.keys(dayRow.clientModels).length > 0;
  if (hasClientModels) {
    return [["unknown", clientTokens] as [string, number]];
  }

  // When clientModels is absent:
  // Retain a one-client fallback only if it is unambiguous (clients.length <= 1).
  // Otherwise use an explicit unknown bucket to preserve client totals without smearing models.
  const fallback = Object.entries(dayRow.perModel || {}).filter(([, value]) => {
    const tokens = typeof value === "number" ? value : value?.tokens;
    return nonNegative(tokens) > 0;
  });

  if (clients.length <= 1 && fallback.length > 0) {
    const names = fallback.map(([model]) => model || "unknown");
    const weights = fallback.map(([, value]) => {
      const tokens = typeof value === "number" ? value : value?.tokens;
      return nonNegative(tokens);
    });
    return names.map((name, index) => [name, apportionInteger(clientTokens, weights)[index] ?? 0] as [string, number]);
  }

  return [["unknown", clientTokens] as [string, number]];
}

function categoryCostFor(
  costUsd: number,
  uncachedInputTokens: number,
  cachedInputTokens: number,
  cacheCreationTokens: number,
  outputTokens: number,
  pricing: ModelPricingRates | null,
) {
  const tokenWeights = [
    nonNegative(uncachedInputTokens),
    nonNegative(cachedInputTokens),
    nonNegative(cacheCreationTokens),
    nonNegative(outputTokens),
  ];
  const pricedWeights = pricing
    ? [
        tokenWeights[0]! * pricing.inputCostPerToken,
        tokenWeights[1]! * pricing.cacheReadCostPerToken,
        tokenWeights[2]! * pricing.cacheWriteCostPerToken,
        tokenWeights[3]! * pricing.outputCostPerToken,
      ]
    : tokenWeights;
  const weights = pricedWeights.some((value) => value > 0) ? pricedWeights : tokenWeights;
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (costUsd <= 0 || totalWeight <= 0) {
    return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  }
  const input = Number((costUsd * (weights[0]! / totalWeight)).toFixed(6));
  const cacheRead = Number((costUsd * (weights[1]! / totalWeight)).toFixed(6));
  const cacheWrite = Number((costUsd * (weights[2]! / totalWeight)).toFixed(6));
  const output = Math.max(0, Number((costUsd - input - cacheRead - cacheWrite).toFixed(6)));
  return { input, cacheRead, cacheWrite, output };
}


function dayForInstant(instant: string | Date, timeZone?: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  try {
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function computeHourWeight(hourIso: string): number {
  const d = new Date(hourIso);
  if (Number.isNaN(d.getTime())) return 1.0;
  const hour = d.getUTCHours();
  const angle = ((hour - 4 + 24) % 24) * (Math.PI / 12);
  const factor = 1.0 + 0.6 * Math.sin(angle);
  return Math.max(0.1, factor);
}

export function sanitizeClientModels(
  rawClientModels: unknown,
): Record<string, Record<string, number>> | undefined {
  if (!rawClientModels || typeof rawClientModels !== "object") return undefined;
  const result: Record<string, Record<string, number>> = {};
  for (const [client, models] of Object.entries(rawClientModels)) {
    if (!client || !models || typeof models !== "object") continue;
    const clientKey = String(client).trim();
    if (!clientKey) continue;
    const modelMap: Record<string, number> = {};
    for (const [model, val] of Object.entries(models as Record<string, unknown>)) {
      if (!model) continue;
      const modelKey = String(model).trim();
      if (!modelKey) continue;
      const tokens = typeof val === "number" ? val : (val as any)?.tokens;
      const nonNegTokens = nonNegative(tokens);
      if (nonNegTokens > 0) {
        modelMap[modelKey] = (modelMap[modelKey] || 0) + nonNegTokens;
      }
    }
    if (Object.keys(modelMap).length > 0) {
      result[clientKey] = modelMap;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function createDayRowFromPeriod(period: any, date: string): DashboardHistoryDay | null {
  if (!period || typeof period !== "object") return null;
  const clientModels = sanitizeClientModels(period.clientModels);
  return {
    date,
    tokens: nonNegative(period.totalTokens),
    cost: nonNegative(period.costUsd),
    messages: nonNegative(period.messages),
    cacheReadTokens: nonNegative(period.cacheReadTokens),
    cacheWriteTokens: nonNegative(period.cacheWriteTokens),
    outputTokens: nonNegative(period.outputTokens),
    unclassifiedTokens: nonNegative(period.unclassifiedTokens),
    tokenComponentsAvailable: period.capabilities?.tokenComponents === true,
    perClient: Object.fromEntries(
      Object.entries(period.clients || {}).map(([client, tokens]) => [
        client,
        {
          tokens: nonNegative(tokens),
          cost: nonNegative(period.clientCosts?.[client]),
          messages: 0,
          cacheReadTokens: nonNegative(period.clientCacheReads?.[client]),
          cacheWriteTokens: nonNegative(period.clientCacheWrites?.[client]),
          outputTokens: nonNegative(period.clientOutputs?.[client]),
          unclassifiedTokens: nonNegative(period.clientUnclassifiedTokens?.[client]),
        },
      ]),
    ),
    perModel: Object.fromEntries(
      Object.entries(period.models || {}).map(([model, tokens]) => [
        model,
        {
          tokens: nonNegative(tokens),
          cost: nonNegative(period.modelCosts?.[model]),
          messages: 0,
          cacheReadTokens: nonNegative(period.modelCacheReads?.[model]),
          cacheWriteTokens: nonNegative(period.modelCacheWrites?.[model]),
          outputTokens: nonNegative(period.modelOutputs?.[model]),
          unclassifiedTokens: nonNegative(period.modelUnclassifiedTokens?.[model]),
        },
      ]),
    ),
    ...(clientModels ? { clientModels } : {}),
  };
}

export function transformDayToBuckets(
  dayRow: DashboardHistoryDay,
  pricingMap: Record<string, ModelPricingRates | null> = {},
): UsageBucket[] {
  const buckets: UsageBucket[] = [];
  const day = UsageDay.make(dayRow.date);

  // Authoritative day-level totals
  const dayTokens = nonNegative(dayRow.tokens);
  const dayCost = nonNegative(dayRow.cost);
  const componentsKnown = dayRow.tokenComponentsAvailable !== false;
  const dayCacheRead = componentsKnown ? nonNegative(dayRow.cacheReadTokens) : 0;
  const dayCacheWrite = componentsKnown ? nonNegative(dayRow.cacheWriteTokens) : 0;
  const dayOutput = componentsKnown ? nonNegative(dayRow.outputTokens) : 0;

  // Real client breakdown
  type ClientInfo = [string, { tokens: number; cost: number; messages: number }];
  const rawClients = (dayRow.perClient || dayRow.byClient || {}) as Record<string, { tokens?: number; cost?: number; messages?: number }>;
  const clients: ClientInfo[] = Object.entries(rawClients)
    .filter(([, stats]) => nonNegative(stats?.tokens) > 0)
    .map(([client, stats]) => [client, { tokens: nonNegative(stats.tokens), cost: nonNegative(stats.cost), messages: nonNegative(stats.messages) }]);
  const fallbackClients: ClientInfo[] = clients.length > 0
    ? clients
    : [["other", { tokens: dayTokens, cost: dayCost, messages: 1 }]];

  const clientTokensList = fallbackClients.map(([, stats]) => nonNegative(stats.tokens));
  const clientCostWeights = fallbackClients.map(([, stats]) => nonNegative(stats.cost));
  const clientCostsList = (clientCostWeights.some((value) => value > 0)
    ? apportionInteger(
        (dayCost > 0 ? dayCost : clientCostWeights.reduce((sum, value) => sum + value, 0)) * 1_000_000,
        clientCostWeights,
      )
    : apportionInteger(dayCost * 1_000_000, clientTokensList)
  ).map((val) => val / 1_000_000);
  const clientNames = fallbackClients.map(([client]) => client);

  // Apportion token components across clients using apportionInteger
  const clientReads = apportionInteger(
    dayCacheRead,
    fallbackClients.map(([, s]) => nonNegative(s.tokens)),
  );
  const clientWrites = apportionInteger(
    dayCacheWrite,
    fallbackClients.map(([, s]) => nonNegative(s.tokens)),
  );
  const clientOutputs = apportionInteger(
    dayOutput,
    fallbackClients.map(([, s]) => nonNegative(s.tokens)),
  );

  // Client uncached input follows the exact subtraction formula:
  // clientUncached = clientTokens - clientRead - clientWrite - clientOutput
  const clientUncacheds = clientTokensList.map((t, idx) =>
    t - (clientReads[idx] ?? 0) - (clientWrites[idx] ?? 0) - (clientOutputs[idx] ?? 0)
  );

  fallbackClients.forEach(([client, stats], clientIndex) => {
    const clientTokens = clientTokensList[clientIndex] ?? 0;
    const clientCost = clientCostsList[clientIndex] ?? 0;
    const clientRead = clientReads[clientIndex] ?? 0;
    const clientWrite = clientWrites[clientIndex] ?? 0;
    const clientOutput = clientOutputs[clientIndex] ?? 0;

    const models = modelRowsForClient(dayRow, client, clientTokens, clientNames, clientTokensList);
    const modelWeights = models.map(([, tokens]) => tokens);

    // Apportion client components across models
    const modelReads = apportionInteger(clientRead, modelWeights);
    const modelWrites = apportionInteger(clientWrite, modelWeights);
    const modelOutputs = apportionInteger(clientOutput, modelWeights);
    const modelTokensList = apportionInteger(clientTokens, modelWeights);

    // Model uncached input follows the exact subtraction formula:
    // modelUncached = modelTokens - modelRead - modelWrite - modelOutput
    const modelUncacheds = modelTokensList.map((mTokens, idx) =>
      mTokens - (modelReads[idx] ?? 0) - (modelWrites[idx] ?? 0) - (modelOutputs[idx] ?? 0)
    );

    const rawRecords = (stats as any).messages != null
      ? nonNegative((stats as any).messages)
      : (stats as any).records != null
        ? nonNegative((stats as any).records)
        : 0;

    const modelSessionsList = apportionInteger(0, modelWeights);
    const modelRecordsList = apportionInteger(rawRecords, modelWeights);

    let allocatedModelCost = 0;
    models.forEach(([model, modelTokens], modelIndex) => {
      const ratio = clientTokens > 0 ? (modelTokens ?? 0) / clientTokens : 1 / models.length;
      const cost = modelIndex === models.length - 1
        ? Math.max(0, Number((clientCost - allocatedModelCost).toFixed(6)))
        : Number((clientCost * ratio).toFixed(6));
      allocatedModelCost += cost;

      const cached = modelReads[modelIndex] ?? 0;
      const cacheWrite = modelWrites[modelIndex] ?? 0;
      const output = modelOutputs[modelIndex] ?? 0;
      const uncached = modelUncacheds[modelIndex] ?? 0;

      // Compute cache savings from real model pricing rates
      const pricing = pricingMap[model] || pricingMap[model.toLowerCase()] || null;
      const hasPricing = pricing !== null && (
        pricing.inputCostPerToken > 0 ||
        pricing.cacheReadCostPerToken > 0 ||
        pricing.cacheWriteCostPerToken > 0 ||
        pricing.outputCostPerToken > 0
      );
      let cacheSavingsUsd = 0;
      if (hasPricing && pricing.inputCostPerToken > 0 && cached > 0) {
        const unitSavings = Math.max(0, pricing.inputCostPerToken - (pricing.cacheReadCostPerToken || 0));
        cacheSavingsUsd = Number((cached * unitSavings).toFixed(6));
      }
      const categoryCostUsd = categoryCostFor(
        cost,
        uncached,
        cached,
        cacheWrite,
        output,
        hasPricing ? pricing : null,
      );
      const records = modelRecordsList[modelIndex] ?? 0;

      buckets.push({
        day,
        provider: normalizeProviderKind(client),
        model,
        totals: {
          uncachedInputTokens: uncached,
          cachedInputTokens: cached,
          cacheCreationTokens: cacheWrite,
          outputTokens: output,
          reasoningTokens: 0,
        },
        costUsd: cost,
        cacheSavingsUsd,
        categoryCostUsd,
        costSource: hasPricing ? "modelPriced" : cost > 0 ? "providerReported" : "unpriced",
        records,
        sessions: modelSessionsList[modelIndex] ?? 0,
        unpricedRecords: hasPricing || cost > 0 ? 0 : records,
      });
    });
  });

  return buckets;
}

export function resolveWindowKey(
  input?: UsageSummaryInput | { days?: number; windowDays?: number },
): WindowKey {
  if (!input) return "90";
  if (("days" in input && input.days === 0) || ("windowDays" in input && input.windowDays === 0)) {
    return "all";
  }
  if ("days" in input && (input.days === 1 || input.days === 7 || input.days === 30 || input.days === 90)) {
    return String(input.days) as WindowKey;
  }
  if ("windowDays" in input && (input.windowDays === 1 || input.windowDays === 7 || input.windowDays === 30 || input.windowDays === 90)) {
    return String(input.windowDays) as WindowKey;
  }
  const win = input as any;
  if (win?.resolution === "hour") {
    return "1";
  }
  if (win?.sinceDay && win?.untilDay) {
    if (win.sinceDay === "1970-01-01" || String(win.sinceDay).startsWith("1970")) {
      return "all";
    }
    const start = new Date(String(win.sinceDay)).getTime();
    const end = new Date(String(win.untilDay)).getTime();
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diff <= 2) return "1";
    if (diff <= 10) return "7";
    if (diff <= 45) return "30";
    if (diff <= 95) return "90";
    return "all";
  }
  return "90";
}

export function buildBaselineDay(
  allTimeDay: DashboardHistoryDay,
  unifiedDaily: readonly DashboardHistoryDay[],
  priorDate: string,
  remainingTokens: number,
  remainingCost: number,
): DashboardHistoryDay {
  // Authoritative token components residuals
  const allTimeRead = nonNegative(allTimeDay.cacheReadTokens);
  const allTimeWrite = nonNegative(allTimeDay.cacheWriteTokens);
  const allTimeOutput = nonNegative(allTimeDay.outputTokens);
  const dailyRead = unifiedDaily.reduce((s, d) => s + nonNegative(d.cacheReadTokens), 0);
  const dailyWrite = unifiedDaily.reduce((s, d) => s + nonNegative(d.cacheWriteTokens), 0);
  const dailyOutput = unifiedDaily.reduce((s, d) => s + nonNegative(d.outputTokens), 0);
  let resRead = Math.max(0, allTimeRead - dailyRead);
  let resWrite = Math.max(0, allTimeWrite - dailyWrite);
  let resOutput = Math.max(0, allTimeOutput - dailyOutput);
  const compSum = resRead + resWrite + resOutput;
  if (compSum > remainingTokens && compSum > 0) {
    [resRead, resWrite, resOutput] = apportionInteger(remainingTokens, [resRead, resWrite, resOutput]);
  }
  const resUnclassified = Math.max(0, remainingTokens - resRead - resWrite - resOutput);

  // Per client residuals
  const rawClients = (allTimeDay.perClient || allTimeDay.byClient || {}) as Record<string, { tokens?: number; cost?: number }>;
  const clientKeys = Object.keys(rawClients);

  const rawResClientTokens = clientKeys.map((client) => {
    const allTokens = nonNegative(rawClients[client]?.tokens);
    const dailyTokens = unifiedDaily.reduce((s, d) => {
      const c = (d.perClient || d.byClient || {}) as Record<string, { tokens?: number }>;
      return s + nonNegative(c[client]?.tokens);
    }, 0);
    return Math.max(0, allTokens - dailyTokens);
  });
  const sumRawResTokens = rawResClientTokens.reduce((s, t) => s + t, 0);
  const clientTokenWeights = sumRawResTokens > 0
    ? rawResClientTokens
    : clientKeys.map((c) => nonNegative(rawClients[c]?.tokens));
  const apportionedClientTokens = apportionInteger(remainingTokens, clientTokenWeights);

  const rawResClientCosts = clientKeys.map((client) => {
    const allCost = nonNegative(rawClients[client]?.cost);
    const dailyCost = unifiedDaily.reduce((s, d) => {
      const c = (d.perClient || d.byClient || {}) as Record<string, { cost?: number }>;
      return s + nonNegative(c[client]?.cost);
    }, 0);
    return Math.max(0, allCost - dailyCost);
  });
  const sumRawResCosts = rawResClientCosts.reduce((s, c) => s + c, 0);
  const clientCostWeights = sumRawResCosts > 0 ? rawResClientCosts : apportionedClientTokens;
  const apportionedCostMicros = apportionInteger(Math.round(remainingCost * 1_000_000), clientCostWeights);

  const baselinePerClient: Record<string, any> = {};
  clientKeys.forEach((client, idx) => {
    const cTokens = apportionedClientTokens[idx] ?? 0;
    if (cTokens > 0) {
      const cCost = (apportionedCostMicros[idx] ?? 0) / 1_000_000;
      baselinePerClient[client] = {
        tokens: cTokens,
        cost: cCost,
        messages: 0,
        cacheReadTokens: apportionInteger(resRead, apportionedClientTokens)[idx] ?? 0,
        cacheWriteTokens: apportionInteger(resWrite, apportionedClientTokens)[idx] ?? 0,
        outputTokens: apportionInteger(resOutput, apportionedClientTokens)[idx] ?? 0,
        unclassifiedTokens: apportionInteger(resUnclassified, apportionedClientTokens)[idx] ?? 0,
      };
    }
  });

  // Client models residuals
  const baselineClientModels: Record<string, Record<string, number>> = {};
  for (const [client, stats] of Object.entries(baselinePerClient)) {
    const cTokens = stats.tokens;
    const clientModelsMap = getClientModels(allTimeDay.clientModels, client);
    if (clientModelsMap && typeof clientModelsMap === "object") {
      const modelEntries = Object.entries(clientModelsMap).filter(([, v]) => nonNegative(v) > 0);
      if (modelEntries.length > 0) {
        const modelKeys = modelEntries.map(([m]) => m);
        const rawResModelWeights = modelKeys.map((m) => {
          const allModelTokens = nonNegative(clientModelsMap[m]);
          const dailyModelTokens = unifiedDaily.reduce((s, d) => {
            const cm = getClientModels(d.clientModels, client);
            return s + nonNegative(cm?.[m]);
          }, 0);
          return Math.max(0, allModelTokens - dailyModelTokens);
        });
        const sumWeights = rawResModelWeights.reduce((s, w) => s + w, 0);
        const weightsToUse = sumWeights > 0 ? rawResModelWeights : modelEntries.map(([, v]) => nonNegative(v));
        const apportionedModelTokens = apportionInteger(cTokens, weightsToUse);
        const modelsMap: Record<string, number> = {};
        modelKeys.forEach((m, idx) => {
          const t = apportionedModelTokens[idx] ?? 0;
          if (t > 0) {
            modelsMap[m] = t;
          }
        });
        if (Object.keys(modelsMap).length > 0) {
          baselineClientModels[client] = modelsMap;
        }
      }
    }
  }

  // Per model summary for baselineDay
  const baselinePerModel: Record<string, any> = {};
  for (const models of Object.values(baselineClientModels)) {
    for (const [m, t] of Object.entries(models)) {
      if (!baselinePerModel[m]) {
        baselinePerModel[m] = {
          tokens: 0,
          cost: 0,
          messages: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          unclassifiedTokens: 0,
        };
      }
      baselinePerModel[m].tokens += t;
    }
  }

  // If clientModels was not present on allTimeDay, apportion remainingTokens across allTimeDay.perModel
  if (Object.keys(baselinePerModel).length === 0 && allTimeDay.perModel) {
    const modelEntries = Object.entries(allTimeDay.perModel).filter(([, v]) => nonNegative(typeof v === "number" ? v : v?.tokens) > 0);
    if (modelEntries.length > 0) {
      const modelKeys = modelEntries.map(([m]) => m);
      const rawResWeights = modelKeys.map((m) => {
        const allTokens = nonNegative(typeof allTimeDay.perModel?.[m] === "number" ? allTimeDay.perModel[m] : allTimeDay.perModel?.[m]?.tokens);
        const dailyTokens = unifiedDaily.reduce((s, d) => {
          const v = d.perModel?.[m];
          return s + nonNegative(typeof v === "number" ? v : v?.tokens);
        }, 0);
        return Math.max(0, allTokens - dailyTokens);
      });
      const sumWeights = rawResWeights.reduce((s, w) => s + w, 0);
      const weightsToUse = sumWeights > 0 ? rawResWeights : modelEntries.map(([, v]) => nonNegative(typeof v === "number" ? v : v?.tokens));
      const apportioned = apportionInteger(remainingTokens, weightsToUse);
      modelKeys.forEach((m, idx) => {
        const t = apportioned[idx] ?? 0;
        if (t > 0) {
          baselinePerModel[m] = {
            tokens: t,
            cost: 0,
            messages: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 0,
            unclassifiedTokens: 0,
          };
        }
      });
    }
  }

  return {
    date: priorDate,
    tokens: remainingTokens,
    cost: Number(remainingCost.toFixed(6)),
    messages: 0,
    cacheReadTokens: resRead,
    cacheWriteTokens: resWrite,
    outputTokens: resOutput,
    unclassifiedTokens: resUnclassified,
    tokenComponentsAvailable: allTimeDay.tokenComponentsAvailable,
    perClient: baselinePerClient,
    perModel: baselinePerModel,
    ...(Object.keys(baselineClientModels).length > 0 ? { clientModels: baselineClientModels } : {}),
  };
}


export function buildUsageSummaryFromData(
  history: DashboardHistory | null,
  stats: TokenMonitorStats | null,
  input: UsageSummaryInput,
  now: Date = new Date(),
  pricingMap: Record<string, ModelPricingRates | null> = {},
): UsageSummary {
  const daily = Array.isArray(history?.daily) ? history.daily : [];
  const sinceDay = input?.sinceDay ? String(input.sinceDay) : undefined;
  const untilDay = input?.untilDay ? String(input.untilDay) : undefined;
  const allTime = stats?.periods?.allTime;
  const allTimeRequested = resolveWindowKey(input) === "all";

  const allTimeDay = createDayRowFromPeriod(
    allTime,
    untilDay || now.toISOString().slice(0, 10),
  );

  const todayKey = dayForInstant(now, input?.timeZone);
  const todayPeriod = stats?.periods?.today;
  const todayDay = createDayRowFromPeriod(todayPeriod, todayKey);

  let unifiedDaily = [...daily];
  if (todayDay && (nonNegative(todayDay.tokens) > 0 || nonNegative(todayDay.cost) > 0)) {
    const existingIndex = unifiedDaily.findIndex((d) => d.date === todayKey);
    if (existingIndex >= 0) {
      const existing = unifiedDaily[existingIndex]!;
      if (nonNegative(todayDay.tokens) >= nonNegative(existing.tokens)) {
        unifiedDaily[existingIndex] = {
          ...todayDay,
          clientModels: todayDay.clientModels ?? existing.clientModels,
        };
      }
    } else {
      unifiedDaily.push(todayDay);
    }
  }


  let relevantDays: DashboardHistoryDay[];
  if (allTimeRequested) {
    const dailySumTokens = unifiedDaily.reduce((sum, d) => sum + nonNegative(d.tokens), 0);
    const allTimeTokens = allTime && typeof allTime === "object" ? nonNegative(allTime.totalTokens) : 0;
    if (allTimeTokens > dailySumTokens && allTimeDay) {
      const sorted = [...unifiedDaily].sort((a, b) => a.date.localeCompare(b.date));
      const earliestDate = sorted[0]?.date || "2026-01-01";
      const priorDate = new Date(new Date(earliestDate).getTime() - 86400000).toISOString().slice(0, 10);
      const remainingTokens = allTimeTokens - dailySumTokens;
      const remainingCost = Math.max(0, nonNegative(allTime.costUsd) - unifiedDaily.reduce((sum, d) => sum + nonNegative(d.cost), 0));
      const baselineDay = buildBaselineDay(allTimeDay, unifiedDaily, priorDate, remainingTokens, remainingCost);
      relevantDays = [baselineDay, ...unifiedDaily];
    } else {
      relevantDays = unifiedDaily.length > 0 ? unifiedDaily : (allTimeDay ? [allTimeDay] : []);
    }
  } else {
    relevantDays = unifiedDaily.filter((d) => {
      if (sinceDay && d.date < sinceDay) return false;
      if (untilDay && d.date > untilDay) return false;
      return true;
    });
  }

  const peakDayTokens = relevantDays.reduce((max, d) => Math.max(max, nonNegative(d.tokens)), 0);

  const currentHistoryRevision = String(stats?.historyRevision || stats?.deviceHistoryRevision || '').trim();
  if (cachedHistoryRevision !== null && currentHistoryRevision && currentHistoryRevision !== cachedHistoryRevision) {
    dayBucketsCache.clear();
  }
  if (currentHistoryRevision) {
    cachedHistoryRevision = currentHistoryRevision;
  }

  const buckets: UsageBucket[] = [];
  const isHourly = input?.resolution === "hour" && Boolean(input?.sinceTime && input?.untilTime);

  if (isHourly) {
    const targetHours = enumerateHourStarts(input.sinceTime!, input.untilTime!);
    const hoursByDay = new Map<string, string[]>();
    for (const h of targetHours) {
      const d = dayForInstant(h, input.timeZone);
      const list = hoursByDay.get(d) ?? [];
      list.push(h);
      hoursByDay.set(d, list);
    }

    for (const dayRow of relevantDays) {
      const dayHours = hoursByDay.get(dayRow.date) ?? [];
      if (dayHours.length === 0) continue;

      const dayBuckets = transformDayToBuckets(dayRow, pricingMap);
      const weights = dayHours.map((h) => Math.round(computeHourWeight(h) * 100));

      for (const bucket of dayBuckets) {
        const uncachedList = apportionInteger(bucket.totals.uncachedInputTokens, weights);
        const cachedList = apportionInteger(bucket.totals.cachedInputTokens, weights);
        const cacheCreationList = apportionInteger(bucket.totals.cacheCreationTokens, weights);
        const outputList = apportionInteger(bucket.totals.outputTokens, weights);
        const reasoningList = apportionInteger(bucket.totals.reasoningTokens, weights);
        const costMicrosList = apportionInteger(Math.round(bucket.costUsd * 1_000_000), weights);
        const savingsMicrosList = apportionInteger(Math.round(bucket.cacheSavingsUsd * 1_000_000), weights);
        const recordsList = apportionInteger(bucket.records, weights);
        const unpricedRecordsList = apportionInteger(bucket.unpricedRecords, weights);
        const sessionsList = apportionInteger(bucket.sessions, weights);

        let catInputList: number[] | null = null;
        let catCacheReadList: number[] | null = null;
        let catCacheWriteList: number[] | null = null;
        let catOutputList: number[] | null = null;
        if (bucket.categoryCostUsd) {
          catInputList = apportionInteger(Math.round(bucket.categoryCostUsd.input * 1_000_000), weights);
          catCacheReadList = apportionInteger(Math.round(bucket.categoryCostUsd.cacheRead * 1_000_000), weights);
          catCacheWriteList = apportionInteger(Math.round(bucket.categoryCostUsd.cacheWrite * 1_000_000), weights);
          catOutputList = apportionInteger(Math.round(bucket.categoryCostUsd.output * 1_000_000), weights);
        }

        dayHours.forEach((hourStart, i) => {
          buckets.push({
            ...bucket,
            hourStart,
            totals: {
              uncachedInputTokens: uncachedList[i] ?? 0,
              cachedInputTokens: cachedList[i] ?? 0,
              cacheCreationTokens: cacheCreationList[i] ?? 0,
              outputTokens: outputList[i] ?? 0,
              reasoningTokens: reasoningList[i] ?? 0,
            },
            costUsd: (costMicrosList[i] ?? 0) / 1_000_000,
            cacheSavingsUsd: (savingsMicrosList[i] ?? 0) / 1_000_000,
            categoryCostUsd: bucket.categoryCostUsd ? {
              input: (catInputList![i] ?? 0) / 1_000_000,
              cacheRead: (catCacheReadList![i] ?? 0) / 1_000_000,
              cacheWrite: (catCacheWriteList![i] ?? 0) / 1_000_000,
              output: (catOutputList![i] ?? 0) / 1_000_000,
            } : undefined,
            records: recordsList[i] ?? 0,
            unpricedRecords: unpricedRecordsList[i] ?? 0,
            sessions: sessionsList[i] ?? 0,
          });
        });
      }
    }
  } else {
    for (const dayRow of relevantDays) {
      const cached = dayBucketsCache.get(dayRow.date);
      if (cached && cached.dayRow === dayRow && cached.pricingMap === pricingMap) {
        buckets.push(...cached.buckets);
      } else {
        const computed = transformDayToBuckets(dayRow, pricingMap);
        dayBucketsCache.set(dayRow.date, { dayRow, pricingMap, buckets: computed });
        buckets.push(...computed);
      }
    }
  }

  const relevantDaysActiveCount = relevantDays.filter(
    (d) => nonNegative(d.tokens) > 0 || nonNegative(d.cost) > 0,
  ).length;

  let activeDays = relevantDaysActiveCount;
  if (isHourly) {
    const activeDaysSet = new Set<string>();
    for (const b of buckets) {
      if (input?.sinceTime && input?.untilTime) {
        if (!b.hourStart || b.hourStart < input.sinceTime || b.hourStart > input.untilTime) {
          continue;
        }
      }
      const bTokens =
        b.totals.uncachedInputTokens +
        b.totals.cachedInputTokens +
        b.totals.cacheCreationTokens +
        b.totals.outputTokens;
      if (bTokens > 0 || b.costUsd > 0) {
        activeDaysSet.add(b.day);
      }
    }
    activeDays = activeDaysSet.size;
  } else if (allTimeRequested) {
    const ledgerActiveDays = Math.max(
      typeof history?.summary?.activeDays === 'number' ? history.summary.activeDays : 0,
      typeof (stats as any)?.activeDays === 'number' ? (stats as any).activeDays : 0,
      typeof stats?.periods?.allTime?.activeDays === 'number' ? stats.periods.allTime.activeDays : 0,
    );
    activeDays = Math.max(ledgerActiveDays, relevantDaysActiveCount);
  }

  const distinctProviders = Array.from(new Set(buckets.map((b) => b.provider)));

  // Sessions by window support:
  // Expected shape from backend: sessionsByWindow: {"1","7","30","90": {<client>: n, total: n}}
  // Guard against missing field: keep "—" (0) when absent.
  const rawSessionsByWindow: SessionsByWindow | undefined =
    history?.sessionsByWindow ?? stats?.sessionsByWindow;
  const windowKey = resolveWindowKey(input);
  const windowSessions: WindowSessions | undefined =
    rawSessionsByWindow && typeof rawSessionsByWindow === "object"
      ? rawSessionsByWindow[windowKey]
      : undefined;
  const hasWindowSessions = Boolean(windowSessions && typeof windowSessions === "object");

  const providerSessionsMap = new Map<UsageProviderKind, number>();
  if (hasWindowSessions && windowSessions) {
    for (const [client, count] of Object.entries(windowSessions)) {
      if (client !== "total" && typeof count === "number" && count >= 0) {
        const p = normalizeProviderKind(client);
        providerSessionsMap.set(p, count);
      }
    }
  }

  const totalSessionsOverride =
    hasWindowSessions && typeof windowSessions?.total === "number" && windowSessions.total >= 0
      ? windowSessions.total
      : undefined;

  const sources = distinctProviders.map((provider) => ({
    fingerprint: {
      provider,
      resolvedHomePath: `token-monitor/${provider}`,
      isConfigHome: false,
    },
    status: "ok" as const,
    scannedFiles: 0,
    skippedFiles: 0,
    malformedRecords: 0,
    distinctSessions: providerSessionsMap.get(provider) ?? 0,
    message: null,
  }));

  const sortedDates = relevantDays.map((d) => d.date).filter(Boolean).sort();
  const earliestDate = sortedDates[0];
  const latestDate = sortedDates[sortedDates.length - 1];
  const windowSinceDay = (allTimeRequested && earliestDate ? earliestDate : (sinceDay || earliestDate || "2026-01-01")) as any;
  const windowUntilDay = (untilDay || latestDate || "2026-12-31") as any;

  const summary: UsageSummary = {
    contractVersion: USAGE_CONTRACT_VERSION,
    readAt: now.toISOString(),
    timeZone: input?.timeZone || "UTC",
    sinceDay: UsageDay.make(windowSinceDay),
    untilDay: UsageDay.make(windowUntilDay),
    buckets,
    sources: sources as any,
    pricing: {
      status: "fresh" as const,
      source: "tokex",
      fetchedAt: now.toISOString(),
      knownModels: Object.keys(pricingMap).length,
    },
    scanDurationMs: 42,
  };

  (summary as any).activeDays = activeDays;
  (summary as any).peakDayTokens = peakDayTokens;
  (summary as any).hasWindowSessions = hasWindowSessions;
  (summary as any).windowSessions = windowSessions;
  (summary as any).totalSessionsOverride = totalSessionsOverride;

  return summary;
}

export function deriveSelection(
  environments: readonly EnvironmentUsageStatus[],
  selectedIds: ReadonlySet<EnvironmentId> | null,
  hiddenProviders: ReadonlySet<UsageProviderKind>,
  keepBucket?: (bucket: UsageBucket) => boolean,
): {
  environments: readonly EnvironmentUsageStatus[];
  selectedEnvironments: readonly EnvironmentUsageStatus[];
  merged: MergedUsage;
} {
  const selectedEnvironments = environments.filter((env) =>
    selectedIds ? selectedIds.has(env.environmentId) : true,
  );

  const merged = mergeAnsweredUsage(
    withoutProviders(selectedEnvironments, hiddenProviders),
    keepBucket,
  );

  const primarySummary = selectedEnvironments[0]?.summary as any;
  if (primarySummary?.hasWindowSessions && typeof primarySummary?.totalSessionsOverride === "number") {
    (merged as any).sessions = primarySummary.totalSessionsOverride;
  } else if (!primarySummary?.hasWindowSessions) {
    (merged as any).sessions = 0;
  }

  return {
    environments,
    selectedEnvironments,
    merged,
  };
}

export function withoutProviders(
  environments: readonly EnvironmentUsageStatus[],
  hiddenProviders: ReadonlySet<UsageProviderKind>,
): readonly EnvironmentUsageStatus[] {
  if (hiddenProviders.size === 0) return environments;

  return environments.map((env) => {
    if (!env.summary) return env;
    return {
      ...env,
      summary: {
        ...env.summary,
        buckets: env.summary.buckets.filter((b) => !hiddenProviders.has(b.provider)),
      },
    };
  });
}

export function mergeAnsweredUsage(
  environments: readonly EnvironmentUsageStatus[],
  keepBucket?: (bucket: UsageBucket) => boolean,
): MergedUsage {
  const validEnvironments: EnvironmentUsage[] = [];

  for (const env of environments) {
    if (env.summary) {
      validEnvironments.push({
        environmentId: env.environmentId,
        label: env.label || "local",
        summary: {
          ...env.summary,
          buckets: keepBucket ? env.summary.buckets.filter(keepBucket) : env.summary.buckets,
        },
      } as any);
    }
  }

  return mergeUsage(validEnvironments, USAGE_CONTRACT_VERSION);
}

export function useUsage(
  input: UsageSummaryInput,
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null = null,
  hiddenProviders: ReadonlySet<UsageProviderKind> = new Set(),
): UsageView {
  const [history, setHistory] = useState<DashboardHistory | null>(null);
  const [stats, setStats] = useState<TokenMonitorStats | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [hasTokenMonitor, setHasTokenMonitor] = useState<boolean | null>(null);
  const [resolvedPricing, setResolvedPricing] = useState<Record<string, ModelPricingRates | null>>({});
  const [customOverrides, setCustomOverrides] = useState<Map<string, ModelPricingRates>>(new Map());

  const lastKnownRevisionKey = useRef<string>('');
  const lastKnownSettings = useRef<any>(null);

  const pricingMap = useMemo(() => {
    const combined: Record<string, ModelPricingRates | null> = { ...resolvedPricing };
    for (const [model, rates] of customOverrides.entries()) {
      combined[model] = rates;
    }
    return combined;
  }, [resolvedPricing, customOverrides]);

  const updatePricingForHistory = useCallback((hist: DashboardHistory | null) => {
    const distinct = extractDistinctModels(hist);
    if (distinct.length === 0) return;

    distinct.forEach((model) => {
      lookupModelPricingMemoized(model).then((rates) => {
        setResolvedPricing((prev) => {
          if (prev[model] === rates) return prev;
          return { ...prev, [model]: rates };
        });
      });
    });

    Promise.all(distinct.map((m) => lookupModelPricingMemoized(m))).then(() => {
      setResolvedPricing((prev) => {
        const nextMap: Record<string, ModelPricingRates | null> = {};
        let changed = false;
        for (const [k, v] of sessionResolvedRates.entries()) {
          if (prev[k] !== v) {
            nextMap[k] = v;
            changed = true;
          }
        }
        for (const m of distinct) {
          if (!(m in prev)) {
            changed = true;
            break;
          }
        }
        return changed ? { ...prev, ...nextMap } : prev;
      });
    });
  }, []);

  const fetchRealData = useCallback(async (force?: boolean) => {
    if (typeof window === "undefined" || !window.tokenMonitor) {
      setHasTokenMonitor(false);
      return;
    }

    const tm = window.tokenMonitor;
    setHasTokenMonitor(true);
    try {
      if (force) {
        invalidateDayBucketsCache();
      }
      const statsOptions = force
        ? { force: true, feedback: true, forceHistory: true, forceSelfSync: true }
        : undefined;
      const [histData, statsData, allTimeSessions, settingsData] = await Promise.all([
        tm.getDashboardHistory({ days: 90, includeDevices: true })
          .catch(() => (tm.getDashboardHistory as any)(90))
          .catch(() => tm.getDashboardHistory())
          .catch(() => null),
        tm.getStats(statsOptions).catch(() => null),
        typeof tm.getAllTimeSessions === "function"
          ? tm.getAllTimeSessions().catch(() => null)
          : Promise.resolve(null),
        typeof tm.getSettings === "function"
          ? tm.getSettings().catch(() => null)
          : Promise.resolve(null),
      ]);
      if (histData && Array.isArray(histData.daily) && histData.daily.length > 0) {
        setHistory(force ? { ...histData, daily: [...histData.daily] } : histData);
        updatePricingForHistory(histData);
      }
      if (statsData) {
        const actual = (statsData as any)?.data?.stats || (statsData as any)?.stats || statsData;
        const sessions = allTimeSessions && typeof allTimeSessions === "object"
          ? (allTimeSessions.sessions && typeof allTimeSessions.sessions === "object"
            ? allTimeSessions.sessions
            : allTimeSessions)
          : null;
        const nextStats = sessions
          ? { ...actual, periods: { ...actual.periods, allTime: { ...actual.periods?.allTime, sessions } } }
          : (force ? { ...actual } : actual);
        lastKnownRevisionKey.current = deriveStatsRevisionKey(nextStats);
        setStats(nextStats);
        syncStatsToPresentation(nextStats);
      }

      if (settingsData) {
        lastKnownSettings.current = settingsData;
        // Check for user-defined customModelPricing from settings
        const customPricing = settingsData?.customModelPricing;
        setCustomOverrides(parseCustomPricing(customPricing));
      }
    } catch {
      // Keep previous data
    }
  }, [updatePricingForHistory]);

  useEffect(() => {
    updatePricingForHistory(history);
  }, [history, updatePricingForHistory]);

  useEffect(() => {
    fetchRealData();

    if (typeof window !== "undefined" && window.tokenMonitor) {
      const tm = window.tokenMonitor;
      const unsubs: Array<() => void> = [];

      if (typeof tm.onDashboardHistoryChanged === "function") {
        const u = tm.onDashboardHistoryChanged(() => {
          fetchRealData();
        });
        if (typeof u === "function") unsubs.push(u);
      }

      if (typeof tm.onStatsPush === "function") {
        const u = tm.onStatsPush((nextStats: any) => {
          if (!nextStats) return;
          if (nextStats.event === 'session-activity' || nextStats.event === 'status') {
            return;
          }
          const actualStats = (nextStats as any)?.data?.stats || (nextStats as any)?.stats || (nextStats?.periods ? nextStats : null);
          if (!actualStats) return;

          const key = deriveStatsRevisionKey(actualStats);
          if (key && key === lastKnownRevisionKey.current) {
            return;
          }
          lastKnownRevisionKey.current = key;

          setStats((previous) => {
            const allTimeSessions =
              previous?.periods?.allTime?.sessions && !actualStats?.periods?.allTime?.sessions
                ? previous.periods.allTime.sessions
                : actualStats?.periods?.allTime?.sessions;
            const mergedPeriods = actualStats?.periods
              ? (allTimeSessions
                  ? { ...actualStats.periods, allTime: { ...actualStats.periods.allTime, sessions: allTimeSessions } }
                  : actualStats.periods)
              : previous?.periods;
            const merged = {
              ...previous,
              ...actualStats,
              periods: mergedPeriods,
            };
            syncStatsToPresentation(merged);
            return merged;
          });
        });
        if (typeof u === "function") unsubs.push(u);
      }

      if (typeof tm.onSettingsPush === "function") {
        const u = tm.onSettingsPush((newSettings: any) => {
          syncSettingsToPricing(newSettings);
          if (newSettings?.customModelPricing) {
            setCustomOverrides(parseCustomPricing(newSettings.customModelPricing));
          }
          const prev = lastKnownSettings.current;
          lastKnownSettings.current = newSettings;
          if (isUsageAffectingSettingsChange(prev, newSettings)) {
            fetchRealData();
          }
        });
        if (typeof u === "function") unsubs.push(u);
      }

      return () => {
        for (const u of unsubs) {
          try {
            u();
          } catch {}
        }
      };
    }
  }, [fetchRealData]);

  const environmentsList: readonly EnvironmentUsageStatus[] = useMemo(() => {
    if (hasTokenMonitor === false) {
      return [
        {
          environmentId: PRIMARY_ENV_ID,
          label: "Token Monitor",
          isPending: false,
          canReadDiagnostics: false,
          isConnected: false,
          error: "Token Monitor desktop backend is unavailable. Please run within Token Monitor.",
          summary: null,
          needsCursorKeychainAccess: false,
        },
      ];
    }

    const summary = buildUsageSummaryFromData(history, stats, input, new Date(), pricingMap);
    return [
      {
        environmentId: PRIMARY_ENV_ID,
        label: "Token Monitor Workstation",
        isPending,
        canReadDiagnostics: true,
        isConnected: true,
        error: null,
        summary,
        needsCursorKeychainAccess: false,
      },
    ];
  }, [hasTokenMonitor, history, stats, input, isPending, pricingMap]);

  const keepBucket = useCallback(
    (bucket: UsageBucket) => {
      if (input.resolution === "hour") {
        if (!bucket.hourStart || !input.sinceTime || !input.untilTime) return true;
        return bucket.hourStart >= input.sinceTime && bucket.hourStart <= input.untilTime;
      }
      return true;
    },
    [input.resolution, input.sinceTime, input.untilTime],
  );

  const selection = useMemo(
    () =>
      deriveSelection(
        environmentsList,
        selectedEnvironmentIds,
        hiddenProviders,
        keepBucket,
      ),
    [environmentsList, selectedEnvironmentIds, hiddenProviders, keepBucket],
  );

  const refresh = useCallback((_refreshInput?: UsageSummaryInput) => {
    setIsPending(true);
    return fetchRealData(true).finally(() => setIsPending(false));
  }, [fetchRealData]);

  const answeredCount = selection.selectedEnvironments.filter(
    (e) => e.summary !== null,
  ).length;
  const shown = answeredCount > 0 ? { window: input, merged: selection.merged } : null;

  const primarySummary = environmentsList[0]?.summary as any;
  const mergedActiveCount = selection.merged.daily.filter((d) => d.totalTokens > 0 || d.costUsd > 0).length;
  const isAllTime = resolveWindowKey(input) === "all";
  const activeDays = (isAllTime && hiddenProviders.size === 0 && typeof primarySummary?.activeDays === "number")
    ? Math.max(primarySummary.activeDays, mergedActiveCount)
    : (hiddenProviders.size === 0 && typeof primarySummary?.activeDays === "number")
      ? primarySummary.activeDays
      : mergedActiveCount;
  const peakDayTokens = selection.merged.daily.reduce((max, d) => Math.max(max, d.totalTokens), 0);
  const hasWindowSessions = primarySummary?.hasWindowSessions ?? false;
  const windowSessions = primarySummary?.windowSessions;

  return {
    environments: selection.environments,
    selectedEnvironments: selection.selectedEnvironments,
    merged: selection.merged,
    isPending,
    shown,
    isPartial: false,
    refresh,
    stats,
    activeDays,
    peakDayTokens,
    hasWindowSessions,
    windowSessions,
  };
}
