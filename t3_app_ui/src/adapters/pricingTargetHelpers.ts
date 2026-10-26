// Pure helpers for deriving usage price targets and handling incompatible states

export interface UsagePriceTargetResult {
  readonly environmentId: any;
  readonly label: string;
  readonly prices: Record<string, any> | null;
  readonly aliases: Record<string, string> | null;
  readonly unavailable: string | null;
}

export function evaluateSessionAccess(session: any): 'granted' | 'denied' | 'pending' {
  if (!session) return 'denied';
  if (session._tag === 'Failure') return 'denied';
  if (session.waiting === true) return 'pending';
  const sessionData = session._tag === 'Success' ? session.value : session.data ?? (session.authenticated !== undefined ? session : null);
  if (!sessionData) {
    return session.waiting ? 'pending' : 'denied';
  }
  if (!sessionData.authenticated) return 'denied';
  if (Array.isArray(sessionData.permissions) && sessionData.permissions.includes('settings:write')) {
    return 'granted';
  }
  if (Array.isArray(sessionData.scopes) && (sessionData.scopes.includes('settings:write') || sessionData.scopes.includes('orchestration:operate'))) {
    return 'granted';
  }
  return 'denied';
}

export function deriveUsagePriceTarget(
  environmentId: any,
  environment: any,
  settings: any,
  session: any,
): UsagePriceTargetResult {
  const access = evaluateSessionAccess(session);
  const capabilities = environment?.serverConfig?.environment?.capabilities;
  const unavailable =
    environment?.connection?.phase !== 'connected'
      ? 'Offline'
      : settings === null || settings === undefined
        ? 'Prices not loaded'
        : capabilities?.usagePriceOverrides !== true
          ? 'Update server to edit prices'
          : access === 'pending'
            ? 'Checking permissions…'
            : access === 'denied'
              ? 'Read-only access'
              : null;

  return {
    environmentId,
    label: environment?.entry?.target?.label ?? 'Token Monitor Workstation',
    prices: settings?.usagePriceOverrides ?? null,
    aliases:
      capabilities?.usageModelAliases === true
        ? (settings?.usageModelAliases ?? null)
        : null,
    unavailable,
  };
}

export function parseUnitPrice(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function toUsagePriceOverrides(customModelPricing: any[] | undefined): Record<string, any> {
  if (!Array.isArray(customModelPricing)) return {};
  const overrides: Record<string, any> = {};
  for (const item of customModelPricing) {
    if (!item?.modelId) continue;
    const modelId = String(item.modelId).trim();
    if (!modelId) continue;
    overrides[modelId] = {
      ...(item.inputPerM !== undefined ? { inputCostPerMillionTokens: item.inputPerM } : {}),
      ...(item.outputPerM !== undefined ? { outputCostPerMillionTokens: item.outputPerM } : {}),
      ...(item.cacheReadPerM !== undefined ? { cacheReadCostPerMillionTokens: item.cacheReadPerM } : {}),
      ...(item.cacheWritePerM !== undefined ? { cacheWriteCostPerMillionTokens: item.cacheWritePerM } : {}),
    };
  }
  return overrides;
}

export function applyPriceOverridesPatch(
  existingPricing: any[],
  overrides: Record<string, any>
): any[] {
  let list = Array.isArray(existingPricing) ? [...existingPricing] : [];
  for (const [modelId, rates] of Object.entries(overrides)) {
    if (rates === null) {
      list = list.filter((e) => e.modelId !== modelId);
    } else {
      const idx = list.findIndex((e) => e.modelId === modelId);
      const existingEntry = idx >= 0 ? list[idx] : { modelId };
      const newEntry: Record<string, any> = { ...existingEntry, modelId };

      const inputRate = parseUnitPrice(rates.inputCostPerMillionTokens);
      if (inputRate !== undefined) {
        newEntry.inputPerM = inputRate;
      } else if ('inputCostPerMillionTokens' in rates) {
        delete newEntry.inputPerM;
      }

      const outputRate = parseUnitPrice(rates.outputCostPerMillionTokens);
      if (outputRate !== undefined) {
        newEntry.outputPerM = outputRate;
      } else if ('outputCostPerMillionTokens' in rates) {
        delete newEntry.outputPerM;
      }

      const cacheReadRate = parseUnitPrice(rates.cacheReadCostPerMillionTokens);
      if (cacheReadRate !== undefined) {
        newEntry.cacheReadPerM = cacheReadRate;
      } else if ('cacheReadCostPerMillionTokens' in rates) {
        delete newEntry.cacheReadPerM;
      }

      const cacheWriteRate = parseUnitPrice(rates.cacheWriteCostPerMillionTokens);
      if (cacheWriteRate !== undefined) {
        newEntry.cacheWritePerM = cacheWriteRate;
      } else if ('cacheWriteCostPerMillionTokens' in rates) {
        delete newEntry.cacheWritePerM;
      }

      if (idx >= 0) {
        list[idx] = newEntry;
      } else {
        list.push(newEntry);
      }
    }
  }
  return list;
}

export function applyModelAliasesPatch(
  existingAliases: Record<string, string> | undefined,
  aliasOverrides: Record<string, string | null>
): Record<string, string> {
  const result: Record<string, string> = { ...(existingAliases || {}) };
  for (const [model, alias] of Object.entries(aliasOverrides)) {
    if (alias === null || alias === '') {
      delete result[model];
    } else if (typeof alias === 'string') {
      result[model] = alias.trim();
    }
  }
  return result;
}
