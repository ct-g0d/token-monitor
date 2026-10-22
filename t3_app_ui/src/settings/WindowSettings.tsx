import React, { useState } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import type { TokenMonitorSettingsState } from './types';

interface WindowSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

export function WindowSettings({ settings, updateSettings }: WindowSettingsProps) {
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutText, setShortcutText] = useState(settings.windowToggleShortcut || '');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recordingShortcut) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecordingShortcut(false);
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');

    const key = e.key.toUpperCase();
    if (!['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) {
      parts.push(key);
      const combined = parts.join('+');
      setShortcutText(combined);
      updateSettings({ windowToggleShortcut: combined });
      setRecordingShortcut(false);
    }
  };

  const handleClearShortcut = () => {
    setShortcutText('');
    updateSettings({ windowToggleShortcut: '' });
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Window Placement" description="Configure positioning and system level behavior.">
        <SettingRow
          title="Window Behavior"
          description="Desktop pinned keeps the widget below other apps and locks drag/resize while staying clickable."
          control={
            <select
              value={settings.windowBehavior || (settings.alwaysOnTop ? 'floating' : 'normal')}
              onChange={(e) => {
                const val = e.target.value as 'floating' | 'normal' | 'desktop';
                updateSettings({ ['windowBehavior']: val });
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="floating">Floating above apps</option>
              <option value="normal">Normal window</option>
              <option value="desktop">Desktop pinned</option>
            </select>
          }
        />

        <SettingRow
          title="Keep Above Taskbar"
          description="Prevent Windows taskbar from covering the bottom of the window in floating mode."
          control={
            <Switch
              checked={Boolean(settings.keepAboveTaskbar)}
              onCheckedChange={(checked) => updateSettings({ keepAboveTaskbar: checked })}
            />
          }
        />

        <SettingRow
          title="Global Toggle Shortcut"
          description={settings.windowToggleShortcutStatus || "Global key combination to quickly show or hide Token Monitor."}
          control={
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={recordingShortcut ? 'Press shortcut...' : (shortcutText || 'None')}
                onKeyDown={handleKeyDown}
                onClick={() => setRecordingShortcut(true)}
                className={`h-8 w-36 text-xs text-center cursor-pointer ${
                  recordingShortcut ? 'ring-2 ring-primary border-primary' : ''
                }`}
              />
              {shortcutText ? (
                <Button variant="ghost" size="sm" onClick={handleClearShortcut} className="text-xs h-8 px-2">
                  Clear
                </Button>
              ) : null}
            </div>
          }
        />
      </SettingSection>

      <SettingSection title="Edge Dock" description="A slim quota rail docked to the screen edge. Push cursor to edge to reveal, click to pin.">
        <SettingRow
          title="Enable Edge Dock"
          description="Show an interactive quota rail pinned to your screen edge."
          control={
            <Switch
              checked={Boolean(settings.edgeDockEnabled)}
              onCheckedChange={(checked) => updateSettings({ edgeDockEnabled: checked })}
            />
          }
        />

        {settings.edgeDockEnabled && (
          <>
            <SettingRow
              title="Visibility Mode"
              description="When the quota rail should stay visible or slide away."
              control={
                <select
                  value={settings.edgeDockMode || 'autoHide'}
                  onChange={(e) => updateSettings({ edgeDockMode: e.target.value as any })}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <span className="text-xs text-muted-foreground w-8">
                      {Math.round((settings.edgeDockCustomScale || 1.0) * 100)}%
                    </span>
                  </div>
                }
              />
            )}

            <SettingRow
              title="Glass Style"
              description="Backdrop material effect for the dock rail."
              control={
                <select
                  value={settings.edgeDockMacBackdrop || 'inherit'}
                  onChange={(e) => updateSettings({ edgeDockMacBackdrop: e.target.value as any })}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="inherit">Same as widget</option>
                  <option value="vibrancy">Frosted Glass</option>
                  <option value="liquid-glass">Liquid Glass</option>
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
          </>
        )}
      </SettingSection>

      <SettingSection title="Floating Bubble" description="Collapse widget into a slim draggable mini-window; click to reopen.">
        <SettingRow
          title="Enable Floating Bubble"
          description="Minimal desktop floating token bubble."
          control={
            <Switch
              checked={Boolean(settings.floatingBubbleEnabled)}
              onCheckedChange={(checked) => updateSettings({ floatingBubbleEnabled: checked })}
            />
          }
        />

        {settings.floatingBubbleEnabled && (
          <>
            <SettingRow
              title="Open Trigger"
              description="How the bubble reveals the main interface."
              control={
                <select
                  value={settings.floatingBubbleTrigger || 'click'}
                  onChange={(e) => updateSettings({ floatingBubbleTrigger: e.target.value as 'click' | 'hover' })}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="click">Click</option>
                  <option value="hover">Hover (preview)</option>
                </select>
              }
            />

            <SettingRow
              title="Bubble Display Content"
              description="Metric readout rendered inside the compact bubble."
              control={
                <select
                  value={settings.floatingBubbleContent || 'icon'}
                  onChange={(e) => updateSettings({ floatingBubbleContent: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="icon">Icon only</option>
                  <option value="tokens">Tokens Today</option>
                  <option value="cost">Cost Today ($1.23)</option>
                  <option value="both">Tokens + Cost Today</option>
                  <option value="tokensAll">Tokens Total</option>
                  <option value="costAll">Cost Total ($8.28)</option>
                  <option value="bothAll">Tokens + Cost Total</option>
                  <option value="limitsAllSessions">Limits: primary quotas</option>
                  <option value="liveTokenRate">Live rate (tok/s)</option>
                  <option value="barsSession">Limit bars: lowest session remaining</option>
                  <option value="barsWeekly">Limit bars: lowest weekly remaining</option>
                  <option value="barsAllSessions">Limit bars: first two tools' primary quotas</option>
                  <option value="bars">Limit bars: lowest remaining limit</option>
                  <option value="custom">Custom...</option>
                </select>
              }
            />
          </>
        )}
      </SettingSection>

      <SettingSection title="System Tray & Menu Bar" description="Notification tray presence and miniature menu bar readout.">
        <SettingRow
          title="Tray-Only Mode"
          description="Hide the main taskbar window; run exclusively from the system tray."
          control={
            <Switch
              checked={Boolean(settings.trayMode)}
              onCheckedChange={(checked) => updateSettings({ trayMode: checked })}
            />
          }
        />

        <SettingRow
          title="Tray Content Text"
          description="Summary text shown next to the tray icon."
          control={
            <select
              value={settings.trayContent || 'tokens'}
              onChange={(e) => updateSettings({ trayContent: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="tokens">Tokens Today</option>
              <option value="cost">Cost Today ($1.23)</option>
              <option value="both">Tokens + Cost Today</option>
              <option value="tokensAll">Tokens Total</option>
              <option value="costAll">Cost Total ($8.28)</option>
              <option value="bothAll">Tokens + Cost Total</option>
              <option value="limitsAllSessions">Limits: primary quotas</option>
              <option value="liveTokenRate">Live rate (tok/s)</option>
              <option value="barsSession">Limit bars: lowest session remaining</option>
              <option value="barsWeekly">Limit bars: lowest weekly remaining</option>
              <option value="barsAllSessions">Limit bars: first two tools' primary quotas</option>
              <option value="bars">Limit bars: lowest remaining limit</option>
              <option value="icon">Icon only</option>
                  <option value="custom">Custom...</option>
            </select>
          }
        />

        <SettingRow
          title="Show Provider Badge"
          description="Display provider icon badges directly on the system tray."
          control={
            <Switch
              checked={Boolean(settings.showTrayProviderBadge)}
              onCheckedChange={(checked) => updateSettings({ showTrayProviderBadge: checked })}
            />
          }
        />

        <SettingRow
          title="Hide Taskbar / Dock Icon"
          description="Hide application icon from taskbar or Dock when main window is closed."
          control={
            <Switch
              checked={Boolean(settings.hideAppIcon)}
              onCheckedChange={(checked) => updateSettings({ hideAppIcon: checked })}
            />
          }
        />
      </SettingSection>
    </div>
  );
}
