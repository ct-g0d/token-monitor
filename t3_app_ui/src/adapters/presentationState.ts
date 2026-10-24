import { Atom } from "effect/reactivity";
import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageWindow,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import type { EnvironmentPresentation } from "@t3tools/client-runtime/connection";
import type { TokenMonitorStats } from "../types/tokenMonitor";
import { appAtomRegistry } from "./atomRegistry";
import { serverSettingsAtom } from "./serverState";

export type EnvironmentPresentationWithProviders = EnvironmentPresentation;
export const PRIMARY_ENV_ID = EnvironmentId.make("primary-environment");

export function extractStats(raw: any): TokenMonitorStats | null {
  if (!raw) return null;
  if (raw.data?.stats) return raw.data.stats;
  if (raw.stats) return raw.stats;
  return raw;
}

function maskEmailIfNeeded(email: string | undefined, mask: boolean): string | undefined {
  if (!email || !mask) return email;
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [name, domain] = parts;
  if (!name || !domain) return email;
  const visible = name.length > 2 ? `${name.slice(0, 2)}***` : `${name.slice(0, 1)}***`;
  return `${visible}@${domain}`;
}

function creditsMeterPercent(item: any, window: any): number | null {
  if (typeof window?.usedPercent === "number") return window.usedPercent;
  if (typeof window?.remainingPercent === "number") return 100 - window.remainingPercent;
  const amount = typeof window?.remaining === "number" ? window.remaining : item?.balance?.amount;
  const spend = item?.balance?.monthSpend;
  if (typeof amount !== "number") return null;
  if (amount <= 0) return amount === 0 ? 100 : null;
  return typeof spend === "number" ? (spend / (amount + Math.max(0, spend))) * 100 : 0;
}

function makeInstanceId(rawDriver: string, accountIdentifier: string, idx: number): ProviderInstanceId {
  const safeDriver = rawDriver.replace(/[^a-zA-Z0-9_-]/g, "_") || "p";
  const safeId = accountIdentifier.replace(/[^a-zA-Z0-9_-]/g, "_") || String(idx);
  let slug = `${safeDriver}_${safeId}`;
  if (!/^[a-zA-Z]/.test(slug)) {
    slug = `p_${slug}`;
  }
  if (slug.length > 64) {
    slug = slug.slice(0, 64);
  }
  return ProviderInstanceId.make(slug);
}

export function transformStatsToProviders(
  stats: TokenMonitorStats | null,
  maskEmails: boolean = false,
): ReadonlyArray<ServerProvider> {
  if (!stats?.limits) return [];

  const rawList = Array.isArray((stats.limits as any).providers)
    ? (stats.limits as any).providers
    : Array.isArray(stats.limits)
      ? stats.limits
      : [];

  const flattened: any[] = [];
  rawList.forEach((prov: any) => {
    if (Array.isArray(prov.accounts) && prov.accounts.length > 0) {
      prov.accounts.forEach((acc: any) => {
        flattened.push({
          ...acc,
          provider: acc.provider || prov.provider,
          status: acc.status || prov.status,
          updatedAt: acc.updatedAt || prov.updatedAt,
        });
      });
    } else {
      flattened.push(prov);
    }
  });

  const results: ServerProvider[] = [];

  flattened.forEach((item: any, idx: number) => {
    const rawDriver = String(item.provider || "").trim();
    if (!rawDriver) return;
    const driverKind = (rawDriver === "claude" ? "claudeAgent" : rawDriver) as ProviderDriverKind;
    const accountIdentifier = String(item.accountKey || item.accountId || item.accountName || rawDriver);
    const instanceId = makeInstanceId(rawDriver, accountIdentifier, idx);

    const displayName = item.accountName || item.accountLabel || (rawDriver === "claude" ? "Claude Code" : undefined);

    const rawWindows = Array.isArray(item.windows) ? item.windows : [];
    const mappedWindows: ServerProviderUsageWindow[] = rawWindows.flatMap((w: any, wIdx: number) => {
      let percentUsed: number | null = null;
      if (w?.metric === "credits") {
        const meter = creditsMeterPercent(item, w);
        if (meter !== null) percentUsed = meter;
      } else if (typeof w.usedPercent === "number") {
        percentUsed = w.usedPercent;
      } else if (typeof w.percentage === "number") {
        percentUsed = w.percentage;
      } else if (typeof w.remainingPercent === "number") {
        percentUsed = 100 - w.remainingPercent;
      }
      if (percentUsed === null && w?.metric !== "credits") {
        if (w?.showMeter === false || typeof w?.resetDescription === "string" || w?.resetsAt) {
          percentUsed = 100;
        } else {
          return [];
        }
      }

      // Valid kind literals: "session" | "weekly" | "monthly" | "other"
      let kind: "session" | "weekly" | "monthly" | "other" = "other";
      if (w.kind === "session" || w.kind === "weekly" || w.kind === "monthly") {
        kind = w.kind;
      } else if (w.kind === "billing") {
        kind = "monthly";
      }

      const winDuration =
        typeof w.windowMinutes === "number"
          ? w.windowMinutes
          : w.windowDurationMins;

      let label = String(w.label || w.name || "").trim();
      if (!label) {
        if (kind === "session") label = "Session";
        else if (kind === "weekly") label = "Weekly";
        else if (kind === "monthly") label = "Monthly";
        else label = `Quota ${wIdx + 1}`;
      }

      let windowId = String(w.limitId || w.id || "").trim();
      if (!windowId || windowId === "claude" || windowId === "codex") {
        windowId = `${rawDriver}-${kind}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      }

      return [{
        id: windowId,
        kind,
        label,
        usedPercent: percentUsed !== null ? Math.max(0, Math.min(100, percentUsed)) : 0,
        ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}),
        ...(typeof winDuration === "number" ? { windowDurationMins: winDuration } : {}),
        ...(w.metric === "credits" ? { metric: "credits" } : {}),
        ...(typeof w.remaining === "number" ? { remaining: w.remaining } : (typeof item?.balance?.amount === "number" ? { remaining: item.balance.amount } : {})),
        ...(w.currency ? { currency: w.currency } : (item?.balance?.currency ? { currency: item.balance.currency } : {})),
      } as any];
    });

    const rawCheckedAt = item.updatedAt || item.checkedAt || (stats.limits as any)?.updatedAt;
    const checkedAt =
      typeof rawCheckedAt === "string" && Number.isFinite(Date.parse(rawCheckedAt))
        ? rawCheckedAt
        : new Date().toISOString();

    const isNotConfigured = item.status === "notConfigured";
    const unavailableReason = item.status === "unsupported" ? "unsupported" :
      item.status && item.status !== "ok" && !isNotConfigured && mappedWindows.length === 0 ? "probeFailed" : undefined;
    if (mappedWindows.length === 0 && !unavailableReason && !isNotConfigured) return;

    const resetCredits =
      item.resetCredits && typeof item.resetCredits.availableCount === "number"
        ? {
            availableCount: item.resetCredits.availableCount,
            ...(item.resetCredits.nextExpiresAt ? { nextExpiresAt: item.resetCredits.nextExpiresAt } : {}),
          }
        : undefined;

    const usageLimits: ServerProviderUsageLimits = {
      checkedAt,
      windows: mappedWindows,
      resetCredits,
      credentialFingerprint: item.accountKey ? String(item.accountKey) : undefined,
      ...(unavailableReason ? { unavailable: { reason: unavailableReason, ...(item.message ? { message: String(item.message) } : {}) } } : {}),
      ...(item.balance ? { balance: item.balance } : {}),
    } as any;

    const rawEmail =
      (typeof item.accountEmail === "string" && item.accountEmail.trim()) ||
      (typeof item.email === "string" && item.email.trim()) ||
      undefined;
    const realEmail = rawEmail ? maskEmailIfNeeded(rawEmail, maskEmails) : undefined;

    const authLabel = item.accountLabel || item.planLabel || item.plan;

    results.push({
      instanceId,
      driver: driverKind,
      ...(displayName ? { displayName } : {}),
      accentColor: undefined,
      enabled: item.status !== "disabled",
      installed: true,
      availability: "available",
      status: unavailableReason ? "error" : item.status === "disabled" ? "disabled" : isNotConfigured ? "ready" : "ready",
      version: null,
      skills: [],
      auth: {
        status: isNotConfigured ? "unauthenticated" : (rawEmail ? "authenticated" : "unknown"),
        email: realEmail,
        workspaceId: item.accountKey ? String(item.accountKey) : String(idx),
        ...(authLabel ? { label: authLabel } : {}),
      },
      checkedAt,
      models: [],
      slashCommands: [],
      usageLimits,
    });
  });

  return results;
}

export const serverProvidersAtom = Atom.make<ReadonlyArray<ServerProvider>>([]).pipe(
  Atom.withLabel("server-providers")
);

export const primaryPresentationAtom = Atom.make((get): EnvironmentPresentation | null => {
  const providers = get(serverProvidersAtom);
  const settings = get(serverSettingsAtom);

  return {
    entry: {
      enabled: true,
      target: {
        _tag: "local",
        label: "Token Monitor Workstation",
      } as any,
    } as any,
    connection: {
      phase: "connected",
      error: null,
      traceId: null,
    } as any,
    serverConfig: {
      environmentId: PRIMARY_ENV_ID,
      settings: settings || DEFAULT_SERVER_SETTINGS,
      providers,
    } as any,
  };
}).pipe(Atom.withLabel("primary-presentation"));

export const environmentPresentationsAtom = Atom.make((get): ReadonlyMap<EnvironmentId, EnvironmentPresentation> => {
  const primary = get(primaryPresentationAtom);
  const map = new Map<EnvironmentId, EnvironmentPresentation>();
  if (primary) {
    map.set(PRIMARY_ENV_ID, primary);
  }
  return map;
}).pipe(Atom.withLabel("environment-presentations"));

export const providersByEnvironmentAtom = Atom.make((get) => {
  const providers = get(serverProvidersAtom);
  const map = new Map<EnvironmentId, ReadonlyArray<ServerProvider>>();
  map.set(PRIMARY_ENV_ID, providers);
  return map;
}).pipe(Atom.withLabel("providers-by-environment"));

export const environmentPresentations = {
  presentation: Atom.family((envId: EnvironmentId) =>
    Atom.make((get) => {
      const presentations = get(environmentPresentationsAtom);
      return presentations.get(envId) ?? null;
    }).pipe(Atom.withLabel(`environment-presentation:${envId}`))
  ),
  presentationAtom: (envId: EnvironmentId) =>
    Atom.make((get) => {
      const presentations = get(environmentPresentationsAtom);
      return presentations.get(envId) ?? null;
    }).pipe(Atom.withLabel(`environment-presentation-atom:${envId}`)),
  presentationsAtom: environmentPresentationsAtom,
  presentationsWithProvidersAtom: environmentPresentationsAtom,
  providersByEnvironmentAtom,
};

export const environmentPresentation = environmentPresentations;

let lastKnownStats: TokenMonitorStats | null = null;
let lastKnownMaskEmails = false;

export function syncStatsToPresentation(rawStats: any, maskEmails?: boolean) {
  const stats = extractStats(rawStats);
  if (!stats) return;
  if (maskEmails !== undefined) lastKnownMaskEmails = maskEmails;
  lastKnownStats = stats;
  const providers = transformStatsToProviders(stats, lastKnownMaskEmails);
  if (providers.length > 0 || appAtomRegistry.get(serverProvidersAtom).length === 0) {
    appAtomRegistry.set(serverProvidersAtom, providers);
  }
}

// Immediate fetch and event subscriptions on load
if (typeof window !== "undefined" && window.tokenMonitor) {
  const tokenMonitor = window.tokenMonitor;
  Promise.all([
    tokenMonitor.getStats().catch(() => null),
    tokenMonitor.getSettings().catch(() => null),
  ]).then(([stats, settings]) => {
    const maskEmails = Boolean((settings as any)?.maskLimitAccountEmails);
    if (stats) syncStatsToPresentation(stats, maskEmails);
    // If limits aren't available yet in cached stats, trigger a live limits probe
    const actual = extractStats(stats);
    const provs = (actual?.limits as any)?.providers;
    if (!provs || provs.length === 0 || !provs.some((p: any) => p.status === "ok")) {
      tokenMonitor.getStats({ force: true, feedback: true }).then((liveStats: any) => {
        if (liveStats) syncStatsToPresentation(liveStats, maskEmails);
      }).catch(() => null);
    }
  });

  if (typeof tokenMonitor.onStatsPush === "function") {
    tokenMonitor.onStatsPush((nextStats: any) => {
      const settings = appAtomRegistry.get(serverSettingsAtom);
      const maskEmails = Boolean((settings as any)?.maskLimitAccountEmails);
      syncStatsToPresentation(nextStats, maskEmails);
    });
  }

  if (typeof tokenMonitor.onSettingsPush === "function") {
    tokenMonitor.onSettingsPush((nextSettings: any) => {
      const maskEmails = Boolean(nextSettings?.maskLimitAccountEmails);
      if (lastKnownStats) {
        syncStatsToPresentation(lastKnownStats, maskEmails);
      }
    });
  }
}

export function useEnvironmentPresentations(): ReadonlyMap<EnvironmentId, EnvironmentPresentation> {
  return useAtomValue(environmentPresentationsAtom);
}

export function useEnvironmentPresentation(
  environmentId: EnvironmentId | null,
): EnvironmentPresentation | null {
  const presentations = useAtomValue(environmentPresentationsAtom);
  if (!environmentId) return null;
  return presentations.get(environmentId) ?? null;
}
