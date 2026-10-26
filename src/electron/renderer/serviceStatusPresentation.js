'use strict';

(function exposeServiceStatusPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorServiceStatusPresentation = api;
})(typeof window !== 'undefined' ? window : null, function createServiceStatusPresentationApi() {
  // Split the affected component names into a short visible slice plus an
  // overflow count, so the meta line can show e.g. "Claude Code, API +2" while
  // the full list stays available (and the data is real text for a11y).
  function affectedComponentNames(componentIssues, limit = 2) {
    const names = (Array.isArray(componentIssues) ? componentIssues : [])
      .map((issue) => String(issue?.name || '').trim())
      .filter(Boolean);
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : names.length;
    return {
      all: names,
      visible: names.slice(0, max),
      overflow: Math.max(0, names.length - max)
    };
  }

  // The card's second line leads with the active incident's name when there is
  // one — it's far more useful (and what the official page headlines) than the
  // generic "Partially Degraded Service", which the status pill already conveys.
  // Falls back to the overall status description when no incident is active.
  function statusHeadline(provider) {
    const incident = String(provider?.incidentTitle || '').trim();
    if (incident) return incident;
    return String(provider?.description || '').trim();
  }

  function agoBucket(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    if (total < 60) return { unit: 'seconds', value: total };
    if (total < 3600) return { unit: 'minutes', value: Math.floor(total / 60) };
    return { unit: 'hours', value: Math.floor(total / 3600) };
  }

  // Summarize Tibo reset forecast state for high-level status displays
  function summarizeResetForecast(forecast) {
    if (!forecast || typeof forecast !== 'object') {
      return { status: 'unavailable', headline: 'Unavailable', detail: '', badgeTone: 'unknown' };
    }
    const status = String(forecast.status || '').toLowerCase();
    if (status === 'scheduled') {
      const typeLabel = forecast.scheduledResetType === 'banked' ? 'Banked Reset' : 'Regular Reset';
      return {
        status: 'scheduled',
        headline: `Scheduled ${typeLabel}`,
        detail: forecast.scheduledFor || '',
        badgeTone: 'ok',
        resetType: forecast.scheduledResetType || 'regular'
      };
    }
    if (status === 'active') {
      const chance = Number.isFinite(forecast.chancePercent) ? `${Math.round(forecast.chancePercent)}% Chance` : 'Active Watch';
      return {
        status: 'active',
        headline: chance,
        detail: forecast.predictedAt || forecast.expiresAt || '',
        badgeTone: 'signal',
        chancePercent: forecast.chancePercent
      };
    }
    if (status === 'inactive') {
      return {
        status: 'inactive',
        headline: 'No Active Signal',
        detail: forecast.latestResetAt || '',
        badgeTone: 'nominal'
      };
    }
    if (status === 'disabled') {
      return {
        status: 'disabled',
        headline: 'Forecast Disabled',
        detail: '',
        badgeTone: 'muted'
      };
    }
    return {
      status: 'unavailable',
      headline: forecast.error ? 'Telemetry Unavailable' : 'No Signal Detected',
      detail: forecast.error || '',
      badgeTone: 'unknown'
    };
  }

  // Overall aggregate status across all monitored service providers and optional forecast
  function overallSystemStatus(providers = [], forecast = null) {
    const list = Array.isArray(providers) ? providers : [];
    const hasOutage = list.some((p) => p.status === 'outage');
    const hasDegraded = list.some((p) => p.status === 'degraded');
    const hasUnknown = list.some((p) => p.status === 'unknown');
    const activeIncidents = list.reduce((acc, p) => acc + (p.incidentCount || (p.incidentTitle ? 1 : 0)), 0);
    const activeMaintenance = list.reduce((acc, p) => acc + (p.maintenanceCount || 0), 0);

    let tone = 'ok';
    let label = 'All Systems Operational';

    if (hasOutage) {
      tone = 'outage';
      label = 'Service Outage Detected';
    } else if (hasDegraded) {
      tone = 'degraded';
      label = activeIncidents > 0 ? `${activeIncidents} Active Incident${activeIncidents > 1 ? 's' : ''}` : 'Degraded Performance';
    } else if (list.length === 0 || hasUnknown) {
      tone = list.length === 0 ? 'unknown' : 'degraded';
      label = list.length === 0 ? 'Telemetry Unavailable' : 'Partial Telemetry';
    }

    return {
      tone,
      label,
      totalMonitored: list.length,
      activeIncidents,
      activeMaintenance,
      hasForecast: Boolean(forecast && forecast.status && forecast.status !== 'unavailable' && forecast.status !== 'disabled')
    };
  }

  return { affectedComponentNames, agoBucket, statusHeadline, summarizeResetForecast, overallSystemStatus };
});
