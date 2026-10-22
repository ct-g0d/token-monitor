export interface DashboardHistoryDay {
  date: string; // YYYY-MM-DD
  tokens: number;
  cost: number;
  messages: number;
  activeTimeMs?: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  unclassifiedTokens: number;
  unpricedTokens?: number;
  tokenComponentsAvailable?: boolean;
  perClient?: Record<string, {
    tokens: number;
    cost: number;
    messages: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    unclassifiedTokens: number;
    unpricedTokens?: number;
  }>;
  perModel?: Record<string, {
    tokens: number;
    cost: number;
    messages: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    unclassifiedTokens: number;
    unpricedTokens?: number;
  }>;
  clientModels?: Record<string, Record<string, number>>;
}

export interface DashboardHistoryMonthly {
  month: string; // YYYY-MM
  tokens: number;
  cost: number;
  messages: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  unclassifiedTokens: number;
  unpricedTokens?: number;
}

export interface DashboardHistorySummary {
  totalTokens: number;
  totalCost: number;
  activeDays: number;
  peakDayTokens: number;
  favoriteModel: string;
  messages: number;
  unpricedTokens?: number;
}

export interface DashboardHistory {
  daily: DashboardHistoryDay[];
  monthly?: DashboardHistoryMonthly[];
  summary?: DashboardHistorySummary;
}

export interface LimitWindow {
  id?: string;
  label?: string;
  usedPercent?: number;
  remainingPercent?: number;
  resetsAt?: string;
  windowDurationMins?: number;
  source?: string;
}

export interface LimitProvider {
  provider: string;
  label?: string;
  status?: string;
  plan?: string;
  windows?: LimitWindow[];
  balance?: number | null;
  balanceUsd?: number | null;
  source?: string;
  stale?: boolean;
}

export interface TokenMonitorLimits {
  updatedAt?: string;
  providers?: LimitProvider[];
}

export interface TokenMonitorStats {
  periods?: {
    today?: any;
    month?: any;
    allTime?: any;
  };
  limits?: TokenMonitorLimits;
  devices?: any[];
  [key: string]: any;
}

export interface CustomPricingEntry {
  modelId: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  cacheWritePerM?: number;
  cacheWrite1hPerM?: number;
}

export interface TokenMonitorSettings {
  customModelPricing?: CustomPricingEntry[];
  currency?: string;
  locale?: string;
  [key: string]: any;
}

export interface TokenMonitorApi {
  getSettings: () => Promise<TokenMonitorSettings>;
  updateSettings: (patch: Partial<TokenMonitorSettings>) => Promise<any>;
  lookupModelPricing: (modelId: string) => Promise<any>;
  getStats: (options?: any) => Promise<TokenMonitorStats>;
  getAllTimeSessions?: (snapshotId?: number) => Promise<any>;
  getDashboardHistory: (options?: any) => Promise<DashboardHistory>;
  onDashboardHistoryChanged?: (callback: () => void) => () => void;
  onStatsPush?: (callback: (payload: any) => void) => () => void;
  onSettingsPush?: (callback: (payload: any) => void) => () => void;
  limits?: {
    saveCredential: (providerId: string, values: any) => Promise<any>;
    listOrganizationChoices: (providerId: string) => Promise<any>;
    clearCredential: (providerId: string) => Promise<any>;
  };
  [key: string]: any;
}

declare global {
  interface Window {
    tokenMonitor?: TokenMonitorApi;
  }
}
