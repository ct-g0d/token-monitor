'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeShowLimitUsed,
  normalizeThemeSetting
} = require('../../src/electron/trayModeSettings');

const {
  resolveRegionalLocale
} = require('../../src/electron/renderer/i18n');

const {
  resolveEffectiveRates,
  normalizeCurrencyOverrides
} = require('../../src/shared/currency');

test('normalizeShowLimitUsed correctly normalizes string quota modes to boolean', () => {
  // String quota choices from UI select
  assert.equal(normalizeShowLimitUsed('used'), true);
  assert.equal(normalizeShowLimitUsed('remaining'), false);
  assert.equal(normalizeShowLimitUsed('USED'), true);
  assert.equal(normalizeShowLimitUsed('REMAINING'), false);

  // Boolean passthrough
  assert.equal(normalizeShowLimitUsed(true), true);
  assert.equal(normalizeShowLimitUsed(false), false);

  // Standard boolean-like strings
  assert.equal(normalizeShowLimitUsed('1'), true);
  assert.equal(normalizeShowLimitUsed('true'), true);
  assert.equal(normalizeShowLimitUsed('yes'), true);
  assert.equal(normalizeShowLimitUsed('on'), true);

  assert.equal(normalizeShowLimitUsed('0'), false);
  assert.equal(normalizeShowLimitUsed('false'), false);
  assert.equal(normalizeShowLimitUsed('no'), false);
  assert.equal(normalizeShowLimitUsed('off'), false);

  // Fallbacks
  assert.equal(normalizeShowLimitUsed(undefined, false), false);
  assert.equal(normalizeShowLimitUsed(null, true), true);
  assert.equal(normalizeShowLimitUsed('', false), false);
  assert.equal(normalizeShowLimitUsed('unknown', false), false);
  assert.equal(normalizeShowLimitUsed('unknown', true), true);
});

test('normalizeThemeSetting permits valid themes and applies default fallback', () => {
  assert.equal(normalizeThemeSetting('system'), 'system');
  assert.equal(normalizeThemeSetting('dark'), 'dark');
  assert.equal(normalizeThemeSetting('light'), 'light');

  // Invalid or unspecified
  assert.equal(normalizeThemeSetting('invalid'), 'system');
  assert.equal(normalizeThemeSetting('auto', 'system'), 'system');
  assert.equal(normalizeThemeSetting(null, 'system'), 'system');
  assert.equal(normalizeThemeSetting(undefined, 'system'), 'system');
});

test('resolveRegionalLocale preserves regional tags for calendar and number formatting', () => {
  // Regional locale preserves country region when available
  assert.equal(resolveRegionalLocale(['en-GB', 'en-US']), 'en-GB');
  assert.equal(resolveRegionalLocale(['zh-TW', 'zh']), 'zh-TW');
  assert.equal(resolveRegionalLocale(['de-CH', 'de']), 'de-CH');

  // Falls back to base or first language
  assert.equal(resolveRegionalLocale(['fr']), 'fr');
  assert.equal(resolveRegionalLocale([]), 'en');
});

test('currency rates resolution handles overrides and live rate fallback correctly', () => {
  const liveRates = { USD: 1, CNY: 7.25, TWD: 32.1 };
  const overrides = { CNY: 7.10 };

  // When overrides are present, effective rates prefer the override
  const effective = resolveEffectiveRates(liveRates, overrides);
  assert.equal(effective.CNY, 7.10);
  assert.equal(effective.TWD, 32.1);
  assert.equal(effective.USD, 1);

  // When overrides are cleared, effective rates match live rates
  const cleared = resolveEffectiveRates(liveRates, {});
  assert.equal(cleared.CNY, 7.25);
  assert.equal(cleared.TWD, 32.1);
  assert.equal(cleared.USD, 1);

  // normalizeCurrencyOverrides handles empty and invalid values
  assert.deepEqual(normalizeCurrencyOverrides(null), {});
  assert.deepEqual(normalizeCurrencyOverrides({ CNY: '7.2' }), { CNY: 7.2 });
  assert.deepEqual(normalizeCurrencyOverrides({ CNY: -5, TWD: 32.5 }), { TWD: 32.5 });
});

test('driver filtering matches claude driver variants correctly', () => {
  function matchesHiddenDriver(driver, hiddenDrivers) {
    if (!hiddenDrivers) return false;
    const d = String(driver);
    if (hiddenDrivers.has(d)) return true;
    if (d === 'claudeAgent' && hiddenDrivers.has('claude')) return true;
    if (d === 'claude' && hiddenDrivers.has('claudeAgent')) return true;
    return false;
  }

  const hidden = new Set(['claude']);
  assert.equal(matchesHiddenDriver('claudeAgent', hidden), true);
  assert.equal(matchesHiddenDriver('claude', hidden), true);
  assert.equal(matchesHiddenDriver('codex', hidden), false);

  const hiddenAgent = new Set(['claudeAgent']);
  assert.equal(matchesHiddenDriver('claudeAgent', hiddenAgent), true);
  assert.equal(matchesHiddenDriver('claude', hiddenAgent), true);
  assert.equal(matchesHiddenDriver('codex', hiddenAgent), false);
});
