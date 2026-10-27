import { useState, useEffect, useCallback } from 'react';
import type { LimitAccountForms, TokenMonitorSettingsState } from './types';
import { i18n, resolveLocale, resolveRegionalLocale, t } from '../i18n';
import { fontSettingsApi } from './fontSettingsBridge';

export { t, resolveLocale, resolveRegionalLocale };

let systemThemeListenerAttached = false;
let currentAppliedThemeMode: 'system' | 'dark' | 'light' = 'system';

function onSystemThemeChange() {
  if (currentAppliedThemeMode === 'system' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const isDark = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
    document.documentElement.classList.toggle('dark', isDark);
  }
}

export function applyThemeMode(themeChoice?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const mode = (themeChoice === 'dark' || themeChoice === 'light' || themeChoice === 'system') ? themeChoice : 'system';
  currentAppliedThemeMode = mode;
  try {
    window.localStorage.setItem('t3code:theme-appearance-mode', mode);
    window.localStorage.setItem('t3code:theme', mode);
    window.localStorage.setItem('tokenmonitor:theme', mode);
  } catch (_) {}
  const isDark = mode === 'dark' || (mode === 'system' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches));
  document.documentElement.classList.toggle('dark', isDark);

  if (!systemThemeListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
    try {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      if (media.addEventListener) {
        media.addEventListener('change', onSystemThemeChange);
      } else if ((media as any).addListener) {
        (media as any).addListener(onSystemThemeChange);
      }
      systemThemeListenerAttached = true;
    } catch (_) {}
  }

  if (window.desktopBridge?.setTheme) {
    try {
      window.desktopBridge.setTheme(mode);
    } catch (_) {}
  }
}

export function applyLanguage(languageChoice?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const preferredLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  const activeI18n = (window as any).TokenMonitorI18n || i18n;
  const resolvedLocale = activeI18n?.resolveLocale
    ? activeI18n.resolveLocale(languageChoice || 'auto', preferredLanguages)
    : resolveLocale(languageChoice, preferredLanguages as string[]);

  const regionalLocale = activeI18n?.resolveRegionalLocale
    ? activeI18n.resolveRegionalLocale([...preferredLanguages, resolvedLocale])
    : resolveRegionalLocale([...preferredLanguages, resolvedLocale]);

  document.documentElement.lang = resolvedLocale;
  document.documentElement.setAttribute('lang', resolvedLocale);
  document.documentElement.setAttribute('data-locale', resolvedLocale);
  document.documentElement.setAttribute('data-regional-locale', regionalLocale);

  try {
    window.localStorage.setItem('t3code:language', languageChoice || 'auto');
    window.localStorage.setItem('t3code:locale', resolvedLocale);
    window.localStorage.setItem('t3code:regional-locale', regionalLocale);
    window.localStorage.setItem('tokenmonitor:language', languageChoice || 'auto');
    window.localStorage.setItem('tokenmonitor:locale', resolvedLocale);
    window.localStorage.setItem('tokenmonitor:regional-locale', regionalLocale);
  } catch (_) {}

  if (activeI18n?.applyTranslations) {
    activeI18n.applyTranslations(document, resolvedLocale);
  }

  try {
    window.dispatchEvent(
      new CustomEvent('tokenmonitor:languagechange', {
        detail: { language: languageChoice || 'auto', locale: resolvedLocale, regionalLocale },
      })
    );
  } catch (_) {}
}

export function applyFontSettings(settings?: Partial<TokenMonitorSettingsState>) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const source = settings || {};
  const result = fontSettingsApi.applyFontSettings(document, source, {
    interfaceDefault: fontSettingsApi.DEFAULT_DASHBOARD_INTERFACE_FONT,
    preserveInstrumentTypography: true,
  });
  if (!result) return;
  const { interfaceFont, displayFont, textSize, textScale } = result;

  try {
    if (source.interfaceFontFamily) {
      window.localStorage.setItem('tokenmonitor:font-family', interfaceFont);
      window.localStorage.setItem('t3code:font-family', interfaceFont);
      if (
        interfaceFont.includes('monospace') ||
        interfaceFont.includes('SFMono') ||
        interfaceFont.includes('Liberation Mono') ||
        interfaceFont.includes('ui-monospace')
      ) {
        window.localStorage.setItem('tokenmonitor:explicit-mono', '1');
      } else {
        window.localStorage.removeItem('tokenmonitor:explicit-mono');
      }
    } else {
      window.localStorage.removeItem('tokenmonitor:font-family');
      window.localStorage.removeItem('t3code:font-family');
      window.localStorage.removeItem('tokenmonitor:explicit-mono');
    }
    window.localStorage.setItem('tokenmonitor:text-size', textSize);
  } catch (_) {}

  try {
    window.dispatchEvent(
      new CustomEvent('tokenmonitor:fontchange', {
        detail: {
          font: interfaceFont,
          interfaceFont,
          displayFont,
          textSize,
          textScale,
        },
      })
    );
  } catch (_) {}
}

export function useTokenMonitorSettings() {
  const [settings, setSettings] = useState<TokenMonitorSettingsState>({});
  const [accountForms, setAccountForms] = useState<LimitAccountForms>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.getSettings) {
        const data = await window.tokenMonitor.getSettings();
        const { limitAccountForms, ...rawSettings } = (data || {}) as TokenMonitorSettingsState & {
          limitAccountForms?: LimitAccountForms;
        };
        const persistedSettings: TokenMonitorSettingsState = {
          ...rawSettings,
          theme: rawSettings.theme || 'system',
          customModelPricing: Array.isArray(rawSettings.customModelPricing) ? rawSettings.customModelPricing : [],
          subscriptions: Array.isArray(rawSettings.subscriptions) ? rawSettings.subscriptions : [],
          modelAliases: rawSettings.modelAliases && typeof rawSettings.modelAliases === 'object' && !Array.isArray(rawSettings.modelAliases)
            ? rawSettings.modelAliases
            : {},
          currencyRates: rawSettings.currencyRates && typeof rawSettings.currencyRates === 'object' && !Array.isArray(rawSettings.currencyRates)
            ? rawSettings.currencyRates
            : {},
        };
        setSettings(persistedSettings);
        setAccountForms(limitAccountForms || []);
        if (persistedSettings.theme) {
          applyThemeMode(persistedSettings.theme);
        }
        if (persistedSettings.language) {
          applyLanguage(persistedSettings.language);
        }
        applyFontSettings(persistedSettings);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    if (typeof window !== 'undefined' && window.tokenMonitor?.onSettingsPush) {
      const unsubscribe = window.tokenMonitor.onSettingsPush((pushed: TokenMonitorSettingsState) => {
        if (pushed) {
          const { limitAccountForms, ...persistedSettings } = pushed as TokenMonitorSettingsState & {
            limitAccountForms?: LimitAccountForms;
          };
          if (limitAccountForms) setAccountForms(limitAccountForms);
          setSettings((prev) => ({ ...prev, ...persistedSettings }));
          if (persistedSettings.theme) {
            applyThemeMode(persistedSettings.theme);
          }
          if (persistedSettings.language) {
            applyLanguage(persistedSettings.language);
          }
          applyFontSettings(persistedSettings);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [loadSettings]);

  useEffect(() => {
    if (settings.theme) {
      applyThemeMode(settings.theme);
    }
  }, [settings.theme]);

  useEffect(() => {
    if (settings.language) {
      applyLanguage(settings.language);
    }
  }, [settings.language]);

  useEffect(() => {
    applyFontSettings(settings);
  }, [settings.interfaceFontFamily, settings.displayFontFamily, settings.textSize]);

  const updateSettings = useCallback(async (patch: Partial<TokenMonitorSettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    if (patch.theme !== undefined) {
      applyThemeMode(patch.theme);
    }
    if (patch.language !== undefined) {
      applyLanguage(patch.language);
    }
    if (
      patch.interfaceFontFamily !== undefined ||
      patch.displayFontFamily !== undefined ||
      patch.textSize !== undefined
    ) {
      applyFontSettings({ ...settings, ...patch });
    }
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.updateSettings) {
        await window.tokenMonitor.updateSettings(patch);
      }
    } catch (err: any) {
      console.error('Failed to update settings:', err);
      // Revert/refresh on error
      loadSettings();
      throw err;
    }
  }, [loadSettings, settings]);

  const refreshCurrencyRates = useCallback(async () => {
    const refreshed = await window.tokenMonitor?.refreshCurrencyRates?.();
    if (refreshed) {
      const { limitAccountForms, ...persistedSettings } = refreshed as TokenMonitorSettingsState & {
        limitAccountForms?: LimitAccountForms;
      };
      if (limitAccountForms) setAccountForms(limitAccountForms);
      setSettings((prev) => ({ ...prev, ...persistedSettings }));
      return refreshed as TokenMonitorSettingsState;
    }
    return null;
  }, []);

  return {
    settings,
    accountForms,
    loading,
    error,
    updateSettings,
    refreshCurrencyRates,
    refreshSettings: loadSettings,
  };
}
