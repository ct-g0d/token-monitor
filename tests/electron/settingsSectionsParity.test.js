'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * Settings keys written by origin/main's renderer settings panel that exist
 * in this branch's src/ (main.js, sanitizer, controllers, shared).
 * Excludes upstream-only keys added after merge-base 478ec910.
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
  'glassOpacity',
  'glassBlur',
  'zoomFactor',
  'backgroundImageOpacity',
  'textSize',
  'interfaceFontFamily',
  'displayFontFamily',
  'reduceMotion',
  'showLiveDot',
  'showToolIcons',
  'titleIconOnly',
  'showCompactTotalTokens',
  'showLiveTokenRate',
  'liveTokenRateScope',
  'compactTokenUnits',
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
  'edgeDockMacBackdrop',
  'edgeDockWarnColors',
  'edgeDockRunningIndicatorEnabled',
  'edgeDockHaptic',
  'edgeDockItems',
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

/**
 * 22 upstream-only keys added to origin/main after merge-base 478ec910.
 * The current backend branch does not yet support them, so settings UI
 * must not include controls that write them.
 */
const UPSTREAM_ONLY_KEYS = [
  'edgeDockWindowsBackdrop',
  'macClearGlassTint',
  'macGlassTint',
  'notchCustomLayout',
  'notchCustomScale',
  'notchEnabled',
  'notchHaptic',
  'notchHideSummaryInFullScreen',
  'notchHoverAction',
  'notchHoverDelay',
  'notchItems',
  'notchProgressiveBlur',
  'notchRunningIndicatorEnabled',
  'notchShape',
  'notchSize',
  'notchStyle',
  'notchSummaryEnabled',
  'notchSummaryMode',
  'notchSwipeGestures',
  'notchWarnColors',
  'settingsInTitlebar',
  'tokenNumberAnimation'
];

test('settings sections parity: all backend-supported settings keys are present in React settings', () => {
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
    `The following ${missingKeys.length} settings keys are missing from t3_app_ui/src/settings/*.tsx: ${missingKeys.join(', ')}`
  );

  assert.equal(OG_RENDERER_SETTINGS_KEYS.length, 107);
});

test('settings sections parity: none of the 22 upstream-only keys appear in React settings', () => {
  const settingsDir = path.join(__dirname, '..', '..', 't3_app_ui', 'src', 'settings');
  const files = fs.readdirSync(settingsDir).filter(f => f.endsWith('.tsx'));

  const fileContents = files.map(file => ({
    file,
    content: fs.readFileSync(path.join(settingsDir, file), 'utf8')
  }));

  const presentKeys = [];

  for (const key of UPSTREAM_ONLY_KEYS) {
    const foundFiles = fileContents.filter(f => f.content.includes(key)).map(f => f.file);
    if (foundFiles.length > 0) {
      presentKeys.push({ key, files: foundFiles });
    }
  }

  assert.deepEqual(
    presentKeys,
    [],
    `The following upstream-only keys unexpectedly appear in settings UI: ${JSON.stringify(presentKeys)}`
  );

  assert.equal(UPSTREAM_ONLY_KEYS.length, 22);
});
