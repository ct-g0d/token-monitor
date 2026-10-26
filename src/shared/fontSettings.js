'use strict';

(function exposeFontSettings(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorFontSettings = api;
  if (typeof globalThis !== 'undefined' && !globalThis.TokenMonitorFontSettings) {
    globalThis.TokenMonitorFontSettings = api;
  }
})(typeof window !== 'undefined' ? window : null, function createFontSettingsApi(rootWindow) {
  const DEFAULT_INTERFACE_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  const DEFAULT_DASHBOARD_INTERFACE_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const DEFAULT_DISPLAY_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';
  const SYSTEM_UI_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const FONT_PRESETS = Object.freeze({
    app: '',
    system: SYSTEM_UI_FONT,
    mono: DEFAULT_INTERFACE_FONT
  });
  const TEXT_SIZE_SCALES = Object.freeze({ standard: 1, larger: 1.1, largest: 1.2 });

  function normalizeTextSize(value) {
    return typeof value === 'string' && Object.hasOwn(TEXT_SIZE_SCALES, value) ? value : 'standard';
  }

  function textScaleForSize(value) {
    return TEXT_SIZE_SCALES[normalizeTextSize(value)];
  }

  const MAX_FONT_FAMILY_LENGTH = 160;
  const UNSAFE_FONT_FAMILY_CHARACTERS = /[\u0000-\u001f\u007f;{}<>]/;

  // The setting stores a CSS font-family list, not a font file or executable
  // path. Reject declaration/control characters before it reaches a CSS custom
  // property, while still allowing quoted names, CJK names, and fallbacks.
  function normalizeFontFamily(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > MAX_FONT_FAMILY_LENGTH) return '';
    if (UNSAFE_FONT_FAMILY_CHARACTERS.test(normalized)) return '';
    return normalized;
  }

  function resolveEffectiveFontSettings(settings = {}, options = {}) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const interfaceDefault = normalizeFontFamily(options.interfaceDefault) || DEFAULT_INTERFACE_FONT;
    const interfaceFont = normalizeFontFamily(source.interfaceFontFamily) || interfaceDefault;
    const displayFont = normalizeFontFamily(source.displayFontFamily) || interfaceFont;
    return { interfaceFont, displayFont };
  }

  function presetForFontFamily(value, role = 'interface') {
    const normalized = normalizeFontFamily(value);
    if (role === 'display' && normalized === DEFAULT_DISPLAY_FONT) return 'app';
    for (const [preset, family] of Object.entries(FONT_PRESETS)) {
      if (role === 'display' && preset === 'app') continue;
      if (normalized === family) return preset;
    }
    if (normalized) return 'custom';
    return role === 'display' ? 'follow' : 'app';
  }

  function fontFamilyForPreset(preset, customValue = '', role = 'interface') {
    if (preset === 'custom') return normalizeFontFamily(customValue);
    if (preset === 'follow') return '';
    if (preset === 'app' && role === 'display') return DEFAULT_DISPLAY_FONT;
    return normalizeFontFamily(FONT_PRESETS[preset]);
  }

  function applyFontSettings(targetDoc, settings = {}, options = {}) {
    const doc = targetDoc || (rootWindow && rootWindow.document ? rootWindow.document : null);
    if (!doc || !doc.documentElement) return null;
    const { interfaceFont, displayFont } = resolveEffectiveFontSettings(settings, options);
    const textSize = normalizeTextSize(settings?.textSize);
    const textScale = textScaleForSize(textSize);

    const root = doc.documentElement;
    const style = root.style;
    if (style && typeof style.setProperty === 'function') {
      style.setProperty('--ui-font', interfaceFont);
      style.setProperty('--display-font', displayFont);
      style.setProperty('--font-sans', interfaceFont);
      style.setProperty('--tm-display', `${displayFont}, var(--font-sans)`);
      const isMono =
        interfaceFont === DEFAULT_INTERFACE_FONT ||
        /monospace|SFMono|Liberation Mono|ui-monospace/i.test(interfaceFont);
      if (isMono) {
        style.setProperty('--font-mono', interfaceFont);
      } else if (typeof style.removeProperty === 'function') {
        style.removeProperty('--font-mono');
      }
      style.setProperty('--ui-text-scale', String(textScale));
      style.fontSize = textScale !== 1.0 ? `${Math.round(textScale * 100)}%` : '';
    }

    if (root.dataset) {
      root.dataset.textSize = textSize;
    }

    if (doc.body && doc.body.style) {
      doc.body.style.fontFamily = interfaceFont;
    }

    return { interfaceFont, displayFont, textSize, textScale };
  }

  return {
    DEFAULT_DASHBOARD_INTERFACE_FONT,
    DEFAULT_DISPLAY_FONT,
    DEFAULT_INTERFACE_FONT,
    FONT_PRESETS,
    MAX_FONT_FAMILY_LENGTH,
    SYSTEM_UI_FONT,
    normalizeTextSize,
    textScaleForSize,
    fontFamilyForPreset,
    normalizeFontFamily,
    presetForFontFamily,
    resolveEffectiveFontSettings,
    applyFontSettings
  };
});
