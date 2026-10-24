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

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

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
                updateSettings({ windowBehavior: val });
              }}
              className={selectClass}
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
                    <span className="text-xs text-muted-foreground w-8">
                      {Math.round((settings.edgeDockCustomScale || 1.0) * 100)}%
                    </span>
                  </div>
                }
              />
            )}

            <SettingRow
              title="Windows Backdrop Material"
              description="Composition material when docked on Windows."
              control={
                <select
                  value={settings.edgeDockWindowsBackdrop || 'inherit'}
                  onChange={(e) => updateSettings({ edgeDockWindowsBackdrop: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="inherit">Same as widget</option>
                  <option value="acrylic">Acrylic</option>
                  <option value="mica">Mica</option>
                  <option value="tabbed">Tabbed</option>
                </select>
              }
            />

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
                  <option value="liquid-glass-clear">Liquid Glass (Clear)</option>
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

      <SettingSection title="Notch Panel (Experimental)" description="A compact display notch or pill interface anchored to the top of the screen (macOS).">
        <SettingRow
          title="Enable Notch Panel"
          description="Display live metrics in the screen notch area."
          control={
            <Switch
              checked={Boolean(settings.notchEnabled)}
              onCheckedChange={(checked) => updateSettings({ notchEnabled: checked })}
            />
          }
        />

        {settings.notchEnabled && (
          <>
            <SettingRow
              title="Hover Action"
              description="Behavior when pointer moves over the notch."
              control={
                <select
                  value={settings.notchHoverAction || 'peek'}
                  onChange={(e) => updateSettings({ notchHoverAction: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="peek">Grow (Peek preview)</option>
                  <option value="open">Open (Reveal card)</option>
                </select>
              }
            />

            {settings.notchHoverAction === 'open' && (
              <SettingRow
                title="Hover Delay"
                description="Delay before revealing notch card on hover (ms)."
                control={
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="2000"
                      step="100"
                      value={settings.notchHoverDelay ?? 0}
                      onChange={(e) => updateSettings({ notchHoverDelay: parseInt(e.target.value, 10) })}
                      className="w-24 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground w-12">
                      {((settings.notchHoverDelay ?? 0) / 1000).toFixed(1)}s
                    </span>
                  </div>
                }
              />
            )}

            <SettingRow
              title="Entry Shape"
              description="Geometric contour of the notch indicator."
              control={
                <select
                  value={settings.notchShape || 'auto'}
                  onChange={(e) => updateSettings({ notchShape: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="auto">Auto (Detect hardware)</option>
                  <option value="notch">MacBook Notch</option>
                  <option value="pill">Floating Pill</option>
                </select>
              }
            />

            <SettingRow
              title="Notch Size"
              description="Scale dimension of the notch presence."
              control={
                <select
                  value={settings.notchSize || 'medium'}
                  onChange={(e) => updateSettings({ notchSize: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="custom">Custom...</option>
                </select>
              }
            />

            {settings.notchSize === 'custom' && (
              <SettingRow
                title="Custom Notch Scale"
                description="Scale size between 75% and 150%."
                control={
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.75"
                      max="1.50"
                      step="0.05"
                      value={settings.notchCustomScale || 1.0}
                      onChange={(e) => updateSettings({ notchCustomScale: parseFloat(e.target.value) })}
                      className="w-24 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground w-8">
                      {Math.round((settings.notchCustomScale || 1.0) * 100)}%
                    </span>
                  </div>
                }
              />
            )}

            <SettingRow
              title="Notch Glass Style"
              description="Visual backdrop material formulation."
              control={
                <select
                  value={settings.notchStyle || 'inherit'}
                  onChange={(e) => updateSettings({ notchStyle: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="inherit">Same as widget</option>
                  <option value="black">Pure Black</option>
                  <option value="vibrancy">Frosted Glass</option>
                  <option value="liquid-glass">Liquid Glass</option>
                  <option value="liquid-glass-clear">Liquid Glass (Clear)</option>
                </select>
              }
            />

            <SettingRow
              title="Progressive Blur"
              description="Soften wallpaper behind the notch card."
              control={
                <Switch
                  checked={settings.notchProgressiveBlur !== false}
                  onCheckedChange={(checked) => updateSettings({ notchProgressiveBlur: checked })}
                />
              }
            />

            <SettingRow
              title="Show Collapsed Summary"
              description="Display compact status readout while notch is closed."
              control={
                <Switch
                  checked={settings.notchSummaryEnabled !== false}
                  onCheckedChange={(checked) => updateSettings({ notchSummaryEnabled: checked })}
                />
              }
            />

            <SettingRow
              title="Hide in Full Screen"
              description="Hide notch summary when other applications enter full screen."
              control={
                <Switch
                  checked={settings.notchHideSummaryInFullScreen !== false}
                  onCheckedChange={(checked) => updateSettings({ notchHideSummaryInFullScreen: checked })}
                />
              }
            />

            <SettingRow
              title="Activity & Quota Rings"
              description="Show glowing rings around icons for active and warning states."
              control={
                <Switch
                  checked={Boolean(settings.notchRunningIndicatorEnabled)}
                  onCheckedChange={(checked) => updateSettings({ notchRunningIndicatorEnabled: checked })}
                />
              }
            />

            <SettingRow
              title="Highlight Low Limits in Colour"
              description="Use alert colors for quotas nearing threshold."
              control={
                <Switch
                  checked={Boolean(settings.notchWarnColors)}
                  onCheckedChange={(checked) => updateSettings({ notchWarnColors: checked })}
                />
              }
            />

            <SettingRow
              title="Trackpad Haptics"
              description="Provide tactile clicks when interacting with the notch."
              control={
                <Switch
                  checked={settings.notchHaptic !== false}
                  onCheckedChange={(checked) => updateSettings({ notchHaptic: checked })}
                />
              }
            />

            <SettingRow
              title="Swipe Gestures"
              description="Navigate pages and dismiss cards with trackpad swipes."
              control={
                <Switch
                  checked={settings.notchSwipeGestures !== false}
                  onCheckedChange={(checked) => updateSettings({ notchSwipeGestures: checked })}
                />
              }
            />

            <SettingRow
              title="Summary Mode"
              description="Metrics shown when the notch is resting."
              control={
                <select
                  value={settings.notchSummaryMode || 'sessions'}
                  onChange={(e) => updateSettings({ notchSummaryMode: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="sessions">Session activity only</option>
                  <option value="auto">Automatic</option>
                  <option value="tray">Same as tray</option>
                  <option value="custom">Custom</option>
                </select>
              }
            />

            <SettingRow
              title="Notch Items"
              description={settings.notchItems ? "Custom items list is active." : "Automatic: follows limits and sessions."}
              control={
                settings.notchItems ? (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => updateSettings({ notchItems: null })}
                  >
                    Reset to automatic
                  </Button>
                ) : (
                  <span className="text-2xs text-muted-foreground">Automatic</span>
                )
              }
            />

            {settings.notchSummaryMode === 'custom' && (
              <SettingRow
                title="Notch Custom Layout"
                description="Custom items layout active for notch summary."
                control={
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => updateSettings({ notchCustomLayout: undefined })}
                  >
                    Reset custom layout
                  </Button>
                }
              />
            )}
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
                  className={selectClass}
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
                  className={selectClass}
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

            {settings.floatingBubbleContent === 'custom' && (
              <SettingRow
                title="Bubble Custom Layout"
                description="Custom items composer layout for floating bubble."
                control={
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => updateSettings({ floatingBubbleCustomLayout: undefined })}
                  >
                    Reset layout
                  </Button>
                }
              />
            )}
          </>
        )}
      </SettingSection>

      <SettingSection title="System Tray & Menu Bar" description="Notification tray presence and miniature menu bar readout.">
        <SettingRow
          title="Show Tray / Menu Bar Icon"
          description="Display status icon in the system notification area."
          control={
            <Switch
              checked={settings.showTrayIcon !== false}
              onCheckedChange={(checked) => updateSettings({ showTrayIcon: checked })}
            />
          }
        />

        {settings.showTrayIcon !== false && (
          <>
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
              title="Hide Taskbar / Dock Icon"
              description="Hide application icon from taskbar or Dock when main window is closed."
              control={
                <Switch
                  checked={Boolean(settings.hideAppIcon)}
                  onCheckedChange={(checked) => updateSettings({ hideAppIcon: checked })}
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
                  className={selectClass}
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

            {settings.trayContent === 'custom' && (
              <SettingRow
                title="Tray Custom Layout"
                description="Custom items layout configured for the tray readout."
                control={
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => updateSettings({ trayCustomLayout: undefined })}
                  >
                    Reset layout
                  </Button>
                }
              />
            )}

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
          </>
        )}
      </SettingSection>
    </div>
  );
}
