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
import { PageHeader } from '../components/shell/PageHeader';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: '7D' },
  { id: 'last30', label: '30D' },
  { id: 'allTime', label: 'All' },
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

      const periodData = (stats?.periods as any)?.[currentPeriod] || stats?.periods?.today || {};
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

    result.sort((a, b) => (b.value || 0) - (a.value || 0));

    return result;
  }, [projects, searchQuery]);

  const formatTokens = (val: number) => {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(val);
  };

  const formatCost = (val: number) => {
    if (val <= 0) return '$0.00';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col h-full w-full text-foreground select-text">
      <PageHeader title="Projects" subtitle={`${projects.length} projects · ${formatTokens(totalTokens)} · ${formatCost(totalCost)}`}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7.5 w-36 pl-8 text-xs"
            />
          </div>
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
            ))};
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
      </PageHeader>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden px-10 pb-6 flex flex-col gap-4">
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
            <div className="flex flex-col items-center justify-center h-64 text-center tm-card p-8">
              <FolderGit2 className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No projects found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                No project workspaces or repositories recorded in this period.
              </p>
            </div>
          ) : (
            <ScrollArea className="min-h-0 border-t border-border">
              <div className="divide-y divide-border">
                {filteredProjects.map((proj) => {
                  const sharePercent = totalTokens > 0 ? ((proj.value || 0) / totalTokens) * 100 : 0;
                  const clientsList = proj.clients instanceof Set ? Array.from(proj.clients) : Object.keys(proj.clientTokens || {});

                  return (
                    <div
                      key={proj.key}
                      className="project-item flex items-center justify-between py-3.5 hover:bg-muted/40 transition-colors"
                      data-project-key={proj.key}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground truncate">
                              {proj.name}
                            </span>
                            {clientsList.map((client) => (
                              <Badge
                                key={client}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/40"
                              >
                                {client}
                              </Badge>
                            ))}
                          </div>

                          <div className="mt-1.5 h-0.5 w-48 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, sharePercent)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0 text-right">
                        <div>
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {formatTokens(proj.value || 0)}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
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
