import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, Toggle } from '~/components/ui/toggle-group';
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Search,
  RefreshCw,
  Clock,
  Cpu,
  Layers,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import {
  getSessionRows,
  getSessionExchangeRows,
  mergeAllTimeSessions,
  type SessionRow,
  type SessionExchangeRow,
} from './logicBridge';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'last7', label: '7D' },
  { id: 'last30', label: '30D' },
  { id: 'allTime', label: 'All Time' },
];

export function SessionsView() {
  const [period, setPeriod] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('period');
      if (p && PERIOD_OPTIONS.some((opt) => opt.id === p)) {
        return p;
      }
    }
    return 'today';
  });
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'time' | 'tokens' | 'cost'>('time');
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [sessionDetail, setSessionDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const fetchSessions = async (currentPeriod: string) => {
    setLoading(true);
    try {
      if (typeof window === 'undefined' || !window.tokenMonitor) return;
      let stats = await window.tokenMonitor.getStats();

      if (currentPeriod === 'allTime' && window.tokenMonitor.getAllTimeSessions) {
        try {
          const snapshotId = stats?.snapshot?.id || stats?.snapshot;
          const allTimeSessions = await window.tokenMonitor.getAllTimeSessions(snapshotId);
          if (allTimeSessions) {
            stats = mergeAllTimeSessions(stats, allTimeSessions);
          }
        } catch (err) {
          console.error('[SessionsView] allTime sessions fetch failed:', err);
        }
      }

      const periodData = stats?.periods?.[currentPeriod] || stats?.periods?.today || {};
      const rows = getSessionRows(periodData);
      setSessions(rows);
    } catch (err) {
      console.error('[SessionsView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions(period);
    setPage(1);
  }, [period]);

  const loadSessionDetail = async (session: SessionRow) => {
    setSelectedSession(session);
    setDetailLoading(true);
    setSessionDetail(null);
    try {
      if (typeof window === 'undefined' || !window.tokenMonitor?.getSessionDetail) return;
      const sId = session.sessionId || session.key.replace(/^session:[^:]*:/, '');
      const client = session.client || '';
      const cost = typeof session.cost === 'number' ? session.cost : 0;
      const detail = await window.tokenMonitor.getSessionDetail({
        client,
        sessionId: sId,
        period,
        sessionCost: cost,
      });
      setSessionDetail(detail || null);
    } catch (err) {
      console.error('[SessionsView] detail error:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const exchangeRows: SessionExchangeRow[] = useMemo(() => {
    if (!sessionDetail) return [];
    return getSessionExchangeRows(sessionDetail, { sortBy: 'time' });
  }, [sessionDetail]);

  const filteredSessions = useMemo(() => {
    let result = [...sessions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const name = (s.name || s.sessionId || s.key || '').toLowerCase();
        const client = (s.client || s.clientLabel || '').toLowerCase();
        const model = (s.modelLabel || '').toLowerCase();
        return name.includes(q) || client.includes(q) || model.includes(q);
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'tokens') return (b.value || 0) - (a.value || 0);
      if (sortBy === 'cost') return (b.cost || 0) - (a.cost || 0);
      return (b.sortTime || 0) - (a.sortTime || 0);
    });

    return result;
  }, [sessions, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, page, pageSize]);

  const formatTokens = (val: number) => {
    return Math.round(val).toLocaleString('en-US');
  };

  const formatCost = (val: number) => {
    if (val <= 0) return '$0.00';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  };

  const formatTime = (ts?: number) => {
    if (!ts) return 'Unknown time';
    const d = new Date(ts);
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
            aria-label="Session period"
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
            onClick={() => fetchSessions(period)}
            title="Refresh sessions"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-7.5 w-44 pl-8 text-xs bg-background/60"
            />
          </div>

          {/* Genuine T3 Segmented Sort Selector */}
          <ToggleGroup
            aria-label="Sort sessions"
            variant="segmented"
            value={[sortBy]}
            onValueChange={(next) => {
              const val = next[0] as 'time' | 'tokens' | 'cost';
              if (val) setSortBy(val);
            }}
          >
            <Toggle value="time" className="px-2 text-xs">
              Time
            </Toggle>
            <Toggle value="tokens" className="px-2 text-xs">
              Tokens
            </Toggle>
            <Toggle value="cost" className="px-2 text-xs">
              Cost
            </Toggle>
          </ToggleGroup>
        </div>
      </div>

      {/* Main Sessions Content */}
      <div className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="size-5 animate-spin mr-2" />
            Loading sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border/40 rounded-xl bg-card/20 p-8">
            <Layers className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No sessions found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              No AI coding activity recorded in this period.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-3">
            <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
              <span>
                Showing {filteredSessions.length} session{filteredSessions.length === 1 ? '' : 's'}
              </span>
              <span>
                Total: {formatTokens(filteredSessions.reduce((s, r) => s + (r.value || 0), 0))} tok &middot; {formatCost(filteredSessions.reduce((s, r) => s + (r.cost || 0), 0))}
              </span>
            </div>

            <ScrollArea className="flex-1 rounded-xl border border-border/30 bg-card/20">
              <div className="divide-y divide-border/20">
                {paginatedSessions.map((session) => {
                  const isRunning = session.running || session.activityState === 'running';

                  return (
                    <div
                      key={session.key}
                      onClick={() => loadSessionDetail(session)}
                      className="session-item group flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors cursor-pointer"
                      data-session-item={session.sessionId || session.key}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="relative shrink-0">
                          <div className="size-8 rounded-lg border border-border/40 bg-muted/40 flex items-center justify-center text-foreground font-semibold text-xs">
                            {(session.client || 'AI').slice(0, 2).toUpperCase()}
                          </div>
                          {isRunning && (
                            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                              {session.name || session.detail || session.sessionId || 'Session'}
                            </span>
                            {session.clientLabel && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase tracking-wider text-muted-foreground border-border/40">
                                {session.clientLabel}
                              </Badge>
                            )}
                            {isRunning && (
                              <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                Live
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 truncate">
                            {session.modelLabel && (
                              <span className="flex items-center gap-1">
                                <Cpu className="size-3" />
                                {session.modelLabel}
                              </span>
                            )}
                            {session.sortTime ? (
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {formatTime(session.sortTime)}
                              </span>
                            ) : null}
                            {session.subtitle && (
                              <span className="truncate opacity-75">{session.subtitle}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0 text-right">
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {formatTokens(session.value || 0)} <span className="text-[10px] font-normal text-muted-foreground">tok</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {formatCost(session.cost || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1 py-1 text-xs text-muted-foreground">
                <div>
                  Page {page} of {totalPages}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-7 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-7 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session Details Modal */}
      <Dialog
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
            setSessionDetail(null);
          }
        }}
      >
        <DialogPopup className="max-w-2xl max-h-[85vh] flex flex-col p-6 bg-card border border-border/40 rounded-xl overflow-hidden shadow-2xl">
          <DialogHeader className="shrink-0 pb-3 border-b border-border/20">
            <DialogTitle className="flex items-center justify-between text-base font-semibold">
              <span className="truncate pr-4">
                {selectedSession?.name || selectedSession?.sessionId || '-'}
              </span>
              {selectedSession?.clientLabel && (
                <Badge variant="outline" className="text-xs uppercase tracking-wider">
                  {selectedSession.clientLabel}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="size-5 animate-spin mr-2" />
              Loading session exchanges & turns...
            </div>
          ) : sessionDetail ? (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mt-3 text-xs">
              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-muted/20 border border-border/20 rounded-lg">
                <div>
                  <span className="text-muted-foreground block mb-0.5 text-[11px]">Session ID</span>
                  <span className="font-mono text-foreground select-all break-all text-[11px]">
                    {sessionDetail.sessionId || selectedSession?.sessionId || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5 text-[11px]">Tokens</span>
                  <span className="font-semibold text-foreground text-sm">
                    {formatTokens(sessionDetail.totals?.tokens?.total || sessionDetail.totalTokens || selectedSession?.value || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5 text-[11px]">Cost</span>
                  <span className="font-semibold text-foreground text-sm">
                    {formatCost(sessionDetail.totals?.cost || sessionDetail.costUsd || selectedSession?.cost || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5 text-[11px]">Client</span>
                  <span className="text-foreground capitalize text-[11px]">
                    {sessionDetail.client || selectedSession?.client || '-'}
                  </span>
                </div>
              </div>

              {/* Models Breakdown if present */}
              {sessionDetail.models && Object.keys(sessionDetail.models).length > 0 && (
                <div className="p-3 bg-muted/10 border border-border/20 rounded-lg">
                  <span className="text-xs font-medium text-foreground block mb-2">Model Breakdown</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(sessionDetail.models).map(([model, tok]: [string, any]) => (
                      <div key={model} className="flex justify-between items-center p-1.5 rounded bg-card/40 border border-border/20">
                        <span className="text-muted-foreground font-mono text-[11px] truncate mr-2">{model}</span>
                        <span className="font-medium text-foreground shrink-0">{formatTokens(Number(tok) || 0)} tok</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exchanges and Turns List */}
              {exchangeRows.length > 0 ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span className="font-medium text-foreground flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" />
                      Turns & Exchanges ({exchangeRows.length})
                    </span>
                    <span>
                      {exchangeRows.reduce((acc, ex) => acc + (ex.turnCount || 0), 0)} AI response{exchangeRows.reduce((acc, ex) => acc + (ex.turnCount || 0), 0) === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {exchangeRows.map((exchange) => (
                      <div
                        key={exchange.key}
                        className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {exchange.isPrompt && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                                  You
                                </Badge>
                              )}
                              <span className="font-medium text-foreground text-xs break-words line-clamp-3">
                                {exchange.title}
                              </span>
                            </div>
                            {exchange.subtitle && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {exchange.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-foreground text-xs">
                              {formatTokens(exchange.value)} tok
                            </div>
                            {exchange.cost > 0 && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {formatCost(exchange.cost)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Turn list for this exchange */}
                        {exchange.turns && exchange.turns.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-border/20">
                            {exchange.turns.map((turn) => {
                              const tk = turn.tokens || {};
                              const cache = (tk.cacheRead || 0) + (tk.cacheWrite || 0);
                              return (
                                <div
                                  key={turn.key}
                                  className="flex items-center justify-between p-2 rounded bg-card/60 border border-border/20 text-[11px]"
                                >
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-foreground">
                                        AI {turn.label}
                                      </span>
                                      {turn.tools && (
                                        <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1 py-0.2 rounded flex items-center gap-1">
                                          <Wrench className="size-2.5" />
                                          {turn.tools}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-muted-foreground text-[10px] mt-0.5">
                                      in {formatTokens(tk.input || 0)} &middot; out {formatTokens(tk.output || 0)}
                                      {cache > 0 && ` \u00b7 cache ${formatTokens(cache)}`}
                                      {tk.reasoning ? ` \u00b7 reason ${formatTokens(tk.reasoning)}` : ''}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-medium text-foreground">
                                      {formatTokens(turn.value)} tok
                                    </span>
                                    {turn.cost > 0 && (
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {formatCost(turn.cost)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : sessionDetail.found === false ? (
                <div className="mt-4 p-4 text-center text-muted-foreground text-xs border border-dashed border-border/30 rounded-lg">
                  Transcript not found on this machine.
                </div>
              ) : sessionDetail.tokenDataUnavailable ? (
                <div className="mt-4 p-4 text-center text-muted-foreground text-xs border border-dashed border-border/30 rounded-lg">
                  Token data is unavailable for this session.
                </div>
              ) : (
                <div className="mt-4 p-4 text-center text-muted-foreground text-xs border border-dashed border-border/30 rounded-lg">
                  Detailed turn breakdown not recorded for this session.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 p-4 text-center text-muted-foreground text-xs">
              Detailed turn breakdown not recorded for this session.
            </div>
          )}
        </DialogPopup>
      </Dialog>
    </div>
  );
}
