import React, { useState, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
  Server,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Activity,
} from 'lucide-react';
import { PageHeader } from '../components/shell/PageHeader';

interface ComponentIssue {
  name: string;
  status: string;
}

interface ServiceProviderStatus {
  id: string;
  label: string;
  pageUrl?: string;
  status?: string;
  indicator?: string;
  description?: string;
  checkedAt?: string;
  updatedAt?: string;
  componentIssues?: ComponentIssue[];
  incidentTitle?: string;
  incidentCount?: number;
  maintenanceCount?: number;
  error?: string;
}

export function ServiceStatusView() {
  const [providers, setProviders] = useState<ServiceProviderStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStatus = async (force: boolean = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      if (typeof window === 'undefined' || !window.tokenMonitor?.getServiceStatus) return;
      const result = await window.tokenMonitor.getServiceStatus({ force });
      if (result && Array.isArray(result.providers)) {
        setProviders(result.providers);
        setCheckedAt(result.checkedAt || new Date().toISOString());
      }
    } catch (err) {
      console.error('[ServiceStatusView] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus(false);
  }, []);

  const openExternalUrl = (url?: string) => {
    if (!url) return;
    if (typeof window !== 'undefined' && window.tokenMonitor?.openExternalUrl) {
      window.tokenMonitor.openExternalUrl(url);
    } else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          window.open(url, '_blank');
        }
      } catch {
        return;
      }
    }
  };

  const getStatusBadge = (indicator?: string, statusTone?: string) => {
    const ind = (indicator || statusTone || '').toLowerCase();
    if (ind === 'none' || ind === 'operational' || ind === 'good' || ind === 'ok') {
      return (
        <Badge variant="outline" className="gap-1 font-medium text-[10px] text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="size-3 text-emerald-500" /> Operational
        </Badge>
      );
    }
    if (ind === 'minor' || ind === 'degraded' || ind === 'warning') {
      return (
        <Badge variant="outline" className="gap-1 font-medium text-[10px] text-amber-500 border-amber-500/30">
          <AlertTriangle className="size-3 text-amber-500" /> Degraded
        </Badge>
      );
    }
    if (ind === 'major' || ind === 'partial_outage' || ind === 'critical') {
      return (
        <Badge variant="outline" className="gap-1 font-medium text-[10px] text-destructive border-destructive/30">
          <AlertOctagon className="size-3 text-destructive" /> Outage
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 font-medium text-[10px] text-muted-foreground border-border/40">
        <Activity className="size-3 opacity-60" /> Checked
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full w-full text-foreground select-text">
      <PageHeader
        title="Status"
        subtitle={checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fetchStatus(true)}
          disabled={loading || refreshing}
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Check Now
        </Button>
      </PageHeader>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden px-10 pb-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="mr-2 size-4 animate-spin" /> Checking service endpoints...
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center tm-card p-8">
            <Server className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No service providers monitored</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Click &quot;Check Now&quot; to probe cloud service status endpoints.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((p) => {
                const hasIssues = (p.componentIssues && p.componentIssues.length > 0) || Boolean(p.incidentTitle);

                return (
                  <div
                    key={p.id}
                    className="p-4 tm-card space-y-3 flex flex-col justify-between hover:bg-muted/20 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold text-xs text-foreground">{p.label}</span>
                        {getStatusBadge(p.indicator, p.status)}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {p.description || (p.error ? `Check failed: ${p.error}` : 'All systems operating nominally.')}
                      </p>

                      {p.incidentTitle && (
                        <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
                          <span className="font-medium">Incident:</span> {p.incidentTitle}
                        </div>
                      )}

                      {hasIssues && p.componentIssues && p.componentIssues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-[10px] font-medium text-muted-foreground">Affected Components:</span>
                          <div className="flex flex-wrap gap-1">
                            {p.componentIssues.map((issue, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                {issue.name}: {issue.status}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{p.updatedAt ? `Updated ${p.updatedAt}` : 'Real-time telemetry'}</span>
                      {p.pageUrl && (
                        <button
                          type="button"
                          onClick={() => openExternalUrl(p.pageUrl)}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer text-[11px]"
                        >
                          Status page
                          <ExternalLink className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
