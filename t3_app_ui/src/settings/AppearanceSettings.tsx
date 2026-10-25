import React, { useState, useEffect } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useTheme } from '~/hooks/useTheme';
import { applyThemeMode } from './useSettings';
import type { TokenMonitorSettingsState } from './types';

interface AppearanceSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AppearanceSettings({ settings, updateSettings }: AppearanceSettingsProps) {
  const { theme, setTheme, setAppearanceMode, appearanceMode } = useTheme();
  const currentTheme = settings.theme || appearanceMode || theme || 'system';

  const handleThemeChange = async (nextTheme: string) => {
    setAppearanceMode(nextTheme as any);
    setTheme(nextTheme as any);
    applyThemeMode(nextTheme);
    await updateSettings({ theme: nextTheme });
  };
  const [bgPath, setBgPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.getBackgroundImage) {
      window.tokenMonitor.getBackgroundImage().then((path: string) => {
        setBgPath(path || null);
      }).catch(() => {});
    }
  }, []);

  const handleChooseBg = async () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.chooseBackgroundImage) {
      const selected = await window.tokenMonitor.chooseBackgroundImage();
      if (selected) setBgPath(selected);
    }
  };

  const handleClearBg = async () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.clearBackgroundImage) {
      await window.tokenMonitor.clearBackgroundImage();
      setBgPath(null);
    }
  };

  // Font preset resolution
  const interfaceFont = settings.interfaceFontFamily || '';
  const displayFont = settings.displayFontFamily || '';

  const getInterfacePreset = (val: string) => {
    if (!val) return 'app';
    if (val.includes('system-ui')) return 'system';
    if (val.includes('SFMono') || val.includes('Liberation Mono')) return 'mono';
    return 'custom';
  };

  const getDisplayPreset = (val: string) => {
    if (!val) return 'follow';
    if (val.includes('SF Pro Display')) return 'app';
    if (val.includes('system-ui')) return 'system';
    if (val.includes('SFMono') || val.includes('Liberation Mono')) return 'mono';
    return 'custom';
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Theme & Glass Effects" description="Window materials, transparency, and background filters.">
        <SettingRow
          title="Color Theme"
          description="Switch between Light, Dark, or follow System appearance."
          control={
            <select
              value={currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className={selectClass}
            >
              <option value="system">System Default</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          }
        />

        <SettingRow
          title="Native System Material"
          description="Use OS native frosted glass or acrylic backdrop material."
          control={
            <Switch
              checked={settings.systemGlass !== false}
              onCheckedChange={(checked) => updateSettings({ systemGlass: checked })}
            />
          }
        />

        <SettingRow
          title="Windows Backdrop Material"
          description="Surface composition style when running on Windows 11 / 10."
          control={
            <select
              value={settings.windowsBackdrop || 'acrylic'}
              onChange={(e) => updateSettings({ windowsBackdrop: e.target.value as any })}
              className={selectClass}
            >
              <option value="acrylic">Acrylic</option>
              <option value="accent">Accent Blur (experimental)</option>
            </select>
          }
        />

        <SettingRow
          title="macOS Glass Style"
          description="Backdrop material formulation when running on macOS."
          control={
            <select
              value={settings.macBackdrop || 'vibrancy'}
              onChange={(e) => updateSettings({ macBackdrop: e.target.value as any })}
              className={selectClass}
            >
              <option value="vibrancy">Frosted Glass (Vibrancy)</option>
              <option value="liquid-glass">Liquid Glass (Regular)</option>
            </select>
          }
        />

        <SettingRow
          title="Glass Opacity"
          description="Translucency level of the window background (0 - 100)."
          control={
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.glassOpacity ?? 85}
                onChange={(e) => updateSettings({ glassOpacity: parseInt(e.target.value, 10) })}
                className="w-28 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8">
                {settings.glassOpacity ?? 85}%
              </span>
            </div>
          }
        />

        <SettingRow
          title="Glass Depth & Blur"
          description="Strength of backdrop blur filter (0 - 100)."
          control={
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.glassBlur ?? 50}
                onChange={(e) => updateSettings({ glassBlur: parseInt(e.target.value, 10) })}
                className="w-28 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8">
                {settings.glassBlur ?? 50}%
              </span>
            </div>
          }
        />

        <SettingRow
          title="Zoom Scale"
          description="Overall UI zoom factor (70% - 160%)."
          control={
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="70"
                max="160"
                step="5"
                value={Math.round((settings.zoomFactor ?? 1.0) * 100)}
                onChange={(e) => updateSettings({ zoomFactor: parseInt(e.target.value, 10) / 100 })}
                className="w-28 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-10">
                {Math.round((settings.zoomFactor ?? 1.0) * 100)}%
              </span>
            </div>
          }
        />
      </SettingSection>

      <SettingSection title="Background Image" description="Custom image backdrop beneath dashboard cards.">
        <SettingRow
          title="Image Source"
          description={bgPath ? `Current: ${bgPath}` : 'No background image configured.'}
          control={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleChooseBg}>
                Choose image...
              </Button>
              {bgPath && (
                <Button variant="ghost" size="sm" onClick={handleClearBg} className="text-xs">
                  Remove
                </Button>
              )}
            </div>
          }
        />

        {bgPath && (
          <SettingRow
            title="Image Opacity"
            description="Blend transparency of the background wallpaper (0 - 100)."
            control={
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={settings.backgroundImageOpacity ?? 30}
                  onChange={(e) => updateSettings({ backgroundImageOpacity: parseInt(e.target.value, 10) })}
                  className="w-28 accent-primary"
                />
                <span className="text-xs text-muted-foreground w-8">
                  {settings.backgroundImageOpacity ?? 30}%
                </span>
              </div>
            }
          />
        )}
      </SettingSection>

      <SettingSection title="Typography & Metrics" description="Configure UI fonts, text scale, and live rate measurement mode.">
        <SettingRow
          title="Text Size"
          description="Scale size preset for labels and values."
          control={
            <select
              value={settings.textSize || 'standard'}
              onChange={(e) => updateSettings({ textSize: e.target.value as any })}
              className={selectClass}
            >
              <option value="standard">Standard (100%)</option>
              <option value="larger">Larger (110%)</option>
              <option value="largest">Largest (120%)</option>
            </select>
          }
        />

        <SettingRow
          title="Interface Font"
          description="Primary font family used for UI typography."
          control={
            <div className="flex flex-col gap-1.5 items-end">
              <select
                value={getInterfacePreset(interfaceFont)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'app') updateSettings({ interfaceFontFamily: '' });
                  else if (val === 'system') updateSettings({ interfaceFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
                  else if (val === 'mono') updateSettings({ interfaceFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' });
                }}
                className={selectClass}
              >
                <option value="app">App Monospace (Default)</option>
                <option value="system">System UI</option>
                <option value="mono">Monospace</option>
                <option value="custom">Custom font...</option>
              </select>
              {getInterfacePreset(interfaceFont) === 'custom' && (
                <Input
                  placeholder="e.g. Inter, Roboto"
                  value={interfaceFont}
                  onChange={(e) => updateSettings({ interfaceFontFamily: e.target.value })}
                  className="h-7 w-48 text-xs"
                />
              )}
            </div>
          }
        />

        <SettingRow
          title="Display Font"
          description="Font used for numbers, large metrics, and headings."
          control={
            <div className="flex flex-col gap-1.5 items-end">
              <select
                value={getDisplayPreset(displayFont)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'follow') updateSettings({ displayFontFamily: '' });
                  else if (val === 'app') updateSettings({ displayFontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif' });
                  else if (val === 'system') updateSettings({ displayFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
                  else if (val === 'mono') updateSettings({ displayFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' });
                }}
                className={selectClass}
              >
                <option value="follow">Follow Interface Font</option>
                <option value="app">App Display (Default)</option>
                <option value="system">System UI</option>
                <option value="mono">Monospace</option>
                <option value="custom">Custom font...</option>
              </select>
              {getDisplayPreset(displayFont) === 'custom' && (
                <Input
                  placeholder="e.g. SF Pro Display, Arial"
                  value={displayFont}
                  onChange={(e) => updateSettings({ displayFontFamily: e.target.value })}
                  className="h-7 w-48 text-xs"
                />
              )}
            </div>
          }
        />

        <SettingRow
          title="Token Rate Calculation"
          description="How live generation rate is formatted in headers and badges."
          control={
            <select
              value={settings.tokenRateMode || 'speed'}
              onChange={(e) => updateSettings({ tokenRateMode: e.target.value as 'speed' | 'burn' })}
              className={selectClass}
            >
              <option value="speed">Generation Speed (tok/s)</option>
              <option value="burn">Token Burn Rate (tok/min)</option>
            </select>
          }
        />

        <SettingRow
          title="Reduce Motion"
          description="Minimize animations and smooth UI transitions."
          control={
            <select
              value={typeof settings.reduceMotion === 'string' ? settings.reduceMotion : settings.reduceMotion ? 'on' : 'system'}
              onChange={(e) => updateSettings({ reduceMotion: e.target.value as any })}
              className={selectClass}
            >
              <option value="system">Follow System</option>
              <option value="on">Always Reduce Motion</option>
              <option value="off">Full Animations</option>
            </select>
          }
        />
      </SettingSection>

      <SettingSection title="Header & Visual Badges" description="Visibility of badges, rate readouts, and navigation shortcuts.">
        <SettingRow
          title="Live Activity Indicator Dot"
          description="Show pulse dot in header when models are streaming tokens."
          control={
            <Switch
              checked={settings.showLiveDot !== false}
              onCheckedChange={(checked) => updateSettings({ showLiveDot: checked })}
            />
          }
        />

        <SettingRow
          title="Tool & Client Icons"
          description="Display provider branding icons next to tool labels."
          control={
            <Switch
              checked={settings.showToolIcons !== false}
              onCheckedChange={(checked) => updateSettings({ showToolIcons: checked })}
            />
          }
        />

        <SettingRow
          title="Compact Title Mark Only"
          description="Display minimal application icon in title bar instead of full logo."
          control={
            <Switch
              checked={settings.titleIconOnly !== false}
              onCheckedChange={(checked) => updateSettings({ titleIconOnly: checked })}
            />
          }
        />

        <SettingRow
          title="Compact Total Tokens"
          description="Abbreviate grand totals using compact notation (e.g. 1.2M)."
          control={
            <Switch
              checked={Boolean(settings.showCompactTotalTokens)}
              onCheckedChange={(checked) => updateSettings({ showCompactTotalTokens: checked })}
            />
          }
        />

        <SettingRow
          title="Show Live Token Rate"
          description="Display real-time token throughput counter in header."
          control={
            <Switch
              checked={Boolean(settings.showLiveTokenRate)}
              onCheckedChange={(checked) => updateSettings({ showLiveTokenRate: checked })}
            />
          }
        />

        {settings.showLiveTokenRate && (
          <SettingRow
            title="Live Token Rate Scope"
            description="Scope of devices included in live throughput rate."
            control={
              <select
                value={settings.liveTokenRateScope || 'all'}
                onChange={(e) => updateSettings({ liveTokenRateScope: e.target.value as any })}
                className={selectClass}
              >
                <option value="all">All Synchronized Devices</option>
                <option value="device">This Device Only</option>
              </select>
            }
          />
        )}

        <SettingRow
          title="Compact Token Unit System"
          description="Unit formatting scale for large numbers."
          control={
            <select
              value={settings.compactTokenUnits || 'western'}
              onChange={(e) => updateSettings({ compactTokenUnits: e.target.value as any })}
              className={selectClass}
            >
              <option value="western">Western (1k, 1M, 1B)</option>
              <option value="localized">Localized (1万, 1亿)</option>
            </select>
          }
        />

        </SettingSection>

      <SettingSection title="Custom Theme & Vendor Colors" description="Color overrides for interface elements and model vendors.">
        <SettingRow
          title="Reset Theme Colors"
          description="Restore default accent and background colors."
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateSettings({ themeColors: {} })}
            >
              Reset theme
            </Button>
          }
        />

        <SettingRow
          title="Reset Vendor Colors"
          description="Restore default color coding for AI providers (OpenAI, Anthropic, Google, etc.)."
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateSettings({ vendorColors: {} })}
            >
              Reset vendor colors
            </Button>
          }
        />
      </SettingSection>
    </div>
  );
}
