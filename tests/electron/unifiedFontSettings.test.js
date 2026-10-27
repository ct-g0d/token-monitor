'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fontSettings = require('../../src/shared/fontSettings');
const clientBridgeApi = require('../../src/electron/renderer/bridge/clientBridge');

test('unified font settings: resolution preserves backward compatibility and unifies roles', () => {
  // Empty values resolve to canonical app default (monospace)
  const defaults = fontSettings.resolveEffectiveFontSettings({
    interfaceFontFamily: '',
    displayFontFamily: ''
  });
  assert.equal(defaults.interfaceFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(defaults.displayFont, fontSettings.DEFAULT_INTERFACE_FONT);

  // When unified system font is specified across both settings
  const systemUnified = fontSettings.resolveEffectiveFontSettings({
    interfaceFontFamily: fontSettings.SYSTEM_UI_FONT,
    displayFontFamily: fontSettings.SYSTEM_UI_FONT
  });
  assert.equal(systemUnified.interfaceFont, fontSettings.SYSTEM_UI_FONT);
  assert.equal(systemUnified.displayFont, fontSettings.SYSTEM_UI_FONT);

  // When unified monospace font is specified
  const monoUnified = fontSettings.resolveEffectiveFontSettings({
    interfaceFontFamily: fontSettings.DEFAULT_INTERFACE_FONT,
    displayFontFamily: fontSettings.DEFAULT_INTERFACE_FONT
  });
  assert.equal(monoUnified.interfaceFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(monoUnified.displayFont, fontSettings.DEFAULT_INTERFACE_FONT);

  // When only interface font was previously persisted, display font follows it
  const legacyInterfaceOnly = fontSettings.resolveEffectiveFontSettings({
    interfaceFontFamily: 'Inter, sans-serif',
    displayFontFamily: ''
  });
  assert.equal(legacyInterfaceOnly.interfaceFont, 'Inter, sans-serif');
  assert.equal(legacyInterfaceOnly.displayFont, 'Inter, sans-serif');

  // When custom font is specified
  const customUnified = fontSettings.resolveEffectiveFontSettings({
    interfaceFontFamily: 'Fira Code, monospace',
    displayFontFamily: 'Fira Code, monospace'
  });
  assert.equal(customUnified.interfaceFont, 'Fira Code, monospace');
  assert.equal(customUnified.displayFont, 'Fira Code, monospace');
});

test('unified font settings: preset mapping and family resolution contract', () => {
  // Presets mapping for interface role
  assert.equal(fontSettings.presetForFontFamily('', 'interface'), 'app');
  assert.equal(fontSettings.presetForFontFamily(fontSettings.SYSTEM_UI_FONT, 'interface'), 'system');
  assert.equal(fontSettings.presetForFontFamily(fontSettings.DEFAULT_INTERFACE_FONT, 'interface'), 'mono');
  assert.equal(fontSettings.presetForFontFamily('Cascadia Code', 'interface'), 'custom');

  // Font family resolution for presets
  assert.equal(fontSettings.fontFamilyForPreset('app', '', 'interface'), '');
  assert.equal(fontSettings.fontFamilyForPreset('system', '', 'interface'), fontSettings.SYSTEM_UI_FONT);
  assert.equal(fontSettings.fontFamilyForPreset('mono', '', 'interface'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(fontSettings.fontFamilyForPreset('custom', 'Cascadia Code', 'interface'), 'Cascadia Code');
});

test('unified font settings: shared applyFontSettings exercises real DOM application path', () => {
  const properties = new Map();
  const dataset = {};
  let rootFontSize = '';
  let bodyFontFamily = '';

  const fakeDocument = {
    documentElement: {
      style: {
        setProperty(k, v) { properties.set(k, String(v)); },
        removeProperty(k) { properties.delete(k); },
        get fontSize() { return rootFontSize; },
        set fontSize(v) { rootFontSize = v; }
      },
      dataset
    },
    body: {
      style: {
        get fontFamily() { return bodyFontFamily; },
        set fontFamily(v) { bodyFontFamily = v; }
      }
    }
  };

  // 1. App Default: empty settings resolve to canonical default monospace font
  const defaultResult = fontSettings.applyFontSettings(fakeDocument, {
    interfaceFontFamily: '',
    displayFontFamily: '',
    textSize: 'standard'
  });
  assert.equal(defaultResult.interfaceFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(defaultResult.displayFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--ui-font'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--display-font'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--font-sans'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--tm-display'), `${fontSettings.DEFAULT_INTERFACE_FONT}, var(--font-sans)`);
  assert.equal(properties.get('--font-mono'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(fakeDocument.body.style.fontFamily, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--ui-text-scale'), '1');
  assert.equal(dataset.textSize, 'standard');
  assert.equal(fakeDocument.documentElement.style.fontSize, '');

  // 2. System UI: applies across both interface and display variables
  const systemResult = fontSettings.applyFontSettings(fakeDocument, {
    interfaceFontFamily: fontSettings.SYSTEM_UI_FONT,
    displayFontFamily: fontSettings.SYSTEM_UI_FONT,
    textSize: 'standard'
  });
  assert.equal(systemResult.interfaceFont, fontSettings.SYSTEM_UI_FONT);
  assert.equal(systemResult.displayFont, fontSettings.SYSTEM_UI_FONT);
  assert.equal(properties.get('--ui-font'), fontSettings.SYSTEM_UI_FONT);
  assert.equal(properties.get('--display-font'), fontSettings.SYSTEM_UI_FONT);
  assert.equal(properties.get('--font-sans'), fontSettings.SYSTEM_UI_FONT);
  assert.equal(properties.get('--tm-display'), `${fontSettings.SYSTEM_UI_FONT}, var(--font-sans)`);
  assert.equal(properties.has('--font-mono'), false);
  assert.equal(fakeDocument.body.style.fontFamily, fontSettings.SYSTEM_UI_FONT);
  assert.equal(properties.get('--ui-text-scale'), '1');
  assert.equal(dataset.textSize, 'standard');

  // 3. Monospace with larger scale
  const monoResult = fontSettings.applyFontSettings(fakeDocument, {
    interfaceFontFamily: fontSettings.DEFAULT_INTERFACE_FONT,
    displayFontFamily: fontSettings.DEFAULT_INTERFACE_FONT,
    textSize: 'larger'
  });
  assert.equal(monoResult.interfaceFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(monoResult.displayFont, fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--ui-font'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--display-font'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--font-sans'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--font-mono'), fontSettings.DEFAULT_INTERFACE_FONT);
  assert.equal(properties.get('--ui-text-scale'), '1.1');
  assert.equal(dataset.textSize, 'larger');
  assert.equal(fakeDocument.documentElement.style.fontSize, '110%');

  // 4. Custom font with largest scale
  const customResult = fontSettings.applyFontSettings(fakeDocument, {
    interfaceFontFamily: 'Fira Code, monospace',
    displayFontFamily: 'Fira Code, monospace',
    textSize: 'largest'
  });
  assert.equal(customResult.interfaceFont, 'Fira Code, monospace');
  assert.equal(customResult.displayFont, 'Fira Code, monospace');
  assert.equal(properties.get('--ui-font'), 'Fira Code, monospace');
  assert.equal(properties.get('--display-font'), 'Fira Code, monospace');
  assert.equal(properties.get('--font-sans'), 'Fira Code, monospace');
  assert.equal(properties.get('--font-mono'), 'Fira Code, monospace');
  assert.equal(properties.get('--ui-text-scale'), '1.2');
  assert.equal(dataset.textSize, 'largest');
  assert.equal(fakeDocument.documentElement.style.fontSize, '120%');
});

test('unified font settings: preserveInstrumentTypography preserves narrow instrument display font and dashboard interface default', () => {
  const properties = new Map();
  const dataset = {};
  let bodyFontFamily = '';

  const fakeDocument = {
    documentElement: {
      style: {
        setProperty(k, v) { properties.set(k, String(v)); },
        removeProperty(k) { properties.delete(k); }
      },
      dataset
    },
    body: {
      style: {
        get fontFamily() { return bodyFontFamily; },
        set fontFamily(v) { bodyFontFamily = v; }
      }
    }
  };

  const result = fontSettings.applyFontSettings(fakeDocument, {}, {
    interfaceDefault: fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT,
    preserveInstrumentTypography: true
  });
  assert.equal(result.interfaceFont, fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT);
  assert.equal(properties.get('--ui-font'), fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT);
  assert.equal(properties.get('--font-sans'), fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT);
  assert.equal(properties.get('--tm-display'), 'Bahnschrift, "DIN Alternate", "DIN Condensed", var(--font-sans)');
  assert.equal(properties.has('--font-mono'), false);
  assert.equal(fakeDocument.body.style.fontFamily, fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT);
});

test('unified font settings: preserveInstrumentTypography preserves explicit monospace and custom monospace selections', () => {
  const createFakeDoc = () => {
    const properties = new Map();
    const dataset = {};
    let bodyFontFamily = '';
    return {
      fakeDocument: {
        documentElement: {
          style: {
            setProperty(k, v) { properties.set(k, String(v)); },
            removeProperty(k) { properties.delete(k); }
          },
          dataset
        },
        body: {
          style: {
            get fontFamily() { return bodyFontFamily; },
            set fontFamily(v) { bodyFontFamily = v; }
          }
        }
      },
      properties
    };
  };

  // Explicit 'mono' preset selection (DEFAULT_INTERFACE_FONT)
  {
    const { fakeDocument, properties } = createFakeDoc();
    const result = fontSettings.applyFontSettings(fakeDocument, {
      interfaceFontFamily: fontSettings.DEFAULT_INTERFACE_FONT
    }, {
      interfaceDefault: fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT,
      preserveInstrumentTypography: true
    });
    assert.equal(result.interfaceFont, fontSettings.DEFAULT_INTERFACE_FONT);
    assert.equal(properties.get('--ui-font'), fontSettings.DEFAULT_INTERFACE_FONT);
    assert.equal(properties.get('--font-sans'), fontSettings.DEFAULT_INTERFACE_FONT);
    assert.equal(properties.get('--font-mono'), fontSettings.DEFAULT_INTERFACE_FONT);
    assert.equal(properties.get('--tm-display'), 'Bahnschrift, "DIN Alternate", "DIN Condensed", var(--font-sans)');
  }

  // Explicit custom monospace font
  {
    const { fakeDocument, properties } = createFakeDoc();
    const result = fontSettings.applyFontSettings(fakeDocument, {
      interfaceFontFamily: 'JetBrains Mono, monospace'
    }, {
      interfaceDefault: fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT,
      preserveInstrumentTypography: true
    });
    assert.equal(result.interfaceFont, 'JetBrains Mono, monospace');
    assert.equal(properties.get('--ui-font'), 'JetBrains Mono, monospace');
    assert.equal(properties.get('--font-sans'), 'JetBrains Mono, monospace');
    assert.equal(properties.get('--font-mono'), 'JetBrains Mono, monospace');
    assert.equal(properties.get('--tm-display'), 'Bahnschrift, "DIN Alternate", "DIN Condensed", var(--font-sans)');
  }

  // Explicit non-monospace font leaves --font-mono untouched
  {
    const { fakeDocument, properties } = createFakeDoc();
    const result = fontSettings.applyFontSettings(fakeDocument, {
      interfaceFontFamily: fontSettings.SYSTEM_UI_FONT
    }, {
      interfaceDefault: fontSettings.DEFAULT_DASHBOARD_INTERFACE_FONT,
      preserveInstrumentTypography: true
    });
    assert.equal(result.interfaceFont, fontSettings.SYSTEM_UI_FONT);
    assert.equal(properties.get('--ui-font'), fontSettings.SYSTEM_UI_FONT);
    assert.equal(properties.get('--font-sans'), fontSettings.SYSTEM_UI_FONT);
    assert.equal(properties.has('--font-mono'), false);
    assert.equal(properties.get('--tm-display'), 'Bahnschrift, "DIN Alternate", "DIN Condensed", var(--font-sans)');
  }
});

test('unified font settings: clientBridge exposes TokenMonitorFontSettings and default keys', () => {
  const bridge = clientBridgeApi.clientBridge;
  assert.ok(bridge, 'clientBridge should be defined');
  const root = globalThis;
  assert.ok(root.TokenMonitorFontSettings, 'root.TokenMonitorFontSettings should be exposed');
  assert.equal(typeof root.TokenMonitorFontSettings.resolveEffectiveFontSettings, 'function');
  assert.equal(typeof root.TokenMonitorFontSettings.applyFontSettings, 'function');
  assert.equal(typeof root.TokenMonitorFontSettings.normalizeFontFamily, 'function');
  assert.equal(typeof root.TokenMonitorFontSettings.fontFamilyForPreset, 'function');
  assert.equal(typeof root.TokenMonitorFontSettings.presetForFontFamily, 'function');
});
