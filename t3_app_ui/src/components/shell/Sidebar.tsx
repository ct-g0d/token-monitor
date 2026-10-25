import React, { useEffect, useState } from 'react';
import { Activity, Gauge, Server, Settings } from 'lucide-react';
import { getDeviceLabel } from '../../views/logicBridge';

export type MainView = 'usage' | 'limits' | 'status' | 'settings';

export const NAV_ITEMS = [
  { id: 'usage' as const, label: 'Usage', Icon: Activity },
  { id: 'limits' as const, label: 'Limits', Icon: Gauge },
  { id: 'status' as const, label: 'Status', Icon: Server },
];

interface Device {
  id: string;
  name: string;
  tokens: number;
  local: boolean;
  stale: boolean;
}

const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// Today's totals, live stream rate and synced devices, refreshed in the background
function useLive() {
  const [live, setLive] = useState({ tokens: 0, cost: 0, rate: 0, devices: [] as Device[] });

  useEffect(() => {
    const tm = window.tokenMonitor;
    if (!tm) return;

    const refreshStreamStatus = async () => {
      try {
        const stream = await tm.getStreamStatus?.();
        setLive((prev) => ({
          ...prev,
          rate: Number(stream?.ratePerSecond ?? 0),
        }));
      } catch {}
    };

    const applyStats = (raw: any) => {
      const stats = raw?.data?.stats ?? raw?.stats ?? (raw?.periods ? raw : null);
      if (!stats) return;
      const today = stats?.periods?.today ?? stats?.today;
      const localId = stats?.localDeviceId || stats?.settings?.deviceId || '';
      const devices: Device[] = (Array.isArray(stats?.devices) ? stats.devices : [])
        .map((d: any) => ({
          id: String(d.deviceId || ''),
          name: getDeviceLabel(d),
          tokens: Number(d.periods?.today?.totalTokens ?? d.today?.totalTokens ?? d.todayTokens ?? 0),
          local: Boolean((localId && d.deviceId === localId) || d.local),
          stale: Boolean(d.stale),
        }))
        .sort((a: Device, b: Device) => Number(b.local) - Number(a.local) || b.tokens - a.tokens);
      setLive((prev) => ({
        ...prev,
        tokens: Number(today?.totalTokens ?? today?.tokens ?? 0),
        cost: Number(today?.costUsd ?? today?.cost ?? 0),
        devices,
      }));
    };

    void refreshStreamStatus();
    tm.getStats?.().then((s: any) => s && applyStats(s)).catch(() => {});

    const off = tm.onStatsPush?.((payload: any) => {
      if (!payload) return;
      if (payload.event === 'status') {
        void refreshStreamStatus();
        return;
      }
      applyStats(payload);
    });

    return () => {
      off?.();
    };
  }, []);

  return live;
}

function NavButton({
  on,
  onClick,
  Icon,
  label,
  tab,
}: {
  on: boolean;
  onClick: () => void;
  Icon: typeof Activity;
  label: string;
  tab: string;
}) {
  return (
    <button
      type="button"
      data-tab={tab}
      onClick={onClick}
      className={`relative flex h-9 w-full items-center gap-3 px-3 text-left text-[13px] transition-colors ${
        on ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`absolute inset-y-2 left-0 w-[3px] transition-colors ${on ? 'bg-[var(--tm-signal)]' : 'bg-transparent'}`} />
      <Icon size={15} strokeWidth={on ? 2.25 : 1.75} />
      {label}
    </button>
  );
}

export function Sidebar({ active, onSelect }: { active: MainView; onSelect: (view: MainView) => void }) {
  const live = useLive();

  return (
    <aside className="absolute inset-y-0 left-0 z-40 flex w-[216px] flex-col border-r border-border bg-[var(--tm-sidebar)] select-none">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4 [-webkit-app-region:drag]">
        <span className="size-2.5 bg-foreground" />
        <span className="tm-label !text-[11px] !text-foreground">Token Monitor</span>
      </div>

      <nav className="flex flex-col">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <NavButton key={id} tab={id} on={id === active} onClick={() => onSelect(id)} Icon={Icon} label={label} />
        ))}
      </nav>

      <div className="mx-4 mt-8 flex flex-col gap-2 border-t border-border pt-4">
        <span className="tm-label flex items-center justify-between">
          Today
          <span className="flex items-center gap-1.5">
            <span className={`size-1.5 ${live.rate > 0 ? 'animate-pulse bg-[var(--tm-signal)]' : 'bg-muted-foreground/40'}`} />
            {live.rate > 0 ? `${live.rate.toFixed(1)}/s` : 'idle'}
          </span>
        </span>
        <span className="tabular-nums text-[44px] leading-[0.85] font-bold">{compact(live.tokens)}</span>
        <span className="tabular-nums text-[15px] text-muted-foreground">${live.cost.toFixed(2)}</span>
      </div>

      <div className="mt-auto flex flex-col pb-2">
        {live.devices.length > 0 && (
          <div className="mx-4 mb-2 flex flex-col gap-px border-t border-border pt-3">
            <span className="tm-label pb-1.5">Devices</span>
            {live.devices.map((d) => (
              <div key={d.id} className="flex h-6 items-center gap-2 text-[12px]" title={d.local ? 'This device' : d.stale ? 'Not seen recently' : undefined}>
                <span className={`size-1.5 shrink-0 ${d.stale ? 'bg-muted-foreground/40' : 'bg-[var(--tm-signal)]'}`} />
                <span className="min-w-0 flex-1 truncate">
                  {d.name}
                  {d.local && <span className="text-muted-foreground"> · this</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">{compact(d.tokens)}</span>
              </div>
            ))}
          </div>
        )}
        <NavButton tab="settings" on={active === 'settings'} onClick={() => onSelect('settings')} Icon={Settings} label="Settings" />
      </div>
    </aside>
  );
}
