import { useState, useEffect, useCallback } from 'react';
import type { LimitAccountForms, TokenMonitorSettingsState } from './types';

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
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [loadSettings]);

  const updateSettings = useCallback(async (patch: Partial<TokenMonitorSettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
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
    }
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
