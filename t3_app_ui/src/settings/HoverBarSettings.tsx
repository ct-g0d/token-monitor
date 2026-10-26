import React from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import type { TokenMonitorSettingsState } from './types';

interface HoverBarSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function HoverBarSettings({ settings, updateSettings }: HoverBarSettingsProps) {
  const isEnabled = Boolean(settings.edgeDockEnabled);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Hover Bar"
        description="A slim interactive quota rail docked to the screen edge. Push cursor to screen edge to reveal, hover quota tiles for detailed breakdown cards, or click to pin."
      >
        <SettingRow
          title="Enable Hover Bar"
          description="Dock an interactive quota rail and usage readout to your display edge."
          control={
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => updateSettings({ edgeDockEnabled: checked })}
            />
          }
        />

        {isEnabled && (
          <>
            <SettingRow
              title="Visibility Mode"
              description="When the quota rail should stay visible or slide away."
              control={
                <select
                  value={settings.edgeDockMode || 'autoHide'}
                  onChange={(e) => updateSettings({ edgeDockMode: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="autoHide">Auto-hide</option>
                  <option value="always">Always visible</option>
                  <option value="alwaysExceptFullScreen">Fullscreen auto-hide</option>
                </select>
              }
            />

            <SettingRow
              title="Screen Edge"
              description="Which side of the display to anchor the rail against."
              control={
                <select
                  value={settings.edgeDockSide || 'right'}
                  onChange={(e) => updateSettings({ edgeDockSide: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              }
            />

            <SettingRow
              title="Size Preset"
              description="Choose size scale or specify custom dimension."
              control={
                <select
                  value={settings.edgeDockSize || 'medium'}
                  onChange={(e) => updateSettings({ edgeDockSize: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="custom">Custom...</option>
                </select>
              }
            />

            {settings.edgeDockSize === 'custom' && (
              <SettingRow
                title="Custom Scale"
                description="Fine-tune Edge Dock scale between 75% and 150%."
                control={
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.75"
                      max="1.50"
                      step="0.05"
                      value={settings.edgeDockCustomScale || 1.0}
                      onChange={(e) => updateSettings({ edgeDockCustomScale: parseFloat(e.target.value) })}
                      className="w-24 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground w-8 tabular-nums">
                      {Math.round((settings.edgeDockCustomScale || 1.0) * 100)}%
                    </span>
                  </div>
                }
              />
            )}

            <SettingRow
              title="Glass Style (macOS)"
              description="Backdrop material effect for the dock rail on macOS."
              control={
                <select
                  value={settings.edgeDockMacBackdrop || 'inherit'}
                  onChange={(e) => updateSettings({ edgeDockMacBackdrop: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="inherit">Same as widget</option>
                  <option value="vibrancy">Frosted Glass</option>
                  <option value="liquid-glass">Liquid Glass (Regular)</option>
                </select>
              }
            />

            <SettingRow
              title="Highlight Low Limits in Colour"
              description="Colorize warnings when quota levels run low."
              control={
                <Switch
                  checked={Boolean(settings.edgeDockWarnColors)}
                  onCheckedChange={(checked) => updateSettings({ edgeDockWarnColors: checked })}
                />
              }
            />

            <SettingRow
              title="Show Running Indicator"
              description="Display pulse dot when LLM models are actively running."
              control={
                <Switch
                  checked={settings.edgeDockRunningIndicatorEnabled !== false}
                  onCheckedChange={(checked) => updateSettings({ edgeDockRunningIndicatorEnabled: checked })}
                />
              }
            />

            <SettingRow
              title="Haptic Feedback"
              description="Vibrate trackpad gently on edge interactions."
              control={
                <Switch
                  checked={settings.edgeDockHaptic !== false}
                  onCheckedChange={(checked) => updateSettings({ edgeDockHaptic: checked })}
                />
              }
            />

            <SettingRow
              title="Dock Items Composer"
              description={settings.edgeDockItems ? "Custom items list is active." : "Automatic: dynamically follows active quotas and metrics."}
              control={
                settings.edgeDockItems ? (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => updateSettings({ edgeDockItems: null })}
                  >
                    Reset to automatic
                  </Button>
                ) : (
                  <span className="text-2xs text-muted-foreground">Automatic</span>
                )
              }
            />
          </>
        )}
      </SettingSection>
    </div>
  );
}
