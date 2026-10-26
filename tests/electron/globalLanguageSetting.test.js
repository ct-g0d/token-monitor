'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  resolveLocale,
  resolveRegionalLocale,
  translate,
  applyTranslations
} = require('../../src/electron/renderer/i18n');
const clientBridgeApi = require('../../src/electron/renderer/bridge/clientBridge');

test('language setting: normalizeLanguage preserves supported language codes and maps variants', () => {
  assert.ok(Array.isArray(LANGUAGE_OPTIONS) && LANGUAGE_OPTIONS.length >= 7);
  assert.equal(resolveRegionalLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveRegionalLocale('zh-TW'), 'zh-TW');

  // Direct supported values
  assert.equal(normalizeLanguage('auto'), 'auto');
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('zh-TW'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-CN'), 'zh-CN');
  assert.equal(normalizeLanguage('ko'), 'ko');
  assert.equal(normalizeLanguage('ja'), 'ja');
  assert.equal(normalizeLanguage('pt-BR'), 'pt-BR');

  // Case-insensitive & regional variant normalization
  assert.equal(normalizeLanguage('zh-tw'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-cn'), 'zh-CN');
  assert.equal(normalizeLanguage('zh_cn'), 'zh-CN');
  assert.equal(normalizeLanguage('zh'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-Hant'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-Hant-HK'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-Hans'), 'zh-CN');
  assert.equal(normalizeLanguage('zh-Hans-CN'), 'zh-CN');
  assert.equal(normalizeLanguage('ja-JP'), 'ja');
  assert.equal(normalizeLanguage('ko-KR'), 'ko');
  assert.equal(normalizeLanguage('pt'), 'pt-BR');
  assert.equal(normalizeLanguage('pt-PT'), 'pt-BR');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('en-GB'), 'en');

  // Unsupported or empty values fall back to auto
  assert.equal(normalizeLanguage('de'), 'auto');
  assert.equal(normalizeLanguage('fr'), 'auto');
  assert.equal(normalizeLanguage(''), 'auto');
  assert.equal(normalizeLanguage(null), 'auto');
  assert.equal(normalizeLanguage(undefined), 'auto');
});

test('language setting: resolveLocale resolves auto to appropriate system language or falls back to en', () => {
  assert.equal(resolveLocale('auto', ['zh-CN', 'en-US']), 'zh-CN');
  assert.equal(resolveLocale('auto', ['zh-TW', 'en-US']), 'zh-TW');
  assert.equal(resolveLocale('auto', ['ja-JP', 'en-US']), 'ja');
  assert.equal(resolveLocale('auto', ['ko-KR', 'en-US']), 'ko');
  assert.equal(resolveLocale('auto', ['pt-BR', 'en-US']), 'pt-BR');
  assert.equal(resolveLocale('auto', ['en-US']), 'en');
  assert.equal(resolveLocale('auto', ['fr-FR', 'de-DE']), 'en');

  // Explicit non-auto choices override system preferences
  assert.equal(resolveLocale('zh-CN', ['en-US']), 'zh-CN');
  assert.equal(resolveLocale('ja', ['zh-CN']), 'ja');
  assert.equal(resolveLocale('pt-BR', ['en-US']), 'pt-BR');

  // Direct translation check
  assert.equal(translate('zh-CN', 'settings.language.title'), '语言');
  assert.equal(translate('en', 'settings.language.title'), 'Language');
  assert.equal(translate('ja', 'settings.language.title'), '言語');
});

test('language setting: applyTranslations updates element text and document lang/locale attributes', () => {
  const elements = [
    { dataset: { i18n: 'settings.sections.general' }, textContent: '' },
    { dataset: { i18n: 'settings.language.title' }, textContent: '' },
    { dataset: { i18n: 'views.limits' }, textContent: '' }
  ];
  const docEl = {
    lang: '',
    attributes: {},
    setAttribute(key, value) {
      this.attributes[key] = value;
      if (key === 'lang') this.lang = value;
    },
    getAttribute(key) {
      return this.attributes[key];
    }
  };
  const fakeDoc = {
    documentElement: docEl,
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return elements;
      return [];
    }
  };

  applyTranslations(fakeDoc, 'zh-CN');
  assert.equal(docEl.getAttribute('lang'), 'zh-CN');
  assert.equal(elements[0].textContent, '常规');
  assert.equal(elements[1].textContent, '语言');
  assert.equal(elements[2].textContent, '额度');

  applyTranslations(fakeDoc, 'ja');
  assert.equal(docEl.getAttribute('lang'), 'ja');
  assert.equal(elements[0].textContent, '一般');
  assert.equal(elements[1].textContent, '言語');
  assert.equal(elements[2].textContent, '制限');

  applyTranslations(fakeDoc, 'en');
  assert.equal(docEl.getAttribute('lang'), 'en');
  assert.equal(elements[0].textContent, 'General');
  assert.equal(elements[1].textContent, 'Language');
  assert.equal(elements[2].textContent, 'Limits');
});

test('language setting: clientBridge exposes TokenMonitorI18n for global accessibility', () => {
  const bridge = clientBridgeApi.clientBridge;
  assert.ok(bridge, 'clientBridge should be defined');
  const root = globalThis;
  assert.ok(root.TokenMonitorI18n, 'root.TokenMonitorI18n should be exposed');
  assert.equal(typeof root.TokenMonitorI18n.translate, 'function');
  assert.equal(typeof root.TokenMonitorI18n.resolveLocale, 'function');
  assert.equal(typeof root.TokenMonitorI18n.applyTranslations, 'function');
  assert.ok(Array.isArray(root.TokenMonitorI18n.LANGUAGE_OPTIONS));
});
