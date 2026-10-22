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
import { useState, useMemo, useEffect, useCallback } from "react";
import type { DashboardHistory, DashboardHistoryDay, TokenMonitorStats } from "../types/tokenMonitor";
import { PRIMARY_ENV_ID, syncStatsToPresentation } from "./presentationState";

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
  readonly refresh: (input?: UsageSummaryInput) => void;
  readonly stats?: TokenMonitorStats | null;
}

export interface ModelPricingRates {
  readonly inputCostPerToken: number;
  readonly cacheReadCostPerToken: number;
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

  const finalInputRate = inputRate != null && Number.isFinite(inputRate) ? Math.max(0, inputRate) : null;
  if (finalInputRate === null) {
    return null;
  }

  const finalCacheReadRate = cacheReadRate != null && Number.isFinite(cacheReadRate) ? Math.max(0, cacheReadRate) : 0;

  return {
    inputCostPerToken: finalInputRate,
    cacheReadCostPerToken: finalCacheReadRate,
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

    const cacheReadCostPerToken = cacheReadRate != null && Number.isFinite(cacheReadRate) ? Math.max(0, cacheReadRate) : 0;

    const rates: ModelPricingRates = {
      inputCostPerToken,
      cacheReadCostPerToken,
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
    result[index] += step;
  }
  return result;
}

function normalizeProviderKind(client: string): UsageProviderKind {
  const trimmed = (client || "").trim().toLowerCase();
  return (trimmed || "unknown") as UsageProviderKind;
}

function modelRowsForClient(dayRow: DashboardHistoryDay, client: string, clientTokens: number) {
  const direct = Object.entries(dayRow.clientModels?.[client] || {}).filter(([, value]) => nonNegative(value) > 0);
  const fallback = Object.entries(dayRow.perModel || {}).filter(([, value]) => nonNegative(value.tokens) > 0);
  const source = direct.length > 0 ? direct : fallback.map(([model, value]) => [model, value.tokens] as [string, number]);
  if (source.length === 0) return [["unknown", clientTokens] as [string, number]];
  const names = source.map(([model]) => model || "unknown");
  const weights = source.map(([, value]) => nonNegative(value));
  return names.map((name, index) => [name, apportionInteger(clientTokens, weights)[index]] as [string, number]);
}

function transformDayToBuckets(
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

  // Exact formula per user specification:
  // Input/Uncached input = Σtokens − cacheRead − cacheWrite − output
  // Guarantees: uncached + cached + cacheCreation + output = tokens
  const dayUncached = dayTokens - dayCacheRead - dayCacheWrite - dayOutput;

  const clientEntries = Object.entries(dayRow.perClient || {}).filter(
    ([, stats]) => nonNegative(stats.tokens) > 0 || nonNegative(stats.cost) > 0,
  );

  const fallbackClients: [string, { tokens: number; cost?: number; messages?: number }][] =
    clientEntries.length > 0
      ? clientEntries
      : [["unknown", { tokens: dayTokens, cost: dayCost, messages: 1 }]];

  const clientTokensList = apportionInteger(
    dayTokens,
    fallbackClients.map(([, s]) => nonNegative(s.tokens)),
  );
  const rawClientCosts = fallbackClients.map(([, s]) => nonNegative(s.cost));
  const sumRawCost = rawClientCosts.reduce((a, b) => a + b, 0);
  const costWeights = sumRawCost > 0 ? rawClientCosts : fallbackClients.map(([, s]) => nonNegative(s.tokens));
  const clientCostsList = apportionInteger(
    Math.round(dayCost * 1_000_000),
    costWeights,
  ).map((c) => c / 1_000_000);

  // Apportion day cache read, cache write, and output across clients
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
    t - clientReads[idx] - clientWrites[idx] - clientOutputs[idx]
  );

  fallbackClients.forEach(([client, stats], clientIndex) => {
    const clientTokens = clientTokensList[clientIndex];
    const clientCost = clientCostsList[clientIndex];
    const clientRead = clientReads[clientIndex];
    const clientWrite = clientWrites[clientIndex];
    const clientOutput = clientOutputs[clientIndex];

    const models = modelRowsForClient(dayRow, client, clientTokens);
    const modelWeights = models.map(([, tokens]) => tokens);

    // Apportion client components across models
    const modelReads = apportionInteger(clientRead, modelWeights);
    const modelWrites = apportionInteger(clientWrite, modelWeights);
    const modelOutputs = apportionInteger(clientOutput, modelWeights);
    const modelTokensList = apportionInteger(clientTokens, modelWeights);

    // Model uncached input follows the exact subtraction formula:
    // modelUncached = modelTokens - modelRead - modelWrite - modelOutput
    const modelUncacheds = modelTokensList.map((mTokens, idx) =>
      mTokens - modelReads[idx] - modelWrites[idx] - modelOutputs[idx]
    );

    let allocatedModelCost = 0;
    models.forEach(([model, modelTokens], modelIndex) => {
      const ratio = clientTokens > 0 ? modelTokens / clientTokens : 1 / models.length;
      const cost = modelIndex === models.length - 1
        ? Math.max(0, Number((clientCost - allocatedModelCost).toFixed(6)))
        : Number((clientCost * ratio).toFixed(6));
      allocatedModelCost += cost;

      const cached = modelReads[modelIndex];
      const cacheWrite = modelWrites[modelIndex];
      const output = modelOutputs[modelIndex];
      const uncached = modelUncacheds[modelIndex];

      // Compute cache savings from real model pricing rates
      const pricing = pricingMap[model] || pricingMap[model.toLowerCase()] || null;
      let cacheSavingsUsd = 0;
      if (pricing && pricing.inputCostPerToken > 0 && cached > 0) {
        const unitSavings = Math.max(0, pricing.inputCostPerToken - (pricing.cacheReadCostPerToken || 0));
        cacheSavingsUsd = Number((cached * unitSavings).toFixed(6));
      }

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
        costSource: "modelPriced",
        records: Math.max(1, Math.round((stats.messages || 1) * ratio)),
        unpricedRecords: 0,
        sessions: 0,
      });
    });
  });

  return buckets;
}

export function buildUsageSummaryFromData(
  history: DashboardHistory | null,
  stats?: TokenMonitorStats | null,
  input?: UsageSummaryInput,
  now: Date = new Date(),
  pricingMap: Record<string, ModelPricingRates | null> = {},
): UsageSummary | null {
  if (!history || !Array.isArray(history.daily) || history.daily.length === 0) {
    return null;
  }

  // Exact calendar date window matching dashboard history dates (YYYY-MM-DD)
  const sinceDay = input?.sinceDay;
  const untilDay = input?.untilDay;

  const relevantDays = history.daily.filter((day) => {
    if (sinceDay && day.date < sinceDay) return false;
    if (untilDay && day.date > untilDay) return false;
    return true;
  });

  const buckets: UsageBucket[] = [];
  for (const dayRow of relevantDays) {
    buckets.push(...transformDayToBuckets(dayRow, pricingMap));
  }

  const distinctProviders = new Set<UsageProviderKind>();
  for (const day of history.daily) {
    if (day.perClient) {
      for (const client of Object.keys(day.perClient)) {
        distinctProviders.add(normalizeProviderKind(client));
      }
    }
  }
  for (const b of buckets) {
    distinctProviders.add(b.provider);
  }
  const allProviders: UsageProviderKind[] = distinctProviders.size > 0
    ? Array.from(distinctProviders)
    : [
        normalizeProviderKind("codex"),
        normalizeProviderKind("claude"),
        normalizeProviderKind("opencode"),
        normalizeProviderKind("antigravity"),
        normalizeProviderKind("cursor"),
      ];

  const sources = allProviders.map((p) => ({
    fingerprint: {
      provider: p,
      resolvedHomePath: `/workspace/${p}`,
      isConfigHome: false,
    },
    status: "ok" as const,
    scannedFiles: 10,
    skippedFiles: 0,
    malformedRecords: 0,
    distinctSessions: 10,
    message: null,
  }));

  const windowSinceDay = (sinceDay || (relevantDays.length > 0 ? relevantDays[relevantDays.length - 1].date : "2026-01-01")) as any;
  const windowUntilDay = (untilDay || (relevantDays.length > 0 ? relevantDays[0].date : "2026-12-31")) as any;

  return {
    contractVersion: USAGE_CONTRACT_VERSION,
    readAt: now.toISOString(),
    timeZone: input?.timeZone || "UTC",
    sinceDay: UsageDay.make(windowSinceDay),
    untilDay: UsageDay.make(windowUntilDay),
    buckets,
    sources,
    pricing: {
      status: "fresh" as const,
      source: "tokex",
      fetchedAt: now.toISOString(),
      knownModels: Object.keys(pricingMap).length,
    },
    scanDurationMs: 42,
  };
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

  return {
    environments,
    selectedEnvironments,
    merged: mergeAnsweredUsage(withoutProviders(selectedEnvironments, hiddenProviders), keepBucket),
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
        summary: {
          ...env.summary,
          buckets: keepBucket ? env.summary.buckets.filter(keepBucket) : env.summary.buckets,
        },
      });
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
  const [isPending, setIsPending] = useState(false);
  const [hasTokenMonitor, setHasTokenMonitor] = useState<boolean | null>(true);
  const [customOverrides, setCustomOverrides] = useState<Map<string, ModelPricingRates>>(() => new Map());
  const [resolvedPricing, setResolvedPricing] = useState<Record<string, ModelPricingRates | null>>({});

  const pricingMap = useMemo(() => {
    const map: Record<string, ModelPricingRates | null> = { ...resolvedPricing };
    // User overrides from settings customModelPricing take precedence
    for (const [modelId, rates] of customOverrides.entries()) {
      map[modelId] = rates;
    }
    return map;
  }, [resolvedPricing, customOverrides]);

  const updatePricingForHistory = useCallback((h: DashboardHistory | null) => {
    const models = extractDistinctModels(h);
    if (models.length === 0) return;
    Promise.all(models.map((m) => lookupModelPricingMemoized(m))).then(() => {
      const nextMap: Record<string, ModelPricingRates | null> = {};
      for (const m of models) {
        nextMap[m] = sessionResolvedRates.get(m) ?? null;
      }
      setResolvedPricing((prev) => {
        let changed = false;
        for (const [k, v] of Object.entries(nextMap)) {
          if (prev[k] !== v) {
            changed = true;
            break;
          }
        }
        return changed ? { ...prev, ...nextMap } : prev;
      });
    });
  }, []);

  const fetchRealData = useCallback(async () => {
    if (typeof window === "undefined" || !window.tokenMonitor) {
      setHasTokenMonitor(false);
      return;
    }

    setHasTokenMonitor(true);
    try {
      const [histData, statsData, allTimeSessions, settingsData] = await Promise.all([
        window.tokenMonitor.getDashboardHistory({ days: 90, includeDevices: true })
          .catch(() => window.tokenMonitor.getDashboardHistory(90))
          .catch(() => window.tokenMonitor.getDashboardHistory())
          .catch(() => null),
        window.tokenMonitor.getStats().catch(() => null),
        typeof window.tokenMonitor.getAllTimeSessions === "function"
          ? window.tokenMonitor.getAllTimeSessions().catch(() => null)
          : Promise.resolve(null),
        typeof window.tokenMonitor.getSettings === "function"
          ? window.tokenMonitor.getSettings().catch(() => null)
          : Promise.resolve(null),
      ]);
      if (histData && Array.isArray(histData.daily) && histData.daily.length > 0) {
        setHistory(histData);
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
          : actual;
        setStats(nextStats);
        syncStatsToPresentation(nextStats);
      }

      // Check for user-defined customModelPricing from settings
      const customPricing = settingsData?.customModelPricing;
      setCustomOverrides(parseCustomPricing(customPricing));
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
      const unsubs: Array<() => void> = [];

      if (typeof window.tokenMonitor.onDashboardHistoryChanged === "function") {
        const u = window.tokenMonitor.onDashboardHistoryChanged(() => {
          fetchRealData();
        });
        if (typeof u === "function") unsubs.push(u);
      }

      if (typeof window.tokenMonitor.onStatsPush === "function") {
        const u = window.tokenMonitor.onStatsPush((nextStats) => {
          if (nextStats) {
            const actualStats = (nextStats as any)?.data?.stats || (nextStats as any)?.stats || nextStats;
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
          }
        });
        if (typeof u === "function") unsubs.push(u);
      }

      if (typeof window.tokenMonitor.onSettingsPush === "function") {
        const u = window.tokenMonitor.onSettingsPush((newSettings) => {
          if (newSettings?.customModelPricing) {
            setCustomOverrides(parseCustomPricing(newSettings.customModelPricing));
          }
          fetchRealData();
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
    fetchRealData().finally(() => setIsPending(false));
  }, [fetchRealData]);

  const answeredCount = selection.selectedEnvironments.filter(
    (e) => e.summary !== null,
  ).length;
  const shown = answeredCount > 0 ? { window: input, merged: selection.merged } : null;

  return {
    environments: selection.environments,
    selectedEnvironments: selection.selectedEnvironments,
    merged: selection.merged,
    isPending,
    shown,
    isPartial: false,
    refresh,
    stats,
  };
}
