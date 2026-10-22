import React, { useState, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, Toggle } from '~/components/ui/toggle-group';
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Laptop,
  Monitor,
  Trash2,
  RefreshCw,
  Clock,
  Radio,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import {
  getDeviceBreakdown,
  getDeviceLabel,
  getDevicePlatformLabel,
} from './logicBridge';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'last7', label: '7D' },
  { id: 'last30', label: '30D' },
  { id: 'allTime', label: 'All Time' },
];

interface DeviceRowItem {
  deviceId: string;
  name: string;
  hostname: string;
  platform: string;
  platformLabel: string;
  osName: string;
  osVersion: string;
  agentVersion: string;
  receivedAt: string;
  tokens: number;
  cost: number;
  stale: boolean;
  isLocal: boolean;
  tools?: any[];
}

interface SyncStatusData {
  enabled?: boolean;
  hubConfigured?: boolean;
  hubUrl?: string;
  lastSyncedAt?: string;
}

export function DevicesView() {
  const [period, setPeriod] = useState<string>('today');
  const [devices, setDevices] = useState<DeviceRowItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceToDelete, setDeviceToDelete] = useState<DeviceRowItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchDevices = async (currentPeriod: string) => {
    setLoading(true);
    try {
      if (typeof window === 'undefined' || !window.tokenMonitor) return;
      const stats = await window.tokenMonitor.getStats();
      const rawDevices = Array.isArray(stats?.devices) ? stats.devices : [];
      const localId = stats?.localDeviceId || stats?.settings?.deviceId || '';

      const list: DeviceRowItem[] = rawDevices.map((d: any) => {
        const isLocal = Boolean(localId && d.deviceId === localId);
        const breakdown = getDeviceBreakdown(d, currentPeriod);
        const periodData = d.periods?.[currentPeriod] || {};

        let tokens = breakdown.totalTokens || Number(periodData.totalTokens || periodData.tokens || 0);
        let cost = Number(periodData.costUsd || periodData.cost || 0);

        // Fallback for local device if device.periods was not populated but stats.periods has live data
        if (tokens === 0 && isLocal && stats?.periods?.[currentPeriod]) {
          tokens = Number(stats.periods[currentPeriod].totalTokens || 0);
          cost = Number(stats.periods[currentPeriod].costUsd || 0);
        }

        const name = getDeviceLabel(d);
        const platformLabel = getDevicePlatformLabel(d.platform, d.osName, d.osVersion);

        return {
          deviceId: String(d.deviceId || ''),
          name,
          hostname: d.hostname || '',
          platform: d.platform || '',
          platformLabel,
          osName: d.osName || '',
          osVersion: d.osVersion || '',
          agentVersion: d.agentVersion || '',
          receivedAt: d.receivedAt || d.updatedAt || '',
          tokens,
          cost,
          stale: Boolean(d.stale),
          isLocal,
          tools: breakdown.tools,
        };
      });

      // Sort: local device first, then by tokens descending, then by recent sync
      list.sort((a, b) => {
        if (a.isLocal) return -1;
        if (b.isLocal) return 1;
        if (a.tokens !== b.tokens) return b.tokens - a.tokens;
        if (a.stale !== b.stale) return a.stale ? 1 : -1;
        return (Date.parse(b.receivedAt || '') || 0) - (Date.parse(a.receivedAt || '') || 0);
      });

      setDevices(list);

      if (window.tokenMonitor.getSyncContentStatus) {
        const status = await window.tokenMonitor.getSyncContentStatus(false);
        setSyncStatus(status || null);
      }
    } catch (err) {
      console.error('[DevicesView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices(period);
  }, [period]);

  const confirmDeleteDevice = async () => {
    if (!deviceToDelete || !window.tokenMonitor?.deleteDevice) return;
    setDeleting(true);
    try {
      await window.tokenMonitor.deleteDevice(deviceToDelete.deviceId);
      setDeviceToDelete(null);
      await fetchDevices(period);
    } catch (err) {
      console.error('[DevicesView] delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  const formatTokens = (val: number) => {
    return Math.round(val).toLocaleString('en-US');
  };

  const formatCost = (val: number) => {
    if (val <= 0) return '$0.00';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  };

  const formatTime = (tsStr?: string) => {
    if (!tsStr) return 'Never';
    const ms = Date.parse(tsStr);
    if (!Number.isFinite(ms)) return 'Unknown';
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground select-text">
      {/* View Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-border/30 bg-card/20">
        <div className="flex items-center gap-2">
          {/* Genuine T3 Segmented Period Selector */}
          <ToggleGroup
            aria-label="Device period"
            variant="segmented"
            value={[period]}
            onValueChange={(next) => {
              const val = next[0];
              if (val) setPeriod(val);
            }}
          >
            {PERIOD_OPTIONS.map((p) => (
              <Toggle key={p.id} value={p.id} className="px-2.5 text-xs">
                {p.label}
              </Toggle>
            ))}
          </ToggleGroup>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchDevices(period)}
            disabled={loading}
            title="Refresh devices"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Radio className="size-3 text-emerald-500 animate-pulse" />
            <span className="font-medium text-foreground">
              {syncStatus?.hubConfigured ? 'Connected to Token Hub' : 'Local Standalone Mode'}
            </span>
            {syncStatus?.hubUrl && (
              <span className="font-mono text-[11px] truncate max-w-xs opacity-75">
                ({syncStatus.hubUrl})
              </span>
            )}
          </div>
          <span>&middot;</span>
          <span>
            {devices.length} {devices.length === 1 ? 'device' : 'devices'} registered
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="mr-2 size-4 animate-spin" /> Loading synced devices...
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border/40 rounded-xl bg-card/20 p-8">
            <Monitor className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No synced devices found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Connect multiple machines to the same Token Hub to see usage synced across devices.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 rounded-xl border border-border/30 bg-card/20">
            <div className="divide-y divide-border/20">
              {devices.map((d) => (
                <div
                  key={d.deviceId}
                  className="device-item flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-muted/20 transition-colors"
                  data-device-id={d.deviceId}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {d.platform === 'darwin' ? (
                        <Laptop className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Monitor className="size-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-semibold text-xs text-foreground truncate">
                        {d.name}
                      </span>
                      {d.isLocal && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-medium text-emerald-500 border-emerald-500/30">
                          <ShieldCheck className="size-3" /> This Device
                        </Badge>
                      )}
                      {d.stale ? (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                          Offline
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                          Active
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="font-mono text-[11px] truncate max-w-xs">{d.deviceId}</span>
                      {d.platformLabel && <span>{d.platformLabel}</span>}
                      {d.agentVersion && <span>v{d.agentVersion}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3 opacity-60" />
                        Synced {formatTime(d.receivedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/20">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-foreground">
                        {formatTokens(d.tokens)}{' '}
                        <span className="text-[10px] font-normal text-muted-foreground">tok</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {formatCost(d.cost)}
                      </div>
                    </div>

                    {!d.isLocal && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeviceToDelete(d)}
                        title="Remove device record"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(deviceToDelete)}
        onOpenChange={(open) => !open && setDeviceToDelete(null)}
      >
        <DialogPopup className="max-w-md p-6 bg-card border border-border/40 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Remove Device</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-xs text-muted-foreground space-y-2">
            <p>
              Are you sure you want to remove the record for{' '}
              <strong className="text-foreground">{deviceToDelete?.name}</strong>?
            </p>
            <p className="text-[11px] opacity-80">
              If the device is still active, it will automatically reappear next time it syncs with Token Hub.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeviceToDelete(null)}
              disabled={deleting}
              className="text-xs h-7"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={confirmDeleteDevice}
              disabled={deleting}
              className="text-xs h-7"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
