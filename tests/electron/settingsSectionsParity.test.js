'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * All settings keys written by origin/main's renderer settings panel
 * (extracted from origin/main:src/electron/renderer/index.html & app.js).
 */
const OG_RENDERER_SETTINGS_KEYS = [
  'language',
  'startAtLogin',
  'automaticAppUpdates',
  'discordRpcEnabled',
  'currency',
  'currencyRates',
  'periodMonthMode',
  'modelRankingMetric',
  'heatmapMetric',
  'homeActiveDaysWindow',
  'sessionTitlesEnabled',
  'projectsEnabled',
  'sessionContextMetric',
  'tokenRateMode',
  'codexDotsEnabled',
  'codexDotsVisible',
  'serviceStatusRefreshMs',
  'homeLimitDisplayMode',
  'showHomeLimitBars',
  'showHomeLimitProviderNames',
  'homeLimitAccountCount',
  'homeModuleOrder',
  'hiddenHomeModules',
  'homeLimitProviderOrder',
  'hiddenHomeLimitProviders',
  'hiddenViews',
  'viewDisplayOrder',
  'hiddenServiceProviders',
  'serviceProviderDisplayOrder',
  'limitsEnabled',
  'limitsRefreshMode',
  'limitsRefreshMs',
  'limitProviders',
  'copilotApiToken',
  'systemGlass',
  'windowsBackdrop',
  'macBackdrop',
  'macGlassTint',
  'macClearGlassTint',
  'glassOpacity',
  'glassBlur',
  'zoomFactor',
  'backgroundImageOpacity',
  'textSize',
  'interfaceFontFamily',
  'displayFontFamily',
  'tokenNumberAnimation',
  'reduceMotion',
  'showLiveDot',
  'showToolIcons',
  'titleIconOnly',
  'showCompactTotalTokens',
  'showLiveTokenRate',
  'liveTokenRateScope',
  'compactTokenUnits',
  'settingsInTitlebar',
  'themeColors',
  'vendorColors',
  'windowBehavior',
  'keepAboveTaskbar',
  'windowToggleShortcut',
  'edgeDockEnabled',
  'edgeDockMode',
  'edgeDockSide',
  'edgeDockSize',
  'edgeDockCustomScale',
  'edgeDockWindowsBackdrop',
  'edgeDockMacBackdrop',
  'edgeDockWarnColors',
  'edgeDockRunningIndicatorEnabled',
  'edgeDockHaptic',
  'edgeDockItems',
  'notchEnabled',
  'notchHoverAction',
  'notchHoverDelay',
  'notchShape',
  'notchSize',
  'notchCustomScale',
  'notchStyle',
  'notchProgressiveBlur',
  'notchSummaryEnabled',
  'notchHideSummaryInFullScreen',
  'notchRunningIndicatorEnabled',
  'notchWarnColors',
  'notchHaptic',
  'notchSwipeGestures',
  'notchSummaryMode',
  'notchItems',
  'notchCustomLayout',
  'floatingBubbleEnabled',
  'floatingBubbleTrigger',
  'floatingBubbleContent',
  'floatingBubbleCustomLayout',
  'showTrayIcon',
  'trayMode',
  'hideAppIcon',
  'trayContent',
  'trayCustomLayout',
  'showTrayProviderBadge',
  'collectionMode',
  'collectionIntervalMs',
  'wslScanEnabled',
  'sessionUsageArchiveEnabled',
  'historyEnabled',
  'historyIntervalMs',
  'clients',
  'pinnedClients',
  'hiddenClients',
  'clientDisplayOrder',
  'exportAutoEnabled',
  'exportIntervalMs',
  'exportDir',
  'modelAliasGrouping',
  'modelAliases',
  'customModelPricing',
  'subscriptions',
  'subscriptionsOrphaned',
  'hubMode',
  'deviceId',
  'hubUrl',
  'hubHostPort',
  'hubHostSecret',
  'syncUploadIntervalMs',
  'hubSyncSessionTitles',
  'showLimitSource',
  'maskLimitAccountEmails',
  'showLimitUsed',
  'limitProviderOrder',
  'limitProviderHiddenItems'
];

test('settings sections parity: all origin/main renderer settings keys are present in React settings', () => {
  const settingsDir = path.join(__dirname, '..', '..', 't3_app_ui', 'src', 'settings');
  const files = fs.readdirSync(settingsDir).filter(f => f.endsWith('.tsx'));

  const fileContents = files.map(file => ({
    file,
    content: fs.readFileSync(path.join(settingsDir, file), 'utf8')
  }));

  const missingKeys = [];

  for (const key of OG_RENDERER_SETTINGS_KEYS) {
    const found = fileContents.some(f => f.content.includes(key));
    if (!found) {
      missingKeys.push(key);
    }
  }

  assert.deepEqual(
    missingKeys,
    [],
    `The following ${missingKeys.length} settings keys from origin/main are missing from t3_app_ui/src/settings/*.tsx: ${missingKeys.join(', ')}`
  );

  assert.equal(OG_RENDERER_SETTINGS_KEYS.length, 129);
});
