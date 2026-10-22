import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, Toggle } from '~/components/ui/toggle-group';
import {
  TrendingUp,
  Calendar,
  BarChart3,
  Flame,
  Zap,
  RefreshCw,
  Coins,
  Sparkles,
} from 'lucide-react';

interface DailyRecord {
  date: string;
  tokens: number;
  cost: number;
  unpricedTokens?: number;
  perClient?: Record<string, { tokens?: number; cost?: number }>;
  perModel?: Record<string, { tokens?: number; cost?: number }>;
}

interface HistoryData {
  daily?: DailyRecord[];
  summary?: {
    totalTokens?: number;
    totalCost?: number;
    activeDays?: number;
    peakDayTokens?: number;
    favoriteModel?: string;
  };
}

export function TrendsView() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [range, setRange] = useState<string>('30');
  const [metric, setMetric] = useState<'tokens' | 'cost'>('tokens');
  const [hoveredDay, setHoveredDay] = useState<DailyRecord | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      if (typeof window === 'undefined' || !window.tokenMonitor?.getDashboardHistory) return;
      const data = await window.tokenMonitor.getDashboardHistory({ includeDevices: true });
      setHistory(data || null);
    } catch (err) {
      console.error('[TrendsView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    if (typeof window !== 'undefined' && window.tokenMonitor?.onDashboardHistoryChanged) {
      const unsub = window.tokenMonitor.onDashboardHistoryChanged(() => {
        fetchHistory();
      });
      return unsub;
    }
  }, []);

  const dailyList = useMemo(() => {
    const list = history?.daily || [];
    if (range === 'all') return list;
    const count = Number(range) || 30;
    return list.slice(-count);
  }, [history, range]);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalTok = dailyList.reduce((sum, d) => sum + Number(d.tokens || 0), 0);
    const totalCst = dailyList.reduce((sum, d) => sum + Number(d.cost || 0), 0);
    const activeDays = dailyList.filter((d) => (d.tokens || 0) > 0).length;
    const peakTok = dailyList.reduce((max, d) => Math.max(max, Number(d.tokens || 0)), 0);

    return {
      totalTokens: totalTok,
      totalCost: totalCst,
      activeDays,
      peakDayTokens: peakTok,
    };
  }, [dailyList]);

  // Tool & Model aggregations
  const breakdown = useMemo(() => {
    const clientMap: Record<string, number> = {};
    const modelMap: Record<string, number> = {};

    for (const d of dailyList) {
      if (d.perClient) {
        for (const [k, v] of Object.entries(d.perClient)) {
          const client = k === 'antigravity-cli' ? 'antigravity' : k;
          clientMap[client] = (clientMap[client] || 0) + Number(v.tokens || 0);
        }
      }
      if (d.perModel) {
        for (const [m, v] of Object.entries(d.perModel)) {
          modelMap[m] = (modelMap[m] || 0) + Number(v.tokens || 0);
        }
      }
    }

    const sortedClients = Object.entries(clientMap)
      .map(([client, tokens]) => ({ client, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    const sortedModels = Object.entries(modelMap)
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    return { clients: sortedClients, models: sortedModels };
  }, [dailyList]);

  // Heatmap generation (Last 365 days)
  const heatmapData = useMemo(() => {
    const recordMap = new Map<string, DailyRecord>();
    for (const d of history?.daily || []) {
      recordMap.set(d.date, d);
    }

    const days: Array<{ dateStr: string; record?: DailyRecord; intensity: number }> = [];
    const now = new Date();
    const maxVal = Math.max(1, ...(history?.daily || []).map((d) => (metric === 'tokens' ? Number(d.tokens || 0) : Number(d.cost || 0))));

    for (let i = 364; i >= 0; i--) {
      const dt = new Date(now.getTime() - i * 86400000);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const rec = recordMap.get(dateStr);
      const val = rec ? (metric === 'tokens' ? Number(rec.tokens || 0) : Number(rec.cost || 0)) : 0;
      let intensity = 0;
      if (val > 0) {
        const ratio = val / maxVal;
        if (ratio < 0.15) intensity = 1;
        else if (ratio < 0.4) intensity = 2;
        else if (ratio < 0.75) intensity = 3;
        else intensity = 4;
      }
      days.push({ dateStr, record: rec, intensity });
    }

    return days;
  }, [history, metric]);

  const formatTokens = (val: number) => {
    return Math.round(val).toLocaleString('en-US');
  };

  const formatCost = (val: number) => {
    if (val <= 0) return '$0.00';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground select-text">
      {/* View Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-border/30 bg-card/20">
        <div className="flex items-center gap-2">
          {/* Genuine T3 Segmented Range Selector */}
          <ToggleGroup
            aria-label="Trends range"
            variant="segmented"
            value={[range]}
            onValueChange={(next) => {
              const val = next[0];
              if (val) setRange(val);
            }}
          >
            {(['7', '30', '90', '365', 'all'] as const).map((r) => (
              <Toggle key={r} value={r} className="px-2 text-xs">
                {r === 'all' ? 'All' : `${r}D`}
              </Toggle>
            ))}
          </ToggleGroup>

          {/* Genuine T3 Segmented Metric Selector */}
          <ToggleGroup
            aria-label="Trends metric"
            variant="segmented"
            value={[metric]}
            onValueChange={(next) => {
              const val = next[0] as 'tokens' | 'cost';
              if (val) setMetric(val);
            }}
          >
            <Toggle value="tokens" className="px-2 text-xs">
              Tokens
            </Toggle>
            <Toggle value="cost" className="px-2 text-xs">
              Cost
            </Toggle>
          </ToggleGroup>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchHistory}
            title="Refresh trends"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="size-3.5" />
          <span>Activity Timeline</span>
        </div>
      </div>

      {/* Metric Summaries Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 border-b border-border/30 bg-card/10">
        <div className="p-3 rounded-xl border border-border/30 bg-card/20">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 uppercase tracking-wider">
            <Zap className="size-3.5 text-muted-foreground" /> Period Tokens
          </div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {formatTokens(stats.totalTokens)}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-border/30 bg-card/20">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 uppercase tracking-wider">
            <Coins className="size-3.5 text-muted-foreground" /> Period Cost
          </div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {formatCost(stats.totalCost)}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-border/30 bg-card/20">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 uppercase tracking-wider">
            <Flame className="size-3.5 text-muted-foreground" /> Active Days
          </div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {stats.activeDays} <span className="text-xs font-normal text-muted-foreground">days</span>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-border/30 bg-card/20">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 uppercase tracking-wider">
            <TrendingUp className="size-3.5 text-muted-foreground" /> Peak Day
          </div>
          <div className="text-lg font-semibold mt-1 text-foreground">
            {formatTokens(stats.peakDayTokens)}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="mr-2 size-4 animate-spin" /> Loading usage history...
          </div>
        ) : dailyList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border/40 rounded-xl bg-card/20 p-8">
            <BarChart3 className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No activity history available</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Token transactions will populate this timeline as you code with AI assistants.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-3">
            <div className="space-y-6">
              {/* 365-Day Activity Heatmap */}
              <div className="p-4 rounded-xl border border-border/30 bg-card/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-muted-foreground" /> 365-Day Activity Heatmap
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>Less</span>
                    <span className="w-2.5 h-2.5 rounded-xs bg-muted/60" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-950 dark:bg-emerald-900" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700 dark:bg-emerald-600" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-300" />
                    <span>More</span>
                  </div>
                </div>

                {/* Heatmap Grid */}
                <div className="overflow-x-auto pb-2">
                  <div
                    className="grid grid-rows-7 grid-flow-col gap-1 w-max"
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    {heatmapData.map((d) => {
                      const colorClass =
                        d.intensity === 0
                          ? 'bg-muted/40 hover:ring-1 hover:ring-foreground/40'
                          : d.intensity === 1
                          ? 'bg-emerald-950 dark:bg-emerald-900 hover:ring-1 hover:ring-emerald-400'
                          : d.intensity === 2
                          ? 'bg-emerald-700 dark:bg-emerald-600 hover:ring-1 hover:ring-emerald-300'
                          : d.intensity === 3
                          ? 'bg-emerald-500 hover:ring-1 hover:ring-emerald-200'
                          : 'bg-emerald-300 hover:ring-1 hover:ring-white';

                      return (
                        <div
                          key={d.dateStr}
                          onMouseEnter={() => setHoveredDay(d.record || { date: d.dateStr, tokens: 0, cost: 0 })}
                          className={`w-3 h-3 rounded-xs transition-colors cursor-pointer ${colorClass}`}
                          title={`${d.dateStr}: ${formatTokens(d.record?.tokens || 0)} tok (${formatCost(d.record?.cost || 0)})`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Hover Details Footer */}
                <div className="h-6 flex items-center justify-between text-xs text-muted-foreground border-t border-border/20 pt-2">
                  {hoveredDay ? (
                    <>
                      <span className="font-medium text-foreground">{hoveredDay.date}</span>
                      <span>
                        {formatTokens(hoveredDay.tokens)} tok &middot; {formatCost(hoveredDay.cost)}
                      </span>
                    </>
                  ) : (
                    <span>Hover over any day to see activity details</span>
                  )}
                </div>
              </div>

              {/* Tool & Model Leaderboards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Assistant Tools */}
                <div className="p-4 rounded-xl border border-border/30 bg-card/20 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Top Assistants & Tools</div>
                  {breakdown.clients.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">No tool data</div>
                  ) : (
                    <div className="space-y-2">
                      {breakdown.clients.map((c) => {
                        const pct = stats.totalTokens > 0 ? (c.tokens / stats.totalTokens) * 100 : 0;
                        return (
                          <div key={c.client} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-foreground capitalize">{c.client}</span>
                              <span className="text-muted-foreground font-mono">
                                {formatTokens(c.tokens)} ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full"
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Models */}
                <div className="p-4 rounded-xl border border-border/30 bg-card/20 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Top AI Models</div>
                  {breakdown.models.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">No model data</div>
                  ) : (
                    <div className="space-y-2">
                      {breakdown.models.slice(0, 6).map((m) => {
                        const pct = stats.totalTokens > 0 ? (m.tokens / stats.totalTokens) * 100 : 0;
                        return (
                          <div key={m.model} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono text-[11px] text-foreground truncate max-w-[200px]" title={m.model}>
                                {m.model}
                              </span>
                              <span className="text-muted-foreground font-mono">
                                {formatTokens(m.tokens)} ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500/70 rounded-full"
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
