'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CURRENCY_CODES,
  SETTING_CURRENCY_CODES,
  convertUsd,
  formatCurrencyFromUsd,
  normalizeCurrency,
  normalizeSettingCurrency,
  configureRates,
  resolveEffectiveRates
} = require('../../src/shared/currency');

test('currency options keep USD as the default first option', () => {
  assert.deepEqual(CURRENCY_CODES, ['USD', 'TWD', 'HKD', 'CNY']);
  assert.equal(normalizeCurrency(), 'USD');
  assert.equal(normalizeCurrency(''), 'USD');
  assert.equal(normalizeCurrency('twd'), 'TWD');
  assert.equal(normalizeCurrency('jpy'), 'USD');
});

test('settings currency options are strictly restricted to CNY and USD', () => {
  assert.deepEqual(SETTING_CURRENCY_CODES, ['USD', 'CNY']);
  assert.equal(normalizeSettingCurrency('USD'), 'USD');
  assert.equal(normalizeSettingCurrency('usd'), 'USD');
  assert.equal(normalizeSettingCurrency('CNY'), 'CNY');
  assert.equal(normalizeSettingCurrency('cny'), 'CNY');
  assert.equal(normalizeSettingCurrency(''), 'USD');
  assert.equal(normalizeSettingCurrency(null), 'USD');
  assert.equal(normalizeSettingCurrency(undefined), 'USD');
});

test('settings currency migration gracefully coerces legacy or unsupported currencies to USD', () => {
  // Legacy currencies previously selectable in options must migrate to USD without crashing
  assert.equal(normalizeSettingCurrency('TWD'), 'USD');
  assert.equal(normalizeSettingCurrency('HKD'), 'USD');
  assert.equal(normalizeSettingCurrency('EUR'), 'USD');
  assert.equal(normalizeSettingCurrency('GBP'), 'USD');
  assert.equal(normalizeSettingCurrency('JPY'), 'USD');
  // Fallback parameter handling
  assert.equal(normalizeSettingCurrency('invalid', 'CNY'), 'CNY');
  assert.equal(normalizeSettingCurrency('invalid', 'TWD'), 'USD');
});

test('converts USD costs into supported display currencies (built-in defaults)', () => {
  configureRates(null);
  assert.equal(convertUsd(1, 'USD'), 1);
  assert.equal(convertUsd(1, 'TWD'), 31.5);
  assert.equal(convertUsd(1, 'HKD'), 7.8);
  assert.equal(convertUsd(1, 'CNY'), 6.8);
});

test('formats converted costs with unambiguous symbols (built-in defaults)', () => {
  configureRates(null);
  assert.equal(formatCurrencyFromUsd(1, 'USD'), '$1.0000');
  assert.equal(formatCurrencyFromUsd(1, 'TWD'), 'NT$31.50');
  assert.equal(formatCurrencyFromUsd(1, 'HKD'), 'HK$7.80');
  assert.equal(formatCurrencyFromUsd(1, 'CNY'), '¥6.80');
});

test('configureRates overlays active rates and null resets to defaults', () => {
  configureRates({ CNY: 7.25, TWD: 0, HKD: -1, JPY: 150 });
  assert.equal(convertUsd(1, 'CNY'), 7.25);   // valid override applied
  assert.equal(convertUsd(1, 'TWD'), 31.5);   // zero ignored -> default floor
  assert.equal(convertUsd(1, 'HKD'), 7.8);    // negative ignored -> default floor
  configureRates(null);
  assert.equal(convertUsd(1, 'CNY'), 6.8);    // reset to default
});

test('resolveEffectiveRates applies override > fetched > builtIn', () => {
  const eff = resolveEffectiveRates({ CNY: 6.9, TWD: 31.2 }, { CNY: 7.25 });
  assert.equal(eff.CNY, 7.25);  // override wins
  assert.equal(eff.TWD, 31.2);  // fetched used
  assert.equal(eff.HKD, 7.8);   // neither -> builtIn floor
  assert.equal(eff.USD, 1);
});

test('resolveEffectiveRates ignores non-positive / non-finite inputs', () => {
  const eff = resolveEffectiveRates({ CNY: 0 }, { CNY: NaN, TWD: -3 });
  assert.equal(eff.CNY, 6.8);   // 0 fetched + NaN override -> floor
  assert.equal(eff.TWD, 31.5);  // negative override -> floor
});
