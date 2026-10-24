// Pure key and identity helpers for UI render push performance

export function deriveStatsRevisionKey(stats: any): string {
  if (!stats) return 'none';
  const updatedAt = stats.updatedAt;
  const historyRev = stats.historyRevision;
  if (updatedAt !== undefined && historyRev !== undefined && updatedAt !== null && historyRev !== null) {
    return `${updatedAt}:${historyRev}`;
  }
  const todayTokens = stats.periods?.today?.totalTokens ?? 0;
  const monthTokens = stats.periods?.month?.totalTokens ?? 0;
  const allTimeTokens = stats.periods?.allTime?.totalTokens ?? 0;
  const rev = historyRev ?? 'none';
  return `${todayTokens}:${monthTokens}:${allTimeTokens}:${rev}`;
}

export const USAGE_AFFECTING_KEYS = [
  'customModelPricing',
  'customPricing',
  'modelAliases',
  'pricingModel',
  'currency',
  'trackedClients',
  'enabledClients',
  'clientConfigs',
  'hiddenProviders',
  'maskLimitAccountEmails',
] as const;

export function isUsageAffectingSettingsChange(prev: any, next: any): boolean {
  if (!prev || !next) return true;
  for (const key of USAGE_AFFECTING_KEYS) {
    const prevVal = JSON.stringify(prev[key]);
    const nextVal = JSON.stringify(next[key]);
    if (prevVal !== nextVal) {
      return true;
    }
  }
  return false;
}

export function cheapStableHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getLimitsKey(limits: any, maskEmails: boolean = false): string {
  if (!limits) return `none:${maskEmails}`;
  const rev = limits.updatedAt ?? limits.revision ?? limits.historyRevision;
  if (rev !== undefined && rev !== null && rev !== '') {
    return `${maskEmails ? 'm' : 'u'}:${rev}`;
  }
  try {
    return `${maskEmails ? 'm' : 'u'}:${cheapStableHash(JSON.stringify(limits))}`;
  } catch {
    return `${maskEmails ? 'm' : 'u'}:fallback`;
  }
}

export function createProviderIdentityCache<T>() {
  let lastKey: string | null = null;
  let lastResult: T | null = null;

  return {
    getOrCompute(key: string, compute: () => T): { result: T; reused: boolean } {
      if (lastKey === key && lastResult !== null) {
        return { result: lastResult, reused: true };
      }
      lastKey = key;
      lastResult = compute();
      return { result: lastResult, reused: false };
    },
    clear() {
      lastKey = null;
      lastResult = null;
    },
    currentKey() {
      return lastKey;
    },
    currentResult() {
      return lastResult;
    }
  };
}
