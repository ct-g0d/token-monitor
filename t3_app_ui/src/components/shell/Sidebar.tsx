import React, { useEffect, useState } from 'react';
import { Activity, Gauge, Server, Settings } from 'lucide-react';
import { getDeviceLabel } from '../../views/logicBridge';
import { t } from '@/i18n';

export type MainView = 'usage' | 'limits' | 'status' | 'settings';

export const NAV_ITEMS = [
  { id: 'usage' as const, label: 'Usage', i18nKey: 'views.home', Icon: Activity },
  { id: 'limits' as const, label: 'Limits', i18nKey: 'views.limits', Icon: Gauge },
  { id: 'status' as const, label: 'Status', i18nKey: 'views.status', Icon: Server },
];

interface Device {
  id: string;
  name: string;
  tokens: number;
  local: boolean;
  stale: boolean;
}

const compact = (n: number) => {
  const locale =
    (typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-locale') || document.documentElement.lang
      : 'en') || 'en';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
};

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
      title={label}
      onClick={onClick}
      className={`relative flex h-9 w-full items-center justify-center md:justify-start gap-3 px-2 md:px-3 text-left text-[13px] transition-colors ${
        on ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`absolute inset-y-2 left-0 w-[3px] transition-colors ${on ? 'bg-[var(--tm-signal)]' : 'bg-transparent'}`} />
      <Icon size={15} strokeWidth={on ? 2.25 : 1.75} className="shrink-0" />
      <span className="hidden md:inline truncate">{label}</span>
    </button>
  );
}

export function Sidebar({ active, onSelect }: { active: MainView; onSelect: (view: MainView) => void }) {
  const live = useLive();
  const [, setLanguageSeq] = useState(0);

  useEffect(() => {
    const onLangChange = () => setLanguageSeq((s) => s + 1);
    window.addEventListener("tokenmonitor:languagechange", onLangChange);
    return () => window.removeEventListener("tokenmonitor:languagechange", onLangChange);
  }, []);

  const handleTitleDoubleClick = () => {
    const tm = window.tokenMonitor;
    (tm?.toggleMaximize || tm?.dashboard?.toggleMaximize)?.();
  };

  return (
    <aside className="absolute inset-y-0 left-0 z-40 flex w-14 sm:w-16 md:w-[216px] flex-col border-r border-border bg-[var(--tm-sidebar)] select-none transition-[width] duration-150 overflow-y-auto overflow-x-hidden">
      <div
        className="flex h-12 md:h-14 shrink-0 items-center justify-center md:justify-start gap-2.5 px-3 md:px-4 [-webkit-app-region:drag]"
        onDoubleClick={handleTitleDoubleClick}
        title="Token Monitor"
      >
        <span className="size-2.5 shrink-0 bg-foreground" />
        <span className="tm-label hidden md:inline truncate !text-[11px] !text-foreground">Token Monitor</span>
      </div>

      <nav className="flex flex-col">
        {NAV_ITEMS.map(({ id, label, i18nKey, Icon }) => (
          <NavButton
            key={id}
            tab={id}
            on={id === active}
            onClick={() => onSelect(id)}
            Icon={Icon}
            label={(i18nKey ? t(i18nKey) : null) || label}
          />
        ))}
      </nav>

      <div className="mx-2 md:mx-4 mt-4 md:mt-8 flex flex-col gap-1 md:gap-2 border-t border-border pt-3 md:pt-4">
        <span className="tm-label hidden md:flex items-center justify-between">
          {t('edgeDock.period.today') || 'Today'}
          <span className="flex items-center gap-1.5">
            <span className={`size-1.5 ${live.rate > 0 ? 'animate-pulse bg-[var(--tm-signal)]' : 'bg-muted-foreground/40'}`} />
            {live.rate > 0 ? <span className="tabular-nums">{live.rate.toFixed(1)}/s</span> : 'idle'}
          </span>
        </span>
        <span
          className="tabular-nums text-center md:text-left text-xs sm:text-sm md:text-[44px] leading-tight md:leading-[0.85] font-bold truncate"
          title={`${compact(live.tokens)} tokens`}
        >
          {compact(live.tokens)}
        </span>
        <span className="tabular-nums text-center md:text-left text-[10px] md:text-[15px] text-muted-foreground truncate">
          ${live.cost.toFixed(2)}
        </span>
      </div>

      <div className="mt-auto flex flex-col pb-2">
        {live.devices.length > 0 && (
          <div className="hidden md:flex mx-4 mb-2 flex-col gap-px border-t border-border pt-3">
            <span className="tm-label pb-1.5">{t('settings.sync.panel.devices') || 'Devices'}</span>
            {live.devices.map((d) => (
              <div key={d.id} className="flex h-6 items-center gap-2 text-[12px]" title={d.local ? (t('settings.limits.device.local') || 'This device') : d.stale ? 'Not seen recently' : undefined}>
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
        <NavButton
          tab="settings"
          on={active === 'settings'}
          onClick={() => onSelect('settings')}
          Icon={Settings}
          label={t('settings.title') || 'Settings'}
        />
      </div>
    </aside>
  );
}
