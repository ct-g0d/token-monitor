'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SETTING_CURRENCY_CODES,
  normalizeSettingCurrency
} = require('../../src/shared/currency');

test('SETTING_CURRENCY_CODES restricts selectable currency options to USD and CNY only', () => {
  assert.deepEqual(SETTING_CURRENCY_CODES, ['USD', 'CNY']);
});

test('normalizeSettingCurrency permits only USD and CNY and migrates other currencies to USD', () => {
  // Direct matching
  assert.equal(normalizeSettingCurrency('USD'), 'USD');
  assert.equal(normalizeSettingCurrency('CNY'), 'CNY');
  assert.equal(normalizeSettingCurrency('cny'), 'CNY');
  assert.equal(normalizeSettingCurrency('usd'), 'USD');

  // Stored migration for previously supported options
  assert.equal(normalizeSettingCurrency('TWD'), 'USD');
  assert.equal(normalizeSettingCurrency('HKD'), 'USD');
  assert.equal(normalizeSettingCurrency('EUR'), 'USD');
  assert.equal(normalizeSettingCurrency('JPY'), 'USD');
  assert.equal(normalizeSettingCurrency('GBP'), 'USD');

  // Empty / null / undefined default handling
  assert.equal(normalizeSettingCurrency(null), 'USD');
  assert.equal(normalizeSettingCurrency(undefined), 'USD');
  assert.equal(normalizeSettingCurrency(''), 'USD');
});

test('normalizeSettingCurrency respects valid fallback or falls back to USD', () => {
  assert.equal(normalizeSettingCurrency('INVALID', 'CNY'), 'CNY');
  assert.equal(normalizeSettingCurrency('INVALID', 'USD'), 'USD');
  assert.equal(normalizeSettingCurrency('INVALID', 'TWD'), 'USD');
  assert.equal(normalizeSettingCurrency('INVALID', 'EUR'), 'USD');
});
