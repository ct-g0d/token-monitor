import React, { useEffect, useMemo, useState } from 'react';
import { formatTokens, formatUsd } from '@t3tools/shared/usageFormat';

interface DailyRecord {
  date: string;
  tokens?: number;
  cost?: number;
}

const WEEKS = 53;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Last year of daily usage as a week-column grid, shaded by share of the busiest day
export function ActivityHeatmap({
  metric,
  sinceDay,
  untilDay,
  activeDays,
  peakTokens,
}: {
  metric: 'tokens' | 'cost';
  sinceDay?: string | undefined;
  untilDay?: string | undefined;
  activeDays?: number | undefined;
  peakTokens?: number | undefined;
}) {
  const [daily, setDaily] = useState<DailyRecord[]>([]);

  useEffect(() => {
    const tm = window.tokenMonitor;
    const load = () =>
      tm?.getDashboardHistory?.({ includeDevices: true })
        .then((h: { daily?: DailyRecord[] } | null) => setDaily(h?.daily ?? []))
        .catch(() => {});
    void load();
    return tm?.onDashboardHistoryChanged?.(load);
  }, []);

  const { weeks, active, peak } = useMemo(() => {
    const value = (r?: DailyRecord) => Number((metric === 'tokens' ? r?.tokens : r?.cost) || 0);
    const byDay = new Map(daily.map((r) => [r.date, r]));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
    const today = dayKey(new Date());
    const cells: Array<{ key: string; value: number; future: boolean }> = [];
    let future = false;
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayKey(d);
      cells.push({ key, value: value(byDay.get(key)), future });
      if (key === today) future = true;
    }
    const peakAll = Math.max(0, ...cells.map((c) => c.value));
    const weeks = Array.from({ length: WEEKS }, (_, w) => cells.slice(w * 7, w * 7 + 7));

    // Active days must count only days within the selected range that have tokens > 0
    const inRangeDaily = daily.filter((d) => {
      if (sinceDay && d.date < sinceDay) return false;
      if (untilDay && d.date > untilDay) return false;
      return true;
    });

    const activeCount = typeof activeDays === 'number'
      ? activeDays
      : inRangeDaily.filter((d) => Number(d.tokens || 0) > 0).length;

    const resolvedPeak = (metric === 'tokens' && typeof peakTokens === 'number' && peakTokens > 0)
      ? peakTokens
      : (inRangeDaily.length > 0 ? inRangeDaily.reduce((max, d) => Math.max(max, value(d)), 0) : peakAll);

    return { weeks, active: activeCount, peak: resolvedPeak };
  }, [daily, metric, sinceDay, untilDay, activeDays, peakTokens]);

  const format = metric === 'tokens' ? formatTokens : formatUsd;

  return (
    <section className="flex items-center gap-10 border-t border-border pt-8">
      <div className="flex shrink-0 flex-col gap-1">
        <h2 className="tm-label !text-foreground">Activity</h2>
        <span className="tabular-nums pt-2 text-[26px] leading-none font-semibold">{active}</span>
        <span className="tm-label">active days</span>
        <span className="tabular-nums pt-2 text-[26px] leading-none font-semibold">{format(peak)}</span>
        <span className="tm-label">peak day</span>
      </div>
      {/* Narrow windows clip the oldest weeks, never the current one */}
      <div className="flex min-w-0 flex-1 justify-end gap-[3px] overflow-hidden">
        {weeks.map((week, w) => (
          <div key={w} className="grid shrink-0 gap-[3px]">
            {week.map((c) => (
              <div
                key={c.key}
                title={c.future ? undefined : `${c.key} · ${format(c.value)}`}
                className={`size-[11px] ${c.future ? '' : c.value > 0 ? 'bg-primary' : 'bg-muted'}`}
                style={c.value > 0 && peak > 0 ? { opacity: 0.25 + 0.75 * Math.sqrt(c.value / peak) } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
