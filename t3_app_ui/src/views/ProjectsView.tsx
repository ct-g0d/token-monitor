import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, Toggle } from '~/components/ui/toggle-group';
import {
  FolderGit2,
  Search,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  getProjectRows,
  isProjectBreakdownIncomplete,
  mergeAllTimeSessions,
  type ProjectRow,
} from './logicBridge';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'last7', label: '7D' },
  { id: 'last30', label: '30D' },
  { id: 'allTime', label: 'All Time' },
];

export function ProjectsView() {
  const [period, setPeriod] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('period');
      if (p && PERIOD_OPTIONS.some((opt) => opt.id === p)) {
        return p;
      }
    }
    return 'today';
  });
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [isIncomplete, setIsIncomplete] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'tokens' | 'cost' | 'name'>('tokens');

  const fetchProjects = async (currentPeriod: string) => {
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
          console.error('[ProjectsView] allTime sessions fetch failed:', err);
        }
      }

      const periodData = stats?.periods?.[currentPeriod] || stats?.periods?.today || {};
      const rows = getProjectRows(periodData);
      const incomplete = isProjectBreakdownIncomplete(stats, currentPeriod);

      setProjects(rows);
      setIsIncomplete(incomplete);
    } catch (err) {
      console.error('[ProjectsView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects(period);
  }, [period]);

  const totalTokens = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.value || 0), 0);
  }, [projects]);

  const totalCost = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.cost || 0), 0);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => (p.name || p.key || '').toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortBy === 'cost') return (b.cost || 0) - (a.cost || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return (b.value || 0) - (a.value || 0);
    });

    return result;
  }, [projects, searchQuery, sortBy]);

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
          {/* Genuine T3 Segmented Period Selector */}
          <ToggleGroup
            aria-label="Project period"
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
            onClick={() => fetchProjects(period)}
            title="Refresh projects"
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
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7.5 w-44 pl-8 text-xs bg-background/60"
            />
          </div>

          {/* Genuine T3 Segmented Sort Selector */}
          <ToggleGroup
            aria-label="Sort projects"
            variant="segmented"
            value={[sortBy]}
            onValueChange={(next) => {
              const val = next[0] as 'tokens' | 'cost' | 'name';
              if (val) setSortBy(val);
            }}
          >
            <Toggle value="tokens" className="px-2 text-xs">
              Tokens
            </Toggle>
            <Toggle value="cost" className="px-2 text-xs">
              Cost
            </Toggle>
            <Toggle value="name" className="px-2 text-xs">
              Name
            </Toggle>
          </ToggleGroup>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
        {/* Subtle Metric Summaries */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-border/30 bg-card/20">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
              Active Projects
            </span>
            <span className="text-xl font-semibold text-foreground mt-0.5 block">
              {projects.length}
            </span>
          </div>
          <div className="p-3.5 rounded-xl border border-border/30 bg-card/20">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
              Period Tokens
            </span>
            <span className="text-xl font-semibold text-foreground mt-0.5 block">
              {formatTokens(totalTokens)}
            </span>
          </div>
          <div className="p-3.5 rounded-xl border border-border/30 bg-card/20">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
              Period Cost
            </span>
            <span className="text-xl font-semibold text-foreground mt-0.5 block">
              {formatCost(totalCost)}
            </span>
          </div>
        </div>

        {isIncomplete && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-500 text-xs">
            <Info className="size-4 shrink-0" />
            <span>Some activity has been attributed using session client fallbacks.</span>
          </div>
        )}

        {/* Project List */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
              <RefreshCw className="size-5 animate-spin mr-2" />
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border/40 rounded-xl bg-card/20 p-8">
              <FolderGit2 className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No projects found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                No project workspaces or repositories recorded in this period.
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1 rounded-xl border border-border/30 bg-card/20">
              <div className="divide-y divide-border/20">
                {filteredProjects.map((proj) => {
                  const sharePercent = totalTokens > 0 ? ((proj.value || 0) / totalTokens) * 100 : 0;
                  const clientsList = proj.clients instanceof Set ? Array.from(proj.clients) : Object.keys(proj.clientTokens || {});

                  return (
                    <div
                      key={proj.key}
                      className="project-item flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors"
                      data-project-key={proj.key}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="size-8 rounded-lg border border-border/40 bg-muted/40 flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                          <FolderGit2 className="size-4 text-muted-foreground" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {proj.name}
                            </span>
                            {clientsList.map((client) => (
                              <Badge
                                key={client}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 uppercase tracking-wider text-muted-foreground border-border/40"
                              >
                                {client}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                            <span className="font-mono text-[10px]">{proj.key}</span>
                            <span>&middot;</span>
                            <span>{sharePercent.toFixed(1)}% of period</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0 text-right">
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {formatTokens(proj.value || 0)} <span className="text-[10px] font-normal text-muted-foreground">tok</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {formatCost(proj.cost || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
