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
  const visible = name.length > 2 ? `${name.slice(0, 2)}***` : `${name.slice(0, 1)}***`;
  return `${visible}@${domain}`;
}

// Wire marker for money balances following src/shared/limits/balanceDisplay.js
function creditsMeterPercent(item: any, window: any): number | null {
  const used = typeof window?.usedPercent === "number" ? window.usedPercent : null;
  if (used !== null) return Math.max(0, Math.min(100, 100 - used));
  const remaining = typeof window?.remainingPercent === "number" ? window.remainingPercent : null;
  if (remaining !== null) return Math.max(0, Math.min(100, remaining));
  const amount =
    typeof window?.remaining === "number"
      ? window.remaining
      : typeof item?.balance?.amount === "number"
        ? item.balance.amount
        : null;
  if (amount === null) return null;
  const funds = Math.max(0, amount);
  if (funds === 0) return 0;
  const spend = Math.max(0, typeof item?.balance?.monthSpend === "number" ? item.balance.monthSpend : 0);
  return Math.max(0, Math.min(100, (funds / (funds + spend)) * 100));
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
  const nowIso = (stats.limits as any)?.updatedAt || new Date().toISOString();

  flattened.forEach((item: any, idx: number) => {
    const rawDriver = String(item.provider || "generic");
    const driverKind = (rawDriver === "claude" ? "claudeAgent" : rawDriver) as ProviderDriverKind;
    const accountIdentifier = String(item.accountKey || item.accountId || item.accountName || item.label || idx);
    const instanceId = makeInstanceId(rawDriver, accountIdentifier, idx);

    const displayName =
      item.accountName ||
      item.accountLabel ||
      item.displayName ||
      (rawDriver === "codex"
        ? "Codex"
        : rawDriver === "claude" || rawDriver === "claudeAgent"
          ? "Claude"
          : rawDriver === "cursor"
            ? "Cursor"
            : rawDriver);

    const rawWindows = Array.isArray(item.windows) ? item.windows : [];
    const mappedWindows: ServerProviderUsageWindow[] = rawWindows.map((w: any, wIdx: number) => {
      let percentUsed = 0;
      if (w?.metric === "credits") {
        const meter = creditsMeterPercent(item, w);
        if (meter !== null) {
          percentUsed = Math.max(0, Math.min(100, Math.round(100 - meter)));
        }
      } else if (typeof w.usedPercent === "number") {
        percentUsed = Math.max(0, Math.min(100, Math.round(w.usedPercent)));
      } else if (typeof w.percentage === "number") {
        percentUsed = Math.max(0, Math.min(100, Math.round(w.percentage)));
      } else if (typeof w.remainingPercent === "number") {
        percentUsed = Math.max(0, Math.min(100, 100 - Math.round(w.remainingPercent)));
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
          : typeof w.windowDurationMins === "number"
            ? w.windowDurationMins
            : 300;

      let windowId = String(w.limitId || w.id || "");
      if (!windowId) {
        if (rawDriver === "antigravity") {
          const l = (w.label || "").toLowerCase();
          if (l.includes("gemini") && (l.includes("5h") || l.includes("5-hour"))) windowId = "gemini-5h";
          else if (l.includes("gemini") && l.includes("week")) windowId = "gemini-weekly";
          else if (l.includes("claude") && (l.includes("5h") || l.includes("5-hour"))) windowId = "claude-5h";
          else if (l.includes("claude") && l.includes("week")) windowId = "claude-weekly";
          else windowId = `window-${wIdx}`;
        } else {
          windowId = `window-${wIdx}`;
        }
      }

      return {
        id: windowId,
        kind,
        label: String(w.label || (kind === "session" ? "Session" : kind === "weekly" ? "Weekly" : "Quota")),
        usedPercent: percentUsed,
        resetsAt: w.resetsAt ? new Date(w.resetsAt).toISOString() : undefined,
        windowDurationMins: winDuration,
      };
    });

    const resetCredits =
      item.resetCredits && typeof item.resetCredits.availableCount === "number"
        ? {
            availableCount: item.resetCredits.availableCount,
            nextExpiresAt: item.resetCredits.nextExpiresAt ? new Date(item.resetCredits.nextExpiresAt).toISOString() : undefined,
          }
        : undefined;

    const usageLimits: ServerProviderUsageLimits = {
      checkedAt: nowIso,
      windows: mappedWindows,
      resetCredits,
      credentialFingerprint: item.accountKey ? String(item.accountKey) : undefined,
    };

    const rawEmail =
      (typeof item.accountEmail === "string" && item.accountEmail.trim()) ||
      (typeof item.email === "string" && item.email.trim()) ||
      undefined;
    const realEmail = rawEmail ? maskEmailIfNeeded(rawEmail, maskEmails) : undefined;

    const authLabel =
      item.accountLabel ||
      item.planLabel ||
      item.plan ||
      (driverKind === "codex" ? "ChatGPT" : driverKind === "claudeAgent" ? "Claude" : "Pro");

    results.push({
      instanceId,
      driver: driverKind,
      displayName,
      accentColor: undefined,
      enabled: item.status !== "disabled",
      installed: true,
      availability: "available",
      status: "ready",
      version: "1.0.0",
      skills: [],
      auth: {
        status: "authenticated",
        email: realEmail,
        label: authLabel,
      },
      checkedAt: nowIso,
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

export const primaryPresentationAtom = Atom.make<EnvironmentPresentation | null>((get) => {
  const providers = get(serverProvidersAtom);
  const settings = get(serverSettingsAtom);

  return {
    environmentId: PRIMARY_ENV_ID,
    label: "Token Monitor Workstation",
    entry: {
      environmentId: PRIMARY_ENV_ID,
      enabled: true,
      target: {
        _tag: "local",
        label: "Token Monitor Workstation",
      } as any,
    },
    connection: {
      phase: "connected",
    },
    serverConfig: {
      version: "1.0.0",
      environmentId: PRIMARY_ENV_ID,
      settings: settings || DEFAULT_SERVER_SETTINGS,
      providers,
    },
  };
}).pipe(Atom.withLabel("primary-presentation"));

export const environmentPresentationsAtom = Atom.make<
  ReadonlyMap<EnvironmentId, EnvironmentPresentation>
>((get) => {
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
  Promise.all([
    window.tokenMonitor.getStats().catch(() => null),
    window.tokenMonitor.getSettings().catch(() => null),
  ]).then(([stats, settings]) => {
    const maskEmails = Boolean((settings as any)?.maskLimitAccountEmails);
    if (stats) syncStatsToPresentation(stats, maskEmails);
    // If limits aren't available yet in cached stats, trigger a live limits probe
    const actual = extractStats(stats);
    const provs = (actual?.limits as any)?.providers;
    if (!provs || provs.length === 0 || !provs.some((p: any) => p.status === "ok")) {
      window.tokenMonitor.getStats({ force: true, feedback: true }).then((liveStats: any) => {
        if (liveStats) syncStatsToPresentation(liveStats, maskEmails);
      }).catch(() => null);
    }
  });

  if (typeof window.tokenMonitor.onStatsPush === "function") {
    window.tokenMonitor.onStatsPush((nextStats: any) => {
      const settings = appAtomRegistry.get(serverSettingsAtom);
      const maskEmails = Boolean((settings as any)?.maskLimitAccountEmails);
      syncStatsToPresentation(nextStats, maskEmails);
    });
  }

  if (typeof window.tokenMonitor.onSettingsPush === "function") {
    window.tokenMonitor.onSettingsPush((nextSettings: any) => {
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
