import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Clock,
  Sparkles,
  Calendar,
  Layers,
  Radio,
  Check,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/shell/PageHeader';
import { getProviderIconComponent, OpenAI, ClaudeAI, CursorIcon, DeepSeekIcon } from '~/components/Icons';

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

interface CodexResetForecast {
  status: 'scheduled' | 'active' | 'inactive' | 'unavailable' | 'disabled';
  chancePercent?: number | null;
  predictedAt?: string;
  expiresAt?: string;
  observedAt?: string;
  sourceAuthor?: string;
  scheduledFor?: string;
  scheduledAnnouncedAt?: string;
  scheduledResetType?: string;
  latestResetAt?: string;
  latestResetType?: string;
  checkedAt?: string;
  pageUrl?: string;
  stale?: boolean;
  error?: string;
  errorKind?: string;
}

type FilterView = 'all' | 'issues' | 'forecast';

function formatRelativeAgo(dateValue?: string | number, nowMs: number = Date.now()): string {
  if (!dateValue) return '';
  const parsed = typeof dateValue === 'number' ? dateValue : Date.parse(dateValue);
  if (!Number.isFinite(parsed)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1m ago';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatCountdown(targetIso?: string, nowMs: number = Date.now()): string {
  if (!targetIso) return '';
  const parsed = Date.parse(targetIso);
  if (!Number.isFinite(parsed)) return '';
  const diffSec = Math.floor((parsed - nowMs) / 1000);
  if (diffSec <= 0) return 'due now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffHours < 24) return remMin > 0 ? `in ${diffHours}h ${remMin}m` : `in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return remHours > 0 ? `in ${diffDays}d ${remHours}h` : `in ${diffDays}d`;
}

function formatDateTime(isoString?: string): string {
  if (!isoString) return '';
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return '';
  try {
    const d = new Date(parsed);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function ServiceStatusView() {
  const [providers, setProviders] = useState<ServiceProviderStatus[]>([]);
  const [resetForecast, setResetForecast] = useState<CodexResetForecast | null>(null);
  const [forecastEnabledInSettings, setForecastEnabledInSettings] = useState<boolean>(false);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<FilterView>('all');
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Keep countdowns & relative timestamps lively
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = useCallback(async (force: boolean = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      if (typeof window === 'undefined' || !window.tokenMonitor) return;
      const tm = window.tokenMonitor;

      // Parallel telemetry fetch: service status, Tibo reset forecast, and user settings
      const [serviceResult, forecastResult, settingsResult] = await Promise.allSettled([
        tm.getServiceStatus ? tm.getServiceStatus({ force }) : Promise.resolve(null),
        tm.getCodexResetForecast ? tm.getCodexResetForecast({ force, bypassSetting: true }) : Promise.resolve(null),
        tm.getSettings ? tm.getSettings() : Promise.resolve(null),
      ]);

      if (serviceResult.status === 'fulfilled' && serviceResult.value && Array.isArray(serviceResult.value.providers)) {
        setProviders(serviceResult.value.providers);
        setCheckedAt(serviceResult.value.checkedAt || new Date().toISOString());
      }

      if (forecastResult.status === 'fulfilled' && forecastResult.value) {
        setResetForecast(forecastResult.value);
      }

      if (settingsResult.status === 'fulfilled' && settingsResult.value) {
        setForecastEnabledInSettings(Boolean(settingsResult.value.codexResetForecastEnabled));
      }
    } catch (err) {
      console.error('[ServiceStatusView] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setNowMs(Date.now());
    }
  }, []);

  useEffect(() => {
    fetchStatus(false);
  }, [fetchStatus]);

  const toggleLimitsForecastSetting = async () => {
    if (typeof window === 'undefined' || !window.tokenMonitor?.updateSettings) return;
    const nextValue = !forecastEnabledInSettings;
    setForecastEnabledInSettings(nextValue);
    try {
      await window.tokenMonitor.updateSettings({ codexResetForecastEnabled: nextValue });
    } catch (err) {
      console.error('[ServiceStatusView] updateSettings error:', err);
      setForecastEnabledInSettings(!nextValue);
    }
  };

  const openExternalUrl = (url?: string) => {
    if (!url) return;
    if (typeof window !== 'undefined' && window.tokenMonitor?.openExternalUrl) {
      window.tokenMonitor.openExternalUrl(url);
    } else if (typeof window !== 'undefined' && window.tokenMonitor?.openExternal) {
      window.tokenMonitor.openExternal(url);
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

  // Aggregated health overview
  const systemSummary = useMemo(() => {
    const list = providers || [];
    const hasOutage = list.some((p) => p.status === 'outage');
    const hasDegraded = list.some((p) => p.status === 'degraded');
    const incidentCount = list.reduce(
      (acc, p) => acc + (p.incidentCount || (p.incidentTitle ? 1 : 0)),
      0
    );
    const maintenanceCount = list.reduce((acc, p) => acc + (p.maintenanceCount || 0), 0);

    let tone: 'ok' | 'degraded' | 'outage' | 'unknown' = 'ok';
    let text = 'All Systems Operational';

    if (hasOutage) {
      tone = 'outage';
      text = 'Service Outage Detected';
    } else if (hasDegraded || incidentCount > 0) {
      tone = 'degraded';
      text = incidentCount > 0 ? `${incidentCount} Active Incident${incidentCount > 1 ? 's' : ''}` : 'Degraded Performance';
    } else if (list.length === 0) {
      tone = 'unknown';
      text = 'Telemetry Inactive';
    }

    return { tone, text, incidentCount, maintenanceCount, total: list.length };
  }, [providers]);

  // Provider icon renderer
  const renderProviderIcon = (providerId: string) => {
    const norm = String(providerId || '').toLowerCase();
    if (norm === 'openai' || norm === 'codex') {
      return <OpenAI className="size-4 shrink-0 text-foreground" />;
    }
    if (norm === 'claude') {
      return <ClaudeAI className="size-4 shrink-0 text-[#d97757]" />;
    }
    if (norm === 'cursor') {
      return <CursorIcon className="size-4 shrink-0 text-foreground" />;
    }
    if (norm === 'deepseek') {
      return <DeepSeekIcon className="size-4 shrink-0 text-[#4d6bfe]" />;
    }
    const DynamicIcon = getProviderIconComponent(norm);
    if (DynamicIcon) {
      return <DynamicIcon className="size-4 shrink-0" />;
    }
    return <Server className="size-4 shrink-0 text-muted-foreground" />;
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
    if (ind === 'major' || ind === 'partial_outage' || ind === 'critical' || ind === 'outage') {
      return (
        <Badge variant="outline" className="gap-1 font-medium text-[10px] text-destructive border-destructive/30">
          <AlertOctagon className="size-3 text-destructive" /> Outage
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 font-medium text-[10px] text-muted-foreground border-border/40">
        <Activity className="size-3 opacity-60" /> Checking
      </Badge>
    );
  };

  const filteredProviders = useMemo(() => {
    if (filter === 'issues') {
      return providers.filter(
        (p) =>
          p.status === 'degraded' ||
          p.status === 'outage' ||
          Boolean(p.incidentTitle) ||
          (p.componentIssues && p.componentIssues.length > 0)
      );
    }
    return providers;
  }, [providers, filter]);

  return (
    <div className="flex flex-col h-full w-full text-foreground select-text">
      <PageHeader
        title="Status"
        subtitle={
          <div className="flex items-center gap-2">
            <span
              className={`inline-block size-2 rounded-full ${
                systemSummary.tone === 'ok'
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : systemSummary.tone === 'degraded'
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : systemSummary.tone === 'outage'
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="font-medium text-foreground">{systemSummary.text}</span>
            {checkedAt && (
              <span className="text-muted-foreground font-normal">
                · {formatRelativeAgo(checkedAt, nowMs)}
              </span>
            )}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {/* Segmented Filter Control */}
          <div className="flex items-center rounded-sm border border-border p-0.5 text-xs bg-muted/20">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 text-[11px] font-mono tracking-wider uppercase rounded-xs transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('issues')}
              className={`px-2 py-0.5 text-[11px] font-mono tracking-wider uppercase rounded-xs transition-colors cursor-pointer flex items-center gap-1 ${
                filter === 'issues'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Issues
              {systemSummary.incidentCount > 0 && (
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold">
                  {systemSummary.incidentCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilter('forecast')}
              className={`px-2 py-0.5 text-[11px] font-mono tracking-wider uppercase rounded-xs transition-colors cursor-pointer ${
                filter === 'forecast'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Forecasts
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchStatus(true)}
            disabled={loading || refreshing}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Check Now
          </Button>
        </div>
      </PageHeader>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden px-6 sm:px-8 xl:px-10 pb-6">
        {loading && providers.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground text-sm space-y-2">
            <RefreshCw className="size-5 animate-spin text-foreground/60" />
            <p className="font-mono text-xs uppercase tracking-wider">Probing telemetry & reset forecasts...</p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-3">
            <div className="space-y-5 pb-4">
              {/* Telemetry Metric Cards Ribbon */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="tm-card p-3 space-y-1">
                  <div className="tm-label">System Health</div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      className={`size-2 rounded-full ${
                        systemSummary.tone === 'ok'
                          ? 'bg-emerald-500'
                          : systemSummary.tone === 'degraded'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="tm-display text-base font-bold text-foreground">
                      {systemSummary.tone === 'ok' ? 'ALL NOMINAL' : systemSummary.tone === 'degraded' ? 'DEGRADED' : 'OUTAGE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {systemSummary.incidentCount === 0 ? 'No disruptions reported' : `${systemSummary.incidentCount} active disruption(s)`}
                  </p>
                </div>

                <div className="tm-card p-3 space-y-1">
                  <div className="tm-label">Monitored Platforms</div>
                  <div className="tm-display text-base font-bold text-foreground pt-0.5">
                    {providers.length} PLATFORMS
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Claude · OpenAI · Cursor · DeepSeek
                  </p>
                </div>

                <div className="tm-card p-3 space-y-1">
                  <div className="tm-label">Active Incidents</div>
                  <div className="tm-display text-base font-bold text-foreground pt-0.5">
                    {systemSummary.incidentCount} ACTIVE
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {systemSummary.maintenanceCount > 0
                      ? `${systemSummary.maintenanceCount} planned maintenance`
                      : 'Zero scheduled maintenance'}
                  </p>
                </div>

                <div className="tm-card p-3 space-y-1">
                  <div className="tm-label">Codex Reset Signal (Tibo)</div>
                  <div className="tm-display text-base font-bold text-foreground pt-0.5 flex items-center gap-1.5 truncate">
                    {resetForecast?.status === 'scheduled' ? (
                      <span className="text-emerald-500">SCHEDULED</span>
                    ) : resetForecast?.status === 'active' ? (
                      <span className="text-indigo-400">
                        {Number.isFinite(resetForecast.chancePercent)
                          ? `${Math.round(resetForecast.chancePercent || 0)}% CHANCE`
                          : 'ACTIVE WATCH'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">NOMINAL</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {resetForecast?.sourceAuthor || '@thsottiaux'} · codex-resets.com
                  </p>
                </div>
              </div>

              {/* Featured Tibo Reset Forecast Card */}
              {(filter === 'all' || filter === 'forecast') && (
                <div className="tm-card p-4 space-y-3.5 border-border/80">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-sm bg-muted/40 border border-border/60 flex items-center justify-center shrink-0">
                        <OpenAI className="size-4 text-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-foreground">Codex Quota Reset Forecast</h2>
                          {resetForecast?.status === 'scheduled' ? (
                            <Badge variant="outline" className="gap-1 text-[10px] font-mono uppercase text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                              <Calendar className="size-3 text-emerald-400" /> Scheduled Reset
                            </Badge>
                          ) : resetForecast?.status === 'active' ? (
                            <Badge variant="outline" className="gap-1 text-[10px] font-mono uppercase text-indigo-400 border-indigo-500/30 bg-indigo-500/10">
                              <Sparkles className="size-3 text-indigo-400" />
                              {Number.isFinite(resetForecast?.chancePercent)
                                ? `${Math.round(resetForecast.chancePercent || 0)}% Probability`
                                : 'Active Signal'}
                            </Badge>
                          ) : resetForecast?.status === 'inactive' ? (
                            <Badge variant="outline" className="gap-1 text-[10px] font-mono uppercase text-muted-foreground border-border/40">
                              <Radio className="size-3 opacity-60" /> Nominal Window
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-[10px] font-mono uppercase text-muted-foreground border-border/40">
                              <Info className="size-3 opacity-60" /> Telemetry Idle
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Community quota replenishment forecasts provided by{' '}
                          <span className="font-medium text-foreground">{resetForecast?.sourceAuthor || 'Tibo (@thsottiaux)'}</span>{' '}
                          via codex-resets.com
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={toggleLimitsForecastSetting}
                        className="h-7 text-[11px] font-mono uppercase tracking-wider gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                        title={
                          forecastEnabledInSettings
                            ? 'Reset forecast is currently visible on the Codex card in the Limits view'
                            : 'Enable reset forecast to also display on the Codex card in Limits'
                        }
                      >
                        <Check className={`size-3 ${forecastEnabledInSettings ? 'text-emerald-500' : 'opacity-30'}`} />
                        Limits View: {forecastEnabledInSettings ? 'Enabled' : 'Disabled'}
                      </Button>

                      <button
                        type="button"
                        onClick={() => openExternalUrl(resetForecast?.pageUrl || 'https://codex-resets.com/')}
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        codex-resets.com
                        <ExternalLink className="size-3" />
                      </button>
                    </div>
                  </div>

                  {/* Forecast Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {/* Forecast Window / Expected Reset */}
                    <div className="rounded-sm bg-muted/15 border border-border/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="tm-label">Forecast Horizon</span>
                        <Clock className="size-3.5 text-muted-foreground/60" />
                      </div>

                      {resetForecast?.status === 'scheduled' ? (
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-foreground">
                            {formatDateTime(resetForecast.scheduledFor)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                            <span>{formatCountdown(resetForecast.scheduledFor, nowMs)}</span>
                            {resetForecast.scheduledResetType && (
                              <Badge variant="outline" className="text-[9px] uppercase font-mono py-0 px-1 border-emerald-500/30 text-emerald-400">
                                {resetForecast.scheduledResetType} reset
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : resetForecast?.status === 'active' ? (
                        <div className="space-y-1.5">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="font-semibold text-foreground">
                              {Number.isFinite(resetForecast.chancePercent)
                                ? `${Math.round(resetForecast.chancePercent || 0)}% Confidence`
                                : 'Active Reset Watch'}
                            </span>
                            {resetForecast.expiresAt && (
                              <span className="text-muted-foreground text-[10px]">
                                {formatCountdown(resetForecast.expiresAt, nowMs)}
                              </span>
                            )}
                          </div>
                          {Number.isFinite(resetForecast.chancePercent) && (
                            <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(5, resetForecast.chancePercent || 0))}%` }}
                              />
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground truncate">
                            {resetForecast.predictedAt
                              ? `Target: ${formatDateTime(resetForecast.predictedAt)}`
                              : resetForecast.expiresAt
                              ? `Window open until ${formatDateTime(resetForecast.expiresAt)}`
                              : 'High signal reset watch in progress'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-foreground">No Active Watch Signal</div>
                          <p className="text-[11px] text-muted-foreground">
                            Standard rolling quotas and 5-hour refresh windows currently apply.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Latest Observed Reset */}
                    <div className="rounded-sm bg-muted/15 border border-border/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="tm-label">Previous Observed Reset</span>
                        <Layers className="size-3.5 text-muted-foreground/60" />
                      </div>
                      {resetForecast?.latestResetAt ? (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-foreground">
                            {formatDateTime(resetForecast.latestResetAt)}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{formatRelativeAgo(resetForecast.latestResetAt, nowMs)}</span>
                            {resetForecast.latestResetType && (
                              <Badge variant="outline" className="text-[9px] uppercase font-mono py-0 px-1 border-border/50 text-muted-foreground">
                                {resetForecast.latestResetType}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground pt-1">
                          Historical reset record unavailable.
                        </p>
                      )}
                    </div>

                    {/* Telemetry Attribution & Diagnostics */}
                    <div className="rounded-sm bg-muted/15 border border-border/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="tm-label">Signal Provenance</span>
                        <Sparkles className="size-3.5 text-muted-foreground/60" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-foreground truncate">
                          {resetForecast?.sourceAuthor || '@thsottiaux'}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-normal">
                          {resetForecast?.observedAt
                            ? `Observed ${formatRelativeAgo(resetForecast.observedAt, nowMs)} · `
                            : ''}
                          Telemetry verified through codex-resets.com API.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Monitored AI Cloud Providers */}
              {(filter === 'all' || filter === 'issues') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="tm-label">AI Platform Endpoints</span>
                    <span className="text-[11px] text-muted-foreground">
                      {filteredProviders.length} of {providers.length} platforms shown
                    </span>
                  </div>

                  {filteredProviders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center tm-card p-6 border-dashed">
                      <CheckCircle2 className="size-8 text-emerald-500/60 mb-2" />
                      <p className="text-sm font-medium text-foreground">Zero Active Issues</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        All monitored cloud AI endpoints are operating normally without reported degradation.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredProviders.map((p) => {
                        const hasIncident = Boolean(p.incidentTitle);
                        const hasComponentIssues = p.componentIssues && p.componentIssues.length > 0;
                        const hasMaintenance = Number(p.maintenanceCount) > 0;

                        return (
                          <div
                            key={p.id}
                            className={`p-4 tm-card space-y-3 flex flex-col justify-between hover:bg-muted/20 transition-colors ${
                              hasIncident ? 'border-amber-500/40' : ''
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="size-6 rounded-xs bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
                                    {renderProviderIcon(p.id)}
                                  </div>
                                  <span className="font-semibold text-xs text-foreground">{p.label}</span>
                                </div>
                                {getStatusBadge(p.indicator, p.status)}
                              </div>

                              {/* Active Incident Banner */}
                              {hasIncident && (
                                <div className="mb-2.5 p-2 rounded-xs bg-amber-500/10 border border-amber-500/25 text-xs text-amber-500 space-y-1">
                                  <div className="flex items-center gap-1.5 font-semibold">
                                    <AlertTriangle className="size-3.5 shrink-0" />
                                    <span>Incident: {p.incidentTitle}</span>
                                  </div>
                                </div>
                              )}

                              {/* Planned Maintenance Notice */}
                              {hasMaintenance && (
                                <div className="mb-2 p-1.5 rounded-xs bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-400 flex items-center gap-1.5">
                                  <Clock className="size-3 shrink-0" />
                                  <span>{p.maintenanceCount} scheduled maintenance window active</span>
                                </div>
                              )}

                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {p.description || (p.error ? `Check failed: ${p.error}` : 'All systems operating nominally.')}
                              </p>

                              {/* Affected Components */}
                              {hasComponentIssues && p.componentIssues && (
                                <div className="mt-2.5 space-y-1">
                                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                    Affected Components:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {p.componentIssues.map((issue, idx) => (
                                      <Badge
                                        key={idx}
                                        variant="outline"
                                        className="text-[10px] text-amber-500 border-amber-500/30 font-mono py-0"
                                      >
                                        {issue.name}: {issue.status}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="pt-3 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground">
                              <span className="text-[11px]">
                                {p.updatedAt ? `Updated ${formatRelativeAgo(p.updatedAt, nowMs)}` : 'Real-time telemetry'}
                              </span>
                              {p.pageUrl && (
                                <button
                                  type="button"
                                  onClick={() => openExternalUrl(p.pageUrl)}
                                  className="inline-flex items-center gap-1 text-[11px] hover:text-foreground transition-colors cursor-pointer"
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
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
