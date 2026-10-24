import React, { useState, useEffect } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState } from './types';

interface SyncSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function SyncSettings({ settings, updateSettings, refreshSettings }: SyncSettingsProps) {
  const [devices, setDevices] = useState<any[]>([]);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (!tm) return;

    if (tm.getStats) {
      tm.getStats().then((stats: any) => {
        if (stats?.devices) setDevices(stats.devices);
      }).catch(() => {});
    }
  }, []);

  const handleRegenerateSecret = async () => {
    setRegeneratingSecret(true);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.regenerateHubSecret) {
        const res = await window.tokenMonitor.regenerateHubSecret();
        if (res?.secret) {
          await updateSettings({ hubHostSecret: res.secret });
          await refreshSettings();
        }
      }
    } finally {
      setRegeneratingSecret(false);
    }
  };

  const handleCopySecret = (secret: string) => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.copyText) {
      window.tokenMonitor.copyText(secret);
    } else {
      navigator.clipboard?.writeText(secret);
    }
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.deleteDevice) {
      await window.tokenMonitor.deleteDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Sync Strategy" description="Synchronize tokens and limits across multiple machines.">
        <SettingRow
          title="Hub Mode"
          description="Local machine only, connect to an existing Hub, host your own Hub, or sync via iCloud."
          control={
            <select
              value={settings.hubMode || 'local'}
              onChange={(e) => updateSettings({ hubMode: e.target.value as any })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="local">Local Only (Disabled)</option>
              <option value="client">Connect to Hub (Client)</option>
              <option value="host">Host Token Monitor Hub (Server)</option>
              <option value="icloud">Apple iCloud Drive (macOS/iOS)</option>
            </select>
          }
        />

        <SettingRow
          title="Device Name"
          description="Identifier shown on other synchronized devices."
          control={
            <Input
              placeholder="e.g. Work PC"
              value={settings.deviceId || ''}
              onChange={(e) => updateSettings({ deviceId: e.target.value })}
              className="h-8 w-44 text-xs"
            />
          }
        />

        <SettingRow
          title="Sync Session Titles"
          description="Share prompt session titles and workspace names between devices."
          control={
            <Switch
              checked={settings.hubSyncSessionTitles !== false}
              onCheckedChange={(checked) => updateSettings({ hubSyncSessionTitles: checked })}
            />
          }
        />
      </SettingSection>

      {/* Client Configuration */}
      {settings.hubMode === 'client' && (
        <SettingSection title="Hub Client Connection" description="Connect to an active Token Monitor host on your LAN or VPN.">
          <SettingRow
            title="Hub Server Address"
            description="URL of the central host (e.g. http://192.168.1.100:3080)."
            control={
              <Input
                placeholder="http://192.168.1.100:3080"
                value={settings.hubUrl || ''}
                onChange={(e) => updateSettings({ hubUrl: e.target.value })}
                className="h-8 w-60 text-xs"
              />
            }
          />

          <SettingRow
            title="Shared Hub Secret"
            description="Secret passphrase configured on the host server."
            control={
              <Input
                type="password"
                placeholder="Secret key"
                value={settings.hubHostSecret || ''}
                onChange={(e) => updateSettings({ hubHostSecret: e.target.value })}
                className="h-8 w-60 text-xs"
              />
            }
          />

          <SettingRow
            title="Upload Frequency"
            description="Interval between data upload syncing to the Hub."
            control={
              <select
                value={String(settings.syncUploadIntervalMs ?? 0)}
                onChange={(e) => updateSettings({ syncUploadIntervalMs: parseInt(e.target.value, 10) })}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="0">Live (Real-time)</option>
                <option value="600000">Every 10 minutes</option>
                <option value="1200000">Every 20 minutes</option>
                <option value="1800000">Every 30 minutes</option>
              </select>
            }
          />
        </SettingSection>
      )}

      {/* Host Configuration */}
      {settings.hubMode === 'host' && (
        <SettingSection title="Hub Host Server" description="Host a local sync server for other devices on your network.">
          <SettingRow
            title="Server Listening Port"
            description="Port number for incoming HTTP connections."
            control={
              <Input
                type="number"
                value={settings.hubHostPort || 3080}
                onChange={(e) => updateSettings({ hubHostPort: parseInt(e.target.value, 10) || 3080 })}
                className="h-8 w-24 text-xs"
              />
            }
          />

          <SettingRow
            title="Host Shared Secret"
            description="Share this secret key with client machines to pair them."
            control={
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  type="password"
                  value={settings.hubHostSecret || '••••••••'}
                  className="h-8 w-36 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopySecret(settings.hubHostSecret || '')}
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={regeneratingSecret}
                  onClick={handleRegenerateSecret}
                >
                  {regeneratingSecret ? <Spinner className="size-3 mr-1" /> : null}
                  Regenerate
                </Button>
              </div>
            }
          />
        </SettingSection>
      )}

      {/* Connected Devices */}
      {devices.length > 0 && (
        <SettingSection title="Synchronized Devices" description="Devices currently paired and sharing token logs.">
          <div className="p-3 space-y-2">
            {devices.map((dev) => (
              <div key={dev.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{dev.name || dev.id}</span>
                    {dev.os && <span className="text-2xs text-muted-foreground capitalize">({dev.os})</span>}
                  </div>
                  <div className="text-2xs text-muted-foreground mt-0.5">
                    {dev.lastSeen ? `Last seen: ${new Date(dev.lastSeen).toLocaleString()}` : 'Online'}
                    {dev.ip ? ` · IP: ${dev.ip}` : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-destructive hover:bg-destructive/10 text-xs"
                  onClick={() => handleDeleteDevice(dev.id)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        </SettingSection>
      )}
    </div>
  );
}
