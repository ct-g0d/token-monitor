export interface CustomPricingEntry {
  modelId: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  cacheWritePerM?: number;
  cacheWrite1hPerM?: number;
}

export interface SubscriptionRecord {
  id?: string;
  provider: string;
  account?: string;
  planName?: string;
  amount: number;
  currency: string;
  intervalCount?: number;
  interval: 'month' | 'year';
  startDate?: string;
  autoRenew?: boolean;
  nextRenewal?: string;
  kind?: 'subscription' | 'topup';
  topUps?: Array<{ date: string; amount: number }>;
}

export interface LimitAccountForm {
  id: string;
  label: string;
  emptyKey?: string;
  fields: Array<{
    key: string;
    input: 'password' | 'text' | 'textarea' | 'select';
    placeholderKey?: string;
    ariaLabelKey?: string;
    required?: boolean;
    secret?: boolean;
    saveOnChange?: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
  openUrl?: {
    url?: string;
    urls?: Record<string, string>;
    byField?: string;
    byStatus?: string;
    default?: string;
  };
  noteKey?: string;
  steps?: string[];
}

export type LimitAccountForms = LimitAccountForm[];

export interface ManagedAccount {
  id: string;
  label?: string;
  email?: string;
  name?: string;
  enabled?: boolean;
  status?: string;
  isDefault?: boolean;
  avatarUrl?: string;
}

export type HeatmapHoverBehavior = 'detailed' | 'compact' | 'off';

export interface TokenMonitorSettingsState {
  // General
  language?: string;
  startAtLogin?: boolean;
  automaticAppUpdates?: boolean;
  discordRpcEnabled?: boolean;

  // Window & System
  windowBehavior?: 'normal' | 'floating' | 'desktop';
  alwaysOnTop?: boolean;
  keepAboveTaskbar?: boolean;
  windowToggleShortcut?: string;
  windowToggleShortcutStatus?: string | { shortcut?: string; state?: string };

  // Presence - Edge Dock
  edgeDockEnabled?: boolean;
  edgeDockMode?: 'autoHide' | 'always' | 'alwaysExceptFullScreen';
  edgeDockSide?: 'left' | 'right';
  edgeDockSize?: 'small' | 'medium' | 'large' | 'custom';
  edgeDockCustomScale?: number;
  edgeDockMacBackdrop?: 'inherit' | 'vibrancy' | 'liquid-glass';
  edgeDockWarnColors?: boolean;
  edgeDockRunningIndicatorEnabled?: boolean;
  edgeDockHaptic?: boolean;
  edgeDockItems?: any;


  // Presence - Floating Bubble
  floatingBubbleEnabled?: boolean;
  floatingBubbleTrigger?: 'click' | 'hover';
  floatingBubbleContent?: string;
  floatingBubbleCustomLayout?: any;

  // Presence - Tray
  trayMode?: boolean;
  trayContent?: string;
  showTrayProviderBadge?: boolean;
  hideAppIcon?: boolean;
  showTrayIcon?: boolean;
  trayCustomLayout?: any;

  // Appearance
  systemGlass?: boolean;
  windowsBackdrop?: 'acrylic' | 'accent';
  macBackdrop?: 'vibrancy' | 'liquid-glass';
  glassOpacity?: number;
  glassBlur?: number;
  zoomFactor?: number;
  interfaceFontFamily?: string;
  displayFontFamily?: string;
  textSize?: 'standard' | 'larger' | 'largest';
  themeColors?: Record<string, any>;
  vendorColors?: Record<string, string>;
  tokenRateMode?: 'speed' | 'burn';
  reduceMotion?: boolean | 'system' | 'on' | 'off';
  showLiveDot?: boolean;
  showToolIcons?: boolean;
  titleIconOnly?: boolean;
  showCompactTotalTokens?: boolean;
  showLiveTokenRate?: boolean;
  liveTokenRateScope?: 'all' | 'device';
  compactTokenUnits?: 'western' | 'localized';

  // Collection
  clients?: string;
  hiddenClients?: string;
  pinnedClients?: string;
  clientDisplayOrder?: string[] | string;
  collectionMode?: 'live' | 'smart' | 'interval';
  collectionIntervalMs?: number;
  modelAliases?: Record<string, string>;
  modelAliasGrouping?: boolean | 'off' | 'duplicates' | 'prefix';
  customModelPricing?: CustomPricingEntry[];
  wslScanEnabled?: boolean;
  sessionUsageArchiveEnabled?: boolean;
  exportAutoEnabled?: boolean;
  exportDir?: string;
  exportIntervalMs?: number;
  historyEnabled?: boolean;
  historyIntervalMs?: number;

  // Limits
  showLimitSource?: boolean;
  showLimitUsed?: 'remaining' | 'used';
  maskLimitAccountEmails?: boolean;
  limitProviderOrder?: string[] | string;
  limitProviderHiddenItems?: Record<string, any> | string;
  limitsEnabled?: boolean;
  limitsRefreshMode?: 'adaptive' | 'fixed';
  limitsRefreshMs?: number;
  copilotApiToken?: string;
  limitProviders?: string[] | string;

  // Widget Layout & Metrics
  dashboardFlat?: boolean;
  hiddenHomeModules?: string;
  homeModuleOrder?: string;
  homeLimitAccountCount?: number;
  homeLimitDisplayMode?: string;
  homeLimitProviderOrder?: string;
  hiddenHomeLimitProviders?: string;
  showHomeLimitBars?: boolean;
  showHomeLimitProviderNames?: boolean;
  hiddenViews?: string;
  viewDisplayOrder?: string;
  heatmapMetric?: 'cost' | 'tokens';
  heatmapHoverBehavior?: HeatmapHoverBehavior;
  codexDotsEnabled?: boolean;
  codexDotsVisible?: boolean;
  sessionContextMetric?: 'used' | 'remaining';
  homeActiveDaysWindow?: 'all' | 'year';
  periodMonthMode?: 'month' | 'week' | 'last7' | 'last30';
  modelRankingMetric?: 'tokens' | 'cost';
  currency?: string;
  currencyRates?: Record<string, number>;
  currencyRatesEffective?: Record<string, number>;
  currencyRateInfo?: { source?: string; date?: string; fetchedAt?: string } | null;
  sessionTitlesEnabled?: boolean;
  projectsEnabled?: boolean;
  hiddenServiceProviders?: string;
  serviceProviderDisplayOrder?: string;
  serviceStatusRefreshMs?: number;

  // Sync
  hubMode?: 'local' | 'client' | 'host' | 'icloud';
  deviceId?: string;
  hubUrl?: string;
  hubHostPort?: number;
  hubHostSecret?: string;
  syncUploadIntervalMs?: number;
  hubSyncSessionTitles?: boolean;

  // Managed Accounts
  codexManagedAccounts?: ManagedAccount[];
  antigravityManagedAccounts?: ManagedAccount[];
  mimoManagedAccounts?: ManagedAccount[];
  opencodeProfiles?: Record<string, { enabled?: boolean; cookie?: string; apiKey?: string }>;
  openrouterProfiles?: Record<string, { enabled?: boolean; apiKey?: string }>;
  thirdpartyProfiles?: Record<string, any>;

  // Subscriptions
  subscriptions?: SubscriptionRecord[];
  subscriptionsShared?: boolean;
  subscriptionsHub?: string;
  subscriptionsUpdatedAt?: string;
  subscriptionsOrphaned?: SubscriptionRecord[] | { hubUrl: string; records: SubscriptionRecord[] };

  [key: string]: any;
}
