import { useState, useEffect, useCallback } from 'react';
import type { LimitAccountForms, TokenMonitorSettingsState } from './types';

export function applyThemeMode(themeChoice?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const mode = (themeChoice === 'dark' || themeChoice === 'light' || themeChoice === 'system') ? themeChoice : 'system';
  try {
    window.localStorage.setItem('t3code:theme-appearance-mode', mode);
    window.localStorage.setItem('t3code:theme', mode);
  } catch (_) {}
  const isDark = mode === 'dark' || (mode === 'system' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches));
  document.documentElement.classList.toggle('dark', isDark);
  if (window.desktopBridge?.setTheme) {
    try {
      window.desktopBridge.setTheme(mode);
    } catch (_) {}
  }
}

export function applyLanguage(languageChoice?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const preferredLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  const i18n = (window as any).TokenMonitorI18n;
  const resolvedLocale = i18n?.resolveLocale
    ? i18n.resolveLocale(languageChoice || 'auto', preferredLanguages)
    : (languageChoice && languageChoice !== 'auto' ? languageChoice : (navigator.language || 'en').split('-')[0]);

  document.documentElement.lang = resolvedLocale;
  document.documentElement.setAttribute('lang', resolvedLocale);
  document.documentElement.setAttribute('data-locale', resolvedLocale);

  if (i18n?.applyTranslations) {
    i18n.applyTranslations(document, resolvedLocale);
  }
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

  const updateSettings = useCallback(async (patch: Partial<TokenMonitorSettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    if (patch.theme !== undefined) {
      applyThemeMode(patch.theme);
    }
    if (patch.language !== undefined) {
      applyLanguage(patch.language);
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
  }, [loadSettings]);

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
