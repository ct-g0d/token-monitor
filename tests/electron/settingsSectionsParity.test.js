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

/**
 * Select options backed by normalizers in src/. A key can be present and still
 * be useless when the value it writes is normalized away, so matching keys is
 * not enough: each select must offer exactly the values the backend keeps.
 */
const SELECT_OPTION_PARITY = {
  windowsBackdrop: ['acrylic', 'accent'],
  macBackdrop: ['vibrancy', 'liquid-glass'],
  edgeDockMacBackdrop: ['inherit', 'vibrancy', 'liquid-glass'],
  // Collection mode writes 'interval' plus one of COLLECTION_INTERVAL_OPTIONS.
  collectionMode: ['live', 'smart', '300000', '900000', '1800000'],
  historyIntervalMs: ['300000', '600000', '900000', '1800000', '3600000'],
  serviceStatusRefreshMs: ['0', '60000', '120000', '300000', '900000', '1800000'],
  homeLimitDisplayMode: ['text', 'bars'],
  limitsRefreshMode: ['adaptive', '60000', '120000', '300000', '900000', '1800000']
};

test('settings sections parity: restored selects only offer backend-supported values', () => {
  const settingsDir = path.join(__dirname, '..', '..', 't3_app_ui', 'src', 'settings');
  const files = fs.readdirSync(settingsDir).filter(f => f.endsWith('.tsx'));

  const mismatches = [];
  const seen = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(settingsDir, file), 'utf8');
    const blocks = content.match(/<select[\s\S]*?<\/select>/g) || [];

    for (const block of blocks) {
      const keyMatch = block.match(/updateSettings\(\{\s*([A-Za-z0-9_]+)/);
      if (!keyMatch) continue;
      const key = keyMatch[1];
      if (!(key in SELECT_OPTION_PARITY)) continue;

      seen.add(key);
      const values = [...block.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
      const expected = SELECT_OPTION_PARITY[key];
      if (JSON.stringify(values) !== JSON.stringify(expected)) {
        mismatches.push({ file, key, values, expected });
      }
    }
  }

  assert.deepEqual(
    [...seen].sort(),
    Object.keys(SELECT_OPTION_PARITY).sort(),
    'Not every backend-backed select was found in the React settings UI.'
  );
  assert.deepEqual(
    mismatches,
    [],
    `Selects offer values the backend normalizes away: ${JSON.stringify(mismatches)}`
  );
});
