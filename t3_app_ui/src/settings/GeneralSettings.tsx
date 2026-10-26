import React, { useEffect, useState } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useTheme } from '~/hooks/useTheme';
import { applyThemeMode, applyLanguage, t } from './useSettings';
import type { TokenMonitorSettingsState } from './types';

interface GeneralSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
refreshCurrencyRates: () => Promise<TokenMonitorSettingsState | null | void>;
}

export const selectClass =
  'h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
];

export function GeneralSettings({ settings, updateSettings, refreshCurrencyRates }: GeneralSettingsProps) {
  const { theme, setTheme, setAppearanceMode, appearanceMode } = useTheme();
  const currentTheme = settings.theme || appearanceMode || theme || 'system';
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const [tokscaleInfo, setTokscaleInfo] = useState<any>(null);

  const [customRates, setCustomRates] = useState<Record<string, string>>(() => {
    const existing = settings.currencyRatesEffective || settings.currencyRates || {};
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (v !== undefined && v !== null) {
        init[k] = String(v);
      }
    }
    return init;
  });

  useEffect(() => {
    const rates = settings.currencyRatesEffective || settings.currencyRates;
    if (rates && Object.keys(rates).length > 0) {
      setCustomRates((prev) => {
        const next = { ...prev };
        let hasNew = false;
        for (const [code, val] of Object.entries(rates)) {
          if (val !== undefined && val !== null && next[code] !== String(val)) {
            next[code] = String(val);
            hasNew = true;
          }
        }
        return hasNew ? next : prev;
      });
    }
  }, [settings.currencyRatesEffective, settings.currencyRates]);

  const handleThemeChange = async (nextTheme: string) => {
    setAppearanceMode(nextTheme as any);
    setTheme(nextTheme as any);
    applyThemeMode(nextTheme);
    await updateSettings({ theme: nextTheme });
  };

  const handleLanguageChange = async (lang: string) => {
    applyLanguage(lang);
    await updateSettings({ language: lang });
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.getTokscaleStatus) {
      window.tokenMonitor.getTokscaleStatus().then((status: any) => {
        setTokscaleInfo(status);
      }).catch(() => {});
    }
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      const res = await window.tokenMonitor?.checkAppUpdateNow?.();
      setUpdateMessage(res?.updateAvailable ? `Update available: ${res.version}` : 'You are on the latest version.');
    } catch (err: any) {
      setUpdateMessage(err?.message || 'Failed to check updates');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setReportResult(null);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.generateDiagnosticReport) {
        const path = await window.tokenMonitor.generateDiagnosticReport();
        setReportResult(`Report generated: ${path}`);
      }
    } catch (err: any) {
      setReportResult(err?.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleOpenUserData = () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.openUserData) {
      window.tokenMonitor.openUserData();
    }
  };

  const handleRateChange = (code: string, value: string) => {
    setCustomRates((prev) => ({ ...prev, [code]: value }));
  };

  const handleSaveRates = async () => {
    const numericRates: Record<string, number> = {};
    for (const [k, v] of Object.entries(customRates)) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed) && parsed > 0) {
        numericRates[k] = parsed;
      }
    }
    await updateSettings({ currencyRates: numericRates });
  };

  const handleRefreshRates = async () => {
    setRefreshingRates(true);
    setRateMessage(null);
    try {
      const refreshed = (await refreshCurrencyRates()) as TokenMonitorSettingsState | null | undefined;
      const rates = refreshed?.currencyRatesEffective || refreshed?.currencyRates || settings.currencyRatesEffective || settings.currencyRates || {};
      const updated: Record<string, string> = {};
      for (const [code, val] of Object.entries(rates)) {
        if (val !== undefined && val !== null) {
          updated[code] = String(val);
        }
      }
      setCustomRates((prev) => ({ ...prev, ...updated }));
      setRateMessage('Exchange rates updated.');
    } catch (err: any) {
      setRateMessage(err?.message || 'Could not update exchange rates.');
    } finally {
      setRefreshingRates(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection title="General" description="Basic application behavior and display preferences.">
        <SettingRow
          title="Theme"
          control={
            <select
              value={currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className={selectClass}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          }
        />

        <SettingRow
          title={t('settings.language.title') || 'Language'}
          control={
            <select
              value={settings.language || 'auto'}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className={selectClass}
            >
              <option value="auto">{t('settings.language.auto') || 'Auto (system)'}</option>
              <option value="en">{t('settings.language.english') || 'English'}</option>
              <option value="zh-TW">{t('settings.language.zhTW') || '繁體中文'}</option>
              <option value="zh-CN">{t('settings.language.zhCN') || '简体中文'}</option>
              <option value="ko">{t('settings.language.korean') || '한국어'}</option>
              <option value="ja">{t('settings.language.japanese') || '日本語'}</option>
              <option value="pt-BR">{t('settings.language.portugueseBR') || 'Português (Brasil)'}</option>
            </select>
          }
        />

        <SettingRow
          title="Launch at login"
          control={
            <Switch
              checked={Boolean(settings.startAtLogin)}
              onCheckedChange={(checked) => updateSettings({ startAtLogin: checked })}
            />
          }
        />

        <SettingRow
          title="Edge dock"
          description="Quota rail on the screen edge."
          control={
            <Switch
              checked={Boolean(settings.edgeDockEnabled)}
              onCheckedChange={(checked) => updateSettings({ edgeDockEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Discord Rich Presence"
          description="Show active AI coding sessions and model stats on your Discord profile."
          control={
            <Switch
              checked={Boolean(settings.discordRpcEnabled)}
              onCheckedChange={(checked) => updateSettings({ discordRpcEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="App updates"
          description={updateMessage ?? undefined}
          control={
            <Button variant="outline" size="xs" disabled={checkingUpdate} onClick={handleCheckUpdate}>
              {checkingUpdate ? <Spinner className="mr-1 size-3.5" /> : null}
              Check now
            </Button>
          }
        />
      </SettingSection>

      <SettingSection title="Token & Session Settings" description="Workspace grouping, currency, and session indicators.">
        <SettingRow
          title="Display Currency"
          description="Currency used for token cost calculations."
          control={
            <select
              value={settings.currency || 'USD'}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              className={selectClass}
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) - {c.name}
                </option>
              ))}
            </select>
          }
        />

        <SettingRow
          title="Month & Interval Framing"
          description="Time window framing for periodic monthly statistics."
          control={
            <select
              value={settings.periodMonthMode || 'month'}
              onChange={(e) => updateSettings({ periodMonthMode: e.target.value as any })}
              className={selectClass}
            >
              <option value="month">Calendar Month</option>
              <option value="week">Calendar Week</option>
              <option value="last7">Rolling Last 7 Days</option>
              <option value="last30">Rolling Last 30 Days</option>
            </select>
          }
        />

        <SettingRow
          title="Model Ranking Metric"
          description="Attribute used to sort models in ranking lists."
          control={
            <select
              value={settings.modelRankingMetric || 'tokens'}
              onChange={(e) => updateSettings({ modelRankingMetric: e.target.value as any })}
              className={selectClass}
            >
              <option value="tokens">Total Tokens</option>
              <option value="cost">Estimated Cost</option>
            </select>
          }
        />

        <SettingRow
          title="Heatmap Activity Metric"
          description="Metric rendered across daily activity heatmaps."
          control={
            <select
              value={settings.heatmapMetric || 'cost'}
              onChange={(e) => updateSettings({ heatmapMetric: e.target.value as any })}
              className={selectClass}
            >
              <option value="cost">Cost ($)</option>
              <option value="tokens">Tokens</option>
            </select>
          }
        />

        <SettingRow
          title="Heatmap Hover Details"
          description="Tooltip details shown when hovering over heatmap days."
          control={
            <select
              value={settings.heatmapHoverBehavior || 'detailed'}
              onChange={(e) => updateSettings({ heatmapHoverBehavior: e.target.value as any })}
              className={selectClass}
            >
              <option value="detailed">All Details (Tokens & Cost)</option>
              <option value="compact">Active Metric Only</option>
              <option value="off">Disabled</option>
            </select>
          }
        />

        <SettingRow
          title="Active Days Window"
          description="Date range window for activity heatmap cells."
          control={
            <select
              value={settings.homeActiveDaysWindow || 'all'}
              onChange={(e) => updateSettings({ homeActiveDaysWindow: e.target.value as any })}
              className={selectClass}
            >
              <option value="all">All Available History</option>
              <option value="year">Past 365 Days</option>
            </select>
          }
        />

        <SettingRow
          title="Session Titles"
          description="Show custom prompt topics and titles in session lists."
          control={
            <Switch
              checked={settings.sessionTitlesEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ sessionTitlesEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Projects Grouping"
          description="Group sessions into project workspaces based on git repository root paths."
          control={
            <Switch
              checked={settings.projectsEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ projectsEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Session Context Metric"
          description="Format for context window usage in inspectors and edge dock."
          control={
            <select
              value={settings.sessionContextMetric || 'used'}
              onChange={(e) => updateSettings({ sessionContextMetric: e.target.value as 'used' | 'remaining' })}
              className={selectClass}
            >
              <option value="used">Used Context</option>
              <option value="remaining">Remaining Context</option>
            </select>
          }
        />

        <SettingRow
          title="Token Rate Framing"
          description="Measurement framing for live streaming token rates."
          control={
            <select
              value={settings.tokenRateMode || 'speed'}
              onChange={(e) => updateSettings({ tokenRateMode: e.target.value as any })}
              className={selectClass}
            >
              <option value="speed">Output Speed (tok/s)</option>
              <option value="burn">Burn Rate (tok/min)</option>
            </select>
          }
        />

        <SettingRow
          title="Codex Indicator Dots"
          description="Display session activity indicator dots on models and sessions."
          control={
            <Switch
              checked={settings.codexDotsEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ codexDotsEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Always Visible Dots"
          description="Keep Codex indicator dots visible even when idle."
          control={
            <Switch
              checked={Boolean(settings.codexDotsVisible)}
              onCheckedChange={(checked) => updateSettings({ codexDotsVisible: checked })}
            />
          }
        />

        <SettingRow
          title="Service Status Refresh Interval"
          description="Frequency for polling third-party provider status pages."
          control={
            <select
              value={String(settings.serviceStatusRefreshMs || 60000)}
              onChange={(e) => updateSettings({ serviceStatusRefreshMs: Number(e.target.value) })}
              className={selectClass}
            >
              <option value="0">Manual</option>
              <option value="60000">1 minute</option>
              <option value="120000">2 minutes</option>
              <option value="300000">5 minutes</option>
              <option value="900000">15 minutes</option>
              <option value="1800000">30 minutes</option>
            </select>
          }
        />

        <div className="p-3.5 space-y-3 bg-muted/20 rounded-lg border border-border/50">
          <h4 className="tm-label !text-foreground">
            Custom Exchange Rates (Relative to 1 USD)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {['CNY'].map((code) => (
              <div key={code} className="space-y-1">
                <label className="tm-label">{code}</label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Rate"
                  value={customRates[code] || ''}
                  onChange={(e) => handleRateChange(code, e.target.value)}
                  className="h-7 text-xs tabular-nums"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <div className="flex items-center gap-2">
              {rateMessage ? <span className="text-xs text-muted-foreground">{rateMessage}</span> : null}
              <Button size="sm" variant="outline" onClick={handleRefreshRates} disabled={refreshingRates}>
                {refreshingRates ? <Spinner className="mr-1.5 size-3" /> : null}
                Fetch Current Rates
              </Button>
              <Button size="sm" variant="outline" onClick={handleSaveRates}>
                Save Rates
              </Button>
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Home Dashboard & Views Layout" description="Custom module arrangements and view display order.">
        <SettingRow
          title="Limits Display Style"
          description="Presentation format for quota bars and limits on the home dashboard."
          control={
            <select
              value={settings.homeLimitDisplayMode || 'text'}
              onChange={(e) => updateSettings({ homeLimitDisplayMode: e.target.value })}
              className={selectClass}
            >
              <option value="text">Text and labels</option>
              <option value="bars">Progress bars</option>
            </select>
          }
        />

        <SettingRow
          title="Show Home Limit Bars"
          description="Display visual limit bars alongside primary metrics on the home panel."
          control={
            <Switch
              checked={Boolean(settings.showHomeLimitBars)}
              onCheckedChange={(checked) => updateSettings({ showHomeLimitBars: checked })}
            />
          }
        />

        <SettingRow
          title="Show Provider Names on Bars"
          description="Print provider brand text on compact quota bars."
          control={
            <Switch
              checked={Boolean(settings.showHomeLimitProviderNames)}
              onCheckedChange={(checked) => updateSettings({ showHomeLimitProviderNames: checked })}
            />
          }
        />

        <SettingRow
          title="Max Home Limit Accounts"
          description="Number of limit accounts surfaced on the home panel."
          control={
            <Input
              type="number"
              min="1"
              max="20"
              value={settings.homeLimitAccountCount ?? 4}
              onChange={(e) => updateSettings({ homeLimitAccountCount: Number(e.target.value) || 4 })}
              className="h-8 w-20 text-xs tabular-nums"
            />
          }
        />

        {(settings.homeModuleOrder || settings.hiddenHomeModules || settings.homeLimitProviderOrder || settings.hiddenHomeLimitProviders) && (
          <SettingRow
            title="Home Module Customization"
            description="Custom arrangements for dashboard card ordering."
            control={
              <Button
                variant="outline"
                size="xs"
                onClick={() => updateSettings({
                  homeModuleOrder: '',
                  hiddenHomeModules: '',
                  homeLimitProviderOrder: '',
                  hiddenHomeLimitProviders: ''
                })}
              >
                Reset layout
              </Button>
            }
          />
        )}

        {(settings.viewDisplayOrder || settings.hiddenViews) && (
          <SettingRow
            title="Views Order & Visibility"
            description="Custom tabs order for navigation views."
            control={
              <Button
                variant="outline"
                size="xs"
                onClick={() => updateSettings({ viewDisplayOrder: '', hiddenViews: '' })}
              >
                Reset view order
              </Button>
            }
          />
        )}

        {(settings.serviceProviderDisplayOrder || settings.hiddenServiceProviders) && (
          <SettingRow
            title="Service Providers Order"
            description="Custom sorting for status service providers."
            control={
              <Button
                variant="outline"
                size="xs"
                onClick={() => updateSettings({ serviceProviderDisplayOrder: '', hiddenServiceProviders: '' })}
              >
                Reset service providers
              </Button>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Limits Cadence & Preferences" description="Global polling intervals and provider enablement.">
        <SettingRow
          title="Limits Tracking"
          description="Enable real-time quota and subscription rate limit checks."
          control={
            <Switch
              checked={settings.limitsEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ limitsEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Limits Refresh Cadence"
          description="Interval between background limit balance updates."
          control={
            <select
              value={settings.limitsRefreshMode === 'adaptive' ? 'adaptive' : String(settings.limitsRefreshMs || 300000)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'adaptive') {
                  updateSettings({ limitsRefreshMode: 'adaptive' });
                } else {
                  updateSettings({ limitsRefreshMode: 'fixed', limitsRefreshMs: Number(val) });
                }
              }}
              className={selectClass}
            >
              <option value="adaptive">Adaptive</option>
              <option value="60000">1 minute</option>
              <option value="120000">2 minutes</option>
              <option value="300000">5 minutes</option>
              <option value="900000">15 minutes</option>
              <option value="1800000">30 minutes</option>
            </select>
          }
        />

        {settings.limitProviders && (
          <SettingRow
            title="Active Limit Providers"
            description="Configured provider list filter."
            control={
              <Button
                variant="outline"
                size="xs"
                onClick={() => updateSettings({ limitProviders: '' })}
              >
                Reset providers
              </Button>
            }
          />
        )}

        {settings.copilotApiToken && (
          <SettingRow
            title="GitHub Copilot API Token"
            description="Stored token override for Copilot quota checks."
            control={
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => updateSettings({ copilotApiToken: '' })}
              >
                Clear token
              </Button>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Diagnostics & System" description="Troubleshooting details and configuration directories.">
        <SettingRow
          title="Tokscale Status"
          description={
            tokscaleInfo
              ? `Version: ${tokscaleInfo.version || 'Active'} · Source: ${tokscaleInfo.path || 'Bundled'}`
              : 'Tokscale usage parser engine is running.'
          }
        />

        <SettingRow
          title="Application Data"
          description="Open the directory where local token logs and configurations are stored."
          control={
            <Button variant="outline" size="sm" onClick={handleOpenUserData}>
              Open directory
            </Button>
          }
        />

        <SettingRow
          title="Diagnostic Report"
          description={reportResult || "Generate a redacted diagnostic archive to attach when reporting issues."}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={generatingReport}
              onClick={handleGenerateReport}
            >
              {generatingReport ? <Spinner className="size-3.5 mr-1" /> : null}
              Generate report
            </Button>
          }
        />
      </SettingSection>
    </div>
  );
}
