import React from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import type { TokenMonitorSettingsState } from './types';
import { fontSettingsApi } from './fontSettingsBridge';

interface AppearanceSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AppearanceSettings({ settings, updateSettings }: AppearanceSettingsProps) {
  // Unified font preset resolution via shared fontSettingsApi
  const interfaceFont = settings.interfaceFontFamily || '';
  const displayFont = settings.displayFontFamily || '';
  const rawFont =
    interfaceFont ||
    (displayFont && !displayFont.includes('SF Pro Display') ? displayFont : '');
  const activePreset = fontSettingsApi.presetForFontFamily(rawFont, 'interface');

  const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent);
  const isWindows = typeof navigator !== 'undefined' && /Windows NT/.test(navigator.userAgent);
  const isOtherPlatform = !isWindows && !isMac;

  const systemGlassEnabled = settings.systemGlass !== false;
  const showWindowsBackdrop = systemGlassEnabled && (isWindows || isOtherPlatform);
  const showMacBackdrop = systemGlassEnabled && (isMac || isOtherPlatform);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Theme & Glass Effects"
        description="Window materials, transparency, and background filters."
      >
        <SettingRow
          title="Native System Material"
          description={
            systemGlassEnabled
              ? "Use OS native frosted glass or acrylic backdrop material."
              : "Native material disabled. Using transparent window background."
          }
          control={
            <Switch
              checked={systemGlassEnabled}
              onCheckedChange={(checked) => updateSettings({ systemGlass: checked })}
            />
          }
        />

        {showWindowsBackdrop && (
          <SettingRow
            title="Windows Glass Style"
            description={
              settings.windowsBackdrop === 'accent'
                ? "Accent Blur (experimental): keeps backdrop translucent and blurred even when unfocused."
                : "Surface composition style when running on Windows 11 / 10."
            }
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
        )}

        {showMacBackdrop && (
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
        )}

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
                value={settings.glassOpacity ?? 68}
                onChange={(e) => updateSettings({ glassOpacity: parseInt(e.target.value, 10) })}
                className="w-28 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8 tabular-nums">
                {settings.glassOpacity ?? 68}%
              </span>
              {settings.glassOpacity !== undefined && settings.glassOpacity !== 68 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Reset to default (68%)"
                  onClick={() => updateSettings({ glassOpacity: 68 })}
                >
                  ↺
                </Button>
              )}
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
                value={settings.glassBlur ?? 32}
                onChange={(e) => updateSettings({ glassBlur: parseInt(e.target.value, 10) })}
                className="w-28 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8 tabular-nums">
                {settings.glassBlur ?? 32}%
              </span>
              {settings.glassBlur !== undefined && settings.glassBlur !== 32 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Reset to default (32%)"
                  onClick={() => updateSettings({ glassBlur: 32 })}
                >
                  ↺
                </Button>
              )}
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
              <span className="text-xs text-muted-foreground w-10 tabular-nums">
                {Math.round((settings.zoomFactor ?? 1.0) * 100)}%
              </span>
              {settings.zoomFactor !== undefined && settings.zoomFactor !== 1.0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Reset to default (100%)"
                  onClick={() => updateSettings({ zoomFactor: 1.0 })}
                >
                  ↺
                </Button>
              )}
            </div>
          }
        />
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
          title="Font Family"
          description="Primary font family applied across interface labels, metrics, and displays."
          control={
            <div className="flex flex-col gap-1.5 items-end">
              <div className="flex items-center gap-1.5">
                <select
                  value={activePreset}
                  onChange={(e) => {
                    const preset = e.target.value;
                    const family = fontSettingsApi.fontFamilyForPreset(preset, rawFont, 'interface');
                    updateSettings({
                      interfaceFontFamily: family,
                      displayFontFamily: family,
                    });
                  }}
                  className={selectClass}
                >
                  <option value="app">App Default</option>
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                  <option value="custom">Custom font...</option>
                </select>
                {activePreset !== 'app' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    title="Reset to default"
                    onClick={() => {
                      const family = fontSettingsApi.fontFamilyForPreset('app', '', 'interface');
                      updateSettings({
                        interfaceFontFamily: family,
                        displayFontFamily: family,
                      });
                    }}
                  >
                    ↺
                  </Button>
                )}
              </div>
              {activePreset === 'custom' && (
                <Input
                  placeholder="e.g. Inter, Roboto, Cascadia Code"
                  value={rawFont}
                  onChange={(e) => {
                    const val = fontSettingsApi.fontFamilyForPreset('custom', e.target.value, 'interface');
                    updateSettings({
                      interfaceFontFamily: val,
                      displayFontFamily: val,
                    });
                  }}
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
