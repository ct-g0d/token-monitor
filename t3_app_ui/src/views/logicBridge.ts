// Business logic bridge connecting Token Monitor pure UMD modules to T3 views.
// Modules are imported in strict dependency order so `window` globals are populated.

import '../../../src/shared/clientCatalog.js';
import '../../../src/shared/vendorPresentation.js';
import '../../../src/shared/projectKey.js';
import '../../../src/shared/sessionActivityProviders.js';
import '../../../src/shared/sessionLive.js';
import '../../../src/electron/renderer/fixedPeriodRanges.js';
import '../../../src/electron/renderer/deviceBreakdown.js';
import '../../../src/electron/renderer/allTimeSessions.js';
import '../../../src/electron/renderer/sessionRows.js';
import '../../../src/electron/renderer/projectRows.js';
import '../../../src/electron/renderer/sessionDetail.js';

export interface ProjectRow {
  key: string;
  name: string;
  value: number;
  cost: number;
  unpricedTokens?: number;
  clients?: Set<string>;
  clientTokens?: Record<string, number>;
  accordionRows?: Array<{
    key: string;
    name: string;
    value: number;
    percent: number;
    color: string;
  }>;
}

export interface SessionRow {
  key: string;
  kind?: string;
  name: string;
  modelLabel?: string;
  subtitle?: string;
  activitySummary?: string;
  running?: boolean;
  activityState?: 'running' | 'waiting' | 'ended' | 'idle';
  detail?: string;
  value: number;
  cost: number;
  sessionDetailAvailable?: boolean;
  color?: string;
  stale?: boolean;
  client?: string;
  clientLabel?: string;
  sortTime?: number;
  sessionId?: string;
  title?: string;
}

export interface DeviceBreakdownResult {
  totalTokens: number;
  tools: Array<{
    key: string;
    client: string;
    name: string;
    value: number;
    percent: number;
    color: string;
    models: Array<{
      key: string;
      name: string;
      value: number;
    }>;
  }>;
}

export interface SessionExchangeTurn {
  key: string;
  label: string;
  value: number;
  tokensAvailable: boolean;
  cost: number;
  unpricedTokens?: number;
  tokens: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
    total?: number;
  };
  tools: string;
}

export interface SessionExchangeRow {
  key: string;
  isPrompt: boolean;
  title: string;
  subtitle: string;
  value: number;
  tokensAvailable: boolean;
  cost: number;
  startTime: number;
  turnCount: number;
  turns: SessionExchangeTurn[];
}

function getGlobal(key: string) {
  if (typeof window !== 'undefined' && (window as any)[key]) {
    return (window as any)[key];
  }
  return null;
}

export function getSessionExchangeRows(
  detail: any,
  options: { now?: Date; sortBy?: 'tokens' | 'time' } = {}
): SessionExchangeRow[] {
  const api = getGlobal('TokenMonitorSessionDetail');
  if (!api?.exchangeRows) return [];
  try {
    return api.exchangeRows(detail, options) || [];
  } catch (err) {
    console.error('[logicBridge] getSessionExchangeRows error:', err);
    return [];
  }
}

export function getProjectRows(periodData: any, options: any = {}): ProjectRow[] {
  const api = getGlobal('TokenMonitorProjectRows');
  if (!api?.projectRowsForPeriod) return [];
  try {
    return api.projectRowsForPeriod(periodData, options) || [];
  } catch (err) {
    console.error('[logicBridge] getProjectRows error:', err);
    return [];
  }
}

export function isProjectBreakdownIncomplete(stats: any, period: string): boolean {
  const api = getGlobal('TokenMonitorProjectRows');
  if (!api?.projectBreakdownIncomplete) return false;
  try {
    return api.projectBreakdownIncomplete(stats, period);
  } catch {
    return false;
  }
}

export function getSessionRows(periodData: any, options: any = {}): SessionRow[] {
  const api = getGlobal('TokenMonitorSessionRows');
  if (!api?.sessionRowsForPeriod) return [];
  try {
    return api.sessionRowsForPeriod(periodData, options) || [];
  } catch (err) {
    console.error('[logicBridge] getSessionRows error:', err);
    return [];
  }
}

export function getDeviceBreakdown(device: any, periodName: string, options: any = {}): DeviceBreakdownResult {
  const api = getGlobal('TokenMonitorDeviceBreakdown');
  if (!api?.deviceBreakdownForPeriod) {
    const period = device?.periods?.[periodName] || {};
    return {
      totalTokens: Math.max(0, Number(period.totalTokens || 0)),
      tools: [],
    };
  }
  try {
    return api.deviceBreakdownForPeriod(device, periodName, options);
  } catch (err) {
    console.error('[logicBridge] getDeviceBreakdown error:', err);
    return {
      totalTokens: 0,
      tools: [],
    };
  }
}

export function getDeviceLabel(device: any): string {
  const api = getGlobal('TokenMonitorDeviceBreakdown');
  if (api?.deviceLabel) {
    try {
      return api.deviceLabel(device);
    } catch {}
  }
  return String(device?.displayName || device?.hostname || device?.deviceId || 'device').trim();
}

export function getDevicePlatformLabel(platform?: string, osName?: string, osVersion?: string): string {
  const api = getGlobal('TokenMonitorDeviceBreakdown');
  if (api?.devicePlatformLabel) {
    try {
      return api.devicePlatformLabel(platform, osName, osVersion);
    } catch {}
  }
  return [osName || platform, osVersion].filter(Boolean).join(' ');
}

export function mergeAllTimeSessions(stats: any, sessionsMap: any): any {
  const api = getGlobal('TokenMonitorAllTimeSessions');
  if (api?.withAllTimeSessions) {
    try {
      return api.withAllTimeSessions(stats, sessionsMap);
    } catch {}
  }
  const allTime = stats?.periods?.allTime || {};
  return {
    ...stats,
    periods: {
      ...stats?.periods,
      allTime: {
        ...allTime,
        sessions: sessionsMap,
      },
    },
  };
}
