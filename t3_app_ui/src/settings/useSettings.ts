import { useState, useEffect, useCallback } from 'react';
import type { TokenMonitorSettingsState } from './types';

export function useTokenMonitorSettings() {
  const [settings, setSettings] = useState<TokenMonitorSettingsState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.getSettings) {
        const data = await window.tokenMonitor.getSettings();
        setSettings(data || {});
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
          setSettings((prev) => ({ ...prev, ...pushed }));
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

  return {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings: loadSettings,
  };
}
