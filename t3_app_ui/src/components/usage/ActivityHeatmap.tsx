import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { formatTokens, formatUsd } from '@t3tools/shared/usageFormat';
import { cn } from '~/lib/utils';

export interface DailyRecord {
  date: string;
  tokens?: number;
  cost?: number;
}

interface CellData {
  key: string;
  tokens: number;
  cost: number;
  value: number;
  future: boolean;
}

export interface ActivityHeatmapProps {
  metric: 'tokens' | 'cost';
  sinceDay?: string | undefined;
  untilDay?: string | undefined;
  activeDays?: number | undefined;
  peakTokens?: number | undefined;
  daily?: DailyRecord[] | undefined;
}

const WEEKS = 53;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function formatHeatmapDate(day: string): string {
  const [yearStr, monthStr, dayOfMonthStr] = day.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const dayOfMonth = Number(dayOfMonthStr);
  if (!year || !month || !dayOfMonth) return day;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(year, month - 1, dayOfMonth);
  const dayName = DAYS[d.getDay()] ?? '';
  return `${dayName}, ${MONTHS[month - 1] ?? ''} ${dayOfMonth}, ${year}`;
}

// Last year of daily usage as a week-column grid, shaded by share of the busiest day
export function ActivityHeatmap({
  metric,
  sinceDay,
  untilDay,
  activeDays,
  peakTokens,
  daily: dailyProp,
}: ActivityHeatmapProps) {
  const [dailyState, setDailyState] = useState<DailyRecord[]>([]);
  const [activeCell, setActiveCell] = useState<CellData | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (dailyProp !== undefined) return;
    const tm = window.tokenMonitor;
    const load = () =>
      tm?.getDashboardHistory?.({ includeDevices: true })
        .then((h: { daily?: DailyRecord[] } | null) => setDailyState(h?.daily ?? []))
        .catch(() => {});
    void load();
    return tm?.onDashboardHistoryChanged?.(load);
  }, [dailyProp]);

  const daily = dailyProp ?? dailyState;

  const { weeks, allCells, active, peak, today } = useMemo(() => {
    const value = (r?: DailyRecord) => Number((metric === 'tokens' ? r?.tokens : r?.cost) || 0);
    const byDay = new Map(daily.map((r) => [r.date, r]));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
    const todayStr = dayKey(new Date());
    const cells: CellData[] = [];
    let future = false;
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayKey(d);
      const record = byDay.get(key);
      const tokens = Number(record?.tokens || 0);
      const cost = Number(record?.cost || 0);
      cells.push({
        key,
        tokens,
        cost,
        value: value(record),
        future,
      });
      if (key === todayStr) future = true;
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

    return { weeks, allCells: cells, active: activeCount, peak: resolvedPeak, today: todayStr };
  }, [daily, metric, sinceDay, untilDay, activeDays, peakTokens]);

  const latestNonFutureIndex = useMemo(() => {
    for (let i = allCells.length - 1; i >= 0; i--) {
      if (!allCells[i]?.future) return i;
    }
    return 0;
  }, [allCells]);

  const currentFocusedIndex = focusedIndex ?? latestNonFutureIndex;

  const updateTooltipPosition = useCallback((targetEl: HTMLElement) => {
    const cellRect = targetEl.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl?.offsetWidth || 180;
    const tooltipHeight = tooltipEl?.offsetHeight || 75;
    const gap = 8;
    const pad = 8;

    const cellCenterX = cellRect.left + cellRect.width / 2;
    const left = Math.max(pad, Math.min(window.innerWidth - pad - tooltipWidth, cellCenterX - tooltipWidth / 2));
    const spaceAbove = cellRect.top - gap - tooltipHeight;
    const top = spaceAbove >= pad
      ? spaceAbove
      : Math.min(window.innerHeight - pad - tooltipHeight, cellRect.bottom + gap);

    setTooltipPos({ left, top });
  }, []);

  const showTooltip = useCallback((targetEl: HTMLElement, cell: CellData) => {
    activeTargetRef.current = targetEl;
    setActiveCell(cell);
    updateTooltipPosition(targetEl);
  }, [updateTooltipPosition]);

  const hideTooltip = useCallback(() => {
    activeTargetRef.current = null;
    setActiveCell(null);
    setTooltipPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!activeCell || !activeTargetRef.current || !tooltipRef.current) return;
    updateTooltipPosition(activeTargetRef.current);
  }, [activeCell, updateTooltipPosition]);

  useEffect(() => {
    if (!activeCell) return;
    const handleScrollOrResize = () => {
      if (activeTargetRef.current) {
        updateTooltipPosition(activeTargetRef.current);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeCell, updateTooltipPosition]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    const col = Math.floor(index / 7);
    const row = index % 7;

    if (e.key === 'ArrowUp') {
      nextIndex = row === 0 ? index : index - 1;
    } else if (e.key === 'ArrowDown') {
      nextIndex = row === 6 ? index : index + 1;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = col === 0 ? index : index - 7;
    } else if (e.key === 'ArrowRight') {
      nextIndex = col === WEEKS - 1 ? index : index + 7;
    } else if (e.key === 'Home') {
      nextIndex = row;
    } else if (e.key === 'End') {
      let latest = (WEEKS - 1) * 7 + row;
      while (latest >= 0 && (latest >= allCells.length || allCells[latest]?.future)) {
        latest -= 7;
      }
      nextIndex = Math.max(0, latest);
    } else if (e.key === 'Escape') {
      hideTooltip();
      return;
    }

    if (nextIndex !== null && nextIndex !== index && nextIndex >= 0 && nextIndex < allCells.length) {
      const nextCell = allCells[nextIndex];
      if (nextCell && !nextCell.future) {
        e.preventDefault();
        setFocusedIndex(nextIndex);
        const targetEl = cellRefs.current.get(nextIndex);
        if (targetEl) {
          targetEl.focus();
          showTooltip(targetEl, nextCell);
        }
      }
    }
  };

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
      <div
        ref={gridRef}
        role="grid"
        aria-label="Activity heatmap"
        aria-readonly="true"
        className="flex min-w-0 flex-1 justify-end gap-[3px] overflow-hidden"
        onPointerLeave={() => {
          if (!gridRef.current?.contains(document.activeElement)) {
            hideTooltip();
          }
        }}
      >
        {weeks.map((week, w) => (
          <div key={w} role="row" className="grid shrink-0 gap-[3px]">
            {week.map((c, d) => {
              const index = w * 7 + d;
              return (
                <button
                  key={c.key}
                  type="button"
                  ref={(el) => {
                    if (el) cellRefs.current.set(index, el);
                    else cellRefs.current.delete(index);
                  }}
                  disabled={c.future}
                  tabIndex={c.future ? -1 : currentFocusedIndex === index ? 0 : -1}
                  role="gridcell"
                  aria-label={
                    c.future
                      ? undefined
                      : `${formatHeatmapDate(c.key)}: ${formatTokens(c.tokens)} tokens, ${formatUsd(c.cost)}`
                  }
                  aria-selected={activeCell?.key === c.key}
                  aria-describedby={activeCell?.key === c.key ? 'activity-heatmap-tooltip' : undefined}
                  onPointerEnter={(e) => {
                    if (c.future) return;
                    showTooltip(e.currentTarget, c);
                  }}
                  onPointerLeave={() => {
                    if (document.activeElement !== cellRefs.current.get(index)) {
                      hideTooltip();
                    }
                  }}
                  onFocus={(e) => {
                    if (c.future) return;
                    setFocusedIndex(index);
                    showTooltip(e.currentTarget, c);
                  }}
                  onBlur={(e) => {
                    if (!gridRef.current?.contains(e.relatedTarget as Node)) {
                      hideTooltip();
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={cn(
                    "size-[11px] p-0 border-0 outline-none rounded-[1px] transition-all",
                    c.future ? "opacity-0 pointer-events-none cursor-default" : "cursor-pointer",
                    !c.future && (c.value > 0 ? "bg-primary" : "bg-muted"),
                    activeCell?.key === c.key && "ring-1 ring-foreground ring-offset-1 ring-offset-background z-10",
                    "focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:z-10"
                  )}
                  style={c.value > 0 && peak > 0 ? { opacity: 0.25 + 0.75 * Math.sqrt(c.value / peak) } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>

      {typeof document !== 'undefined' && activeCell && tooltipPos
        ? createPortal(
            <div
              ref={tooltipRef}
              id="activity-heatmap-tooltip"
              role="tooltip"
              aria-live="polite"
              className="surface-glass pointer-events-none fixed z-50 min-w-44 rounded-xl border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md"
              style={{
                left: `${tooltipPos.left}px`,
                top: `${tooltipPos.top}px`,
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/50 pb-1">
                <span className="tm-label !text-muted-foreground">
                  {formatHeatmapDate(activeCell.key)}
                </span>
                {activeCell.key === today ? (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
                    Today
                  </span>
                ) : activeCell.value === peak && peak > 0 ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                    Peak
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">Tokens</span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    metric === 'tokens' ? "text-foreground font-semibold" : "text-foreground",
                  )}
                >
                  {formatTokens(activeCell.tokens)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-0.5">
                <span className="text-muted-foreground">Cost</span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    metric === 'cost' ? "text-foreground font-semibold" : "text-foreground",
                  )}
                >
                  {formatUsd(activeCell.cost)}
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
