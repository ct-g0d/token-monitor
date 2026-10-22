import React, { useState } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import type { TokenMonitorSettingsState } from './types';

interface MainSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
];

const MODULE_NAMES: Record<string, string> = {
  limits: 'Limits & Quotas',
  tool: 'Tools & Clients',
  model: 'Model Breakdown',
  session: 'Recent Sessions',
  device: 'Device Sync',
  trends: 'Usage Trends',
};

export function MainSettings({ settings, updateSettings }: MainSettingsProps) {
  const [customRates, setCustomRates] = useState<Record<string, string>>(() => {
    const existing = settings.currencyRates || {};
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing)) {
      init[k] = String(v);
    }
    return init;
  });

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

  // Home module visibility
  const hiddenModulesSet = new Set(
    (settings.hiddenHomeModules || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const toggleModuleHidden = (modId: string) => {
    const next = new Set(hiddenModulesSet);
    if (next.has(modId)) {
      next.delete(modId);
    } else {
      next.add(modId);
    }
    updateSettings({ hiddenHomeModules: Array.from(next).join(',') });
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Widget Layout & Style" description="Dashboard cards, home layout, and module arrangement.">
        <SettingRow
          title="Flat Dashboard Style"
          description="Render minimalist card containers without heavy border outlines."
          control={
            <Switch
              checked={Boolean(settings.dashboardFlat)}
              onCheckedChange={(checked) => updateSettings({ ['dashboardFlat']: checked })}
            />
          }
        />

        <SettingRow
          title="Home Dashboard Modules"
          description="Choose which module cards appear on the main overview."
          control={
            <div className="flex flex-wrap gap-2 max-w-sm justify-end">
              {Object.entries(MODULE_NAMES).map(([id, label]) => {
                const isHidden = hiddenModulesSet.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleModuleHidden(id)}
                    className={`px-2 py-1 rounded text-2xs font-medium border transition-colors ${
                      !isHidden
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/40 bg-muted/20 text-muted-foreground line-through'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          }
        />

        {settings.homeModuleOrder && (
          <SettingRow
            title="Module Order"
            description="Custom sequence for home dashboard cards."
            control={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateSettings({ homeModuleOrder: '' })}
              >
                Reset module order
              </Button>
            }
          />
        )}

        {settings.viewDisplayOrder && (
          <SettingRow
            title="Navigation Views"
            description="Custom sequence and visibility for sidebar / tab views."
            control={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateSettings({ viewDisplayOrder: '', hiddenViews: '' })}
              >
                Reset view order
              </Button>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Home Limit Cards" description="Display parameters for quota progress on the home dashboard.">
        <SettingRow
          title="Limit Accounts Count"
          description="Maximum number of accounts to display in the home limits card (1 - 12)."
          control={
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="12"
                value={settings.homeLimitAccountCount ?? 3}
                onChange={(e) => updateSettings({ homeLimitAccountCount: parseInt(e.target.value, 10) || 3 })}
                className="h-8 w-20 text-xs"
              />
            </div>
          }
        />

        <SettingRow
          title="Limit Card Display Mode"
          description="Visual format for quota status cards."
          control={
            <select
              value={settings.homeLimitDisplayMode || 'bars'}
              onChange={(e) => updateSettings({ homeLimitDisplayMode: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="bars">Progress Bars</option>
              <option value="text">Compact Text</option>
            </select>
          }
        />

        <SettingRow
          title="Show Limit Progress Bars"
          description="Render graphical fill bars on home quota summaries."
          control={
            <Switch
              checked={settings.showHomeLimitBars !== false}
              onCheckedChange={(checked) => updateSettings({ showHomeLimitBars: checked })}
            />
          }
        />

        <SettingRow
          title="Show Provider Names"
          description="Display AI provider labels on quota entries."
          control={
            <Switch
              checked={settings.showHomeLimitProviderNames !== false}
              onCheckedChange={(checked) => updateSettings({ showHomeLimitProviderNames: checked })}
            />
          }
        />

        {(settings.homeLimitProviderOrder || settings.hiddenHomeLimitProviders) && (
          <SettingRow
            title="Home Limit Providers"
            description="Custom sequencing of providers on home cards."
            control={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateSettings({ homeLimitProviderOrder: '', hiddenHomeLimitProviders: '' })}
              >
                Reset providers
              </Button>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Metrics & Calculations" description="Rankings, time windows, and heatmap calculation units.">
        <SettingRow
          title="Model Ranking Metric"
          description="How models and tools are prioritized in breakdown lists."
          control={
            <select
              value={settings.modelRankingMetric || 'tokens'}
              onChange={(e) => updateSettings({ modelRankingMetric: e.target.value as 'tokens' | 'cost' })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="tokens">Total Tokens</option>
              <option value="cost">Estimated Cost ($)</option>
            </select>
          }
        />

        <SettingRow
          title="Heatmap Activity Metric"
          description="Data dimension shown on daily activity heatmap tiles."
          control={
            <select
              value={settings.heatmapMetric || 'cost'}
              onChange={(e) => updateSettings({ heatmapMetric: e.target.value as 'cost' | 'tokens' })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="cost">Cost ($)</option>
              <option value="tokens">Tokens</option>
            </select>
          }
        />

        <SettingRow
          title="Session Context Metric"
          description="Format for context window usage in session inspectors."
          control={
            <select
              value={settings.sessionContextMetric || 'used'}
              onChange={(e) => updateSettings({ sessionContextMetric: e.target.value as 'used' | 'remaining' })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="used">Used Context</option>
              <option value="remaining">Remaining Context</option>
            </select>
          }
        />

        <SettingRow
          title="Active Days Window"
          description="Time window evaluated for active coding day counts."
          control={
            <select
              value={settings.homeActiveDaysWindow || 'year'}
              onChange={(e) => updateSettings({ homeActiveDaysWindow: e.target.value as 'all' | 'year' })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="year">Past 365 Days</option>
              <option value="all">All Time History</option>
            </select>
          }
        />

        <SettingRow
          title="Calendar Period Mode"
          description="Grouping mode for monthly and weekly breakdown totals."
          control={
            <select
              value={settings.periodMonthMode || 'month'}
              onChange={(e) => updateSettings({ periodMonthMode: e.target.value as any })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="month">Calendar Month</option>
              <option value="week">Calendar Week</option>
              <option value="last7">Rolling 7 Days</option>
              <option value="last30">Rolling 30 Days</option>
            </select>
          }
        />
      </SettingSection>

      <SettingSection title="Codex Visual Indicators" description="Dot presence indicators for active OpenAI Codex sessions.">
        <SettingRow
          title="Codex Indicator Dots"
          description="Display session indicator dots on tracked models and sessions."
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
      </SettingSection>

      <SettingSection title="Projects & Session Labels" description="Workspace grouping and session name display.">
        <SettingRow
          title="Session Titles"
          description="Show custom titles and prompt topics in session lists."
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
      </SettingSection>

      <SettingSection title="Service Status Providers" description="Monitoring status of cloud AI API services.">
        <SettingRow
          title="Status Poll Cadence"
          description="Interval between service availability health checks."
          control={
            <select
              value={String(settings.serviceStatusRefreshMs ?? 300000)}
              onChange={(e) => updateSettings({ serviceStatusRefreshMs: parseInt(e.target.value, 10) })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="0">Disabled</option>
              <option value="60000">1 minute</option>
              <option value="120000">2 minutes</option>
              <option value="300000">5 minutes</option>
              <option value="900000">15 minutes</option>
              <option value="1800000">30 minutes</option>
            </select>
          }
        />

        {(settings.hiddenServiceProviders || settings.serviceProviderDisplayOrder) && (
          <SettingRow
            title="Service Providers Order"
            description="Custom display sequence for provider status indicators."
            control={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateSettings({ serviceProviderDisplayOrder: '', hiddenServiceProviders: '' })}
              >
                Reset service providers
              </Button>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Currency & Exchange Rates" description="Manage local currency conversion rates.">
        <SettingRow
          title="Display Currency"
          description="Primary currency symbol used for estimated cost calculations."
          control={
            <select
              value={settings.currency || 'USD'}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) - {c.name}
                </option>
              ))}
            </select>
          }
        />

        <div className="p-4 space-y-3 bg-muted/20 rounded-lg border border-border/50">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Custom Exchange Rates (Relative to 1 USD)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {['CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'HKD'].map((code) => (
              <div key={code} className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{code}</label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Rate"
                  value={customRates[code] || ''}
                  onChange={(e) => handleRateChange(code, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <Button size="sm" variant="outline" onClick={handleSaveRates}>
              Save Rates
            </Button>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
