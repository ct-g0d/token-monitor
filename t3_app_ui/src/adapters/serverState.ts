import { Atom, AsyncResult } from "effect/reactivity";
import {
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  type KeybindingsConfig,
  type ServerProvider,
  type ServerConfig,
  type ServerSettings,
  type EditorId,
  type EnvironmentTheme,
  type ServerConfigStreamEvent,
  type ServerLifecycleWelcomePayload,
  type ServerLifecycleLegacyThreadMigrationPayload,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { appAtomRegistry } from "./atomRegistry";
import { serverProvidersAtom, syncStatsToPresentation } from "./presentationState";

export const EMPTY_SERVER_PROVIDERS: ReadonlyArray<ServerProvider> = [];

export const primaryServerConfigAtom = Atom.make<ServerConfig | null>(null);
export const primaryServerConfigEventAtom = Atom.make<ServerConfigStreamEvent | null>(null);
export const primaryServerWelcomeAtom = Atom.make<ServerLifecycleWelcomePayload | null>(null);
export const primaryServerLegacyThreadMigrationAtom = Atom.make<ServerLifecycleLegacyThreadMigrationPayload | null>(null);
export const primaryServerAvailableEditorsAtom = Atom.make<ReadonlyArray<EditorId>>([]);
export const primaryServerEnvironmentThemesAtom = Atom.make<ReadonlyArray<EnvironmentTheme>>([]);

export const primaryServerKeybindingsAtom = Atom.make<KeybindingsConfig>(
  DEFAULT_RESOLVED_KEYBINDINGS as any
);

export const primaryServerProvidersAtom = Atom.make<ReadonlyArray<ServerProvider>>((get) =>
  get(serverProvidersAtom)
);

export const providersIgnoringCheckedAtAtom = Atom.family((_environmentId: EnvironmentId) =>
  Atom.make<ReadonlyArray<ServerProvider>>((get) => get(serverProvidersAtom))
);

export const environmentUpdateStatesAtom = Atom.family((_key?: string) =>
  Atom.make<ReadonlyArray<any>>([])
);
export const environmentServerConfigsAtom = Atom.make<ReadonlyMap<EnvironmentId, any>>(new Map());

export const updateOutdatedServer = async () => ({ _tag: "Success" as const, value: undefined });

function parseUnitPrice(val: any): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toUsagePriceOverrides(customModelPricing: any[] | undefined): Record<string, any> {
  if (!Array.isArray(customModelPricing)) return {};
  const overrides: Record<string, any> = {};
  for (const item of customModelPricing) {
    if (!item?.modelId) continue;
    const modelId = String(item.modelId).trim();
    if (!modelId) continue;
    overrides[modelId] = {
      ...(item.inputPerM !== undefined ? { inputCostPerMillionTokens: item.inputPerM } : {}),
      ...(item.outputPerM !== undefined ? { outputCostPerMillionTokens: item.outputPerM } : {}),
      ...(item.cacheReadPerM !== undefined ? { cacheReadCostPerMillionTokens: item.cacheReadPerM } : {}),
      ...(item.cacheWritePerM !== undefined ? { cacheWriteCostPerMillionTokens: item.cacheWritePerM } : {}),
    };
  }
  return overrides;
}

export const serverSettingsAtom = Atom.make<ServerSettings>(DEFAULT_SERVER_SETTINGS);
export const primaryServerSettingsAtom = serverSettingsAtom;

export function syncSettingsToPricing(settings: any) {
  if (!settings) return;
  const priceOverrides = toUsagePriceOverrides(settings.customModelPricing);
  const current = appAtomRegistry.get(serverSettingsAtom);
  appAtomRegistry.set(serverSettingsAtom, {
    ...current,
    usagePriceOverrides: priceOverrides,
  });
}

if (typeof window !== "undefined" && window.tokenMonitor) {
  window.tokenMonitor.getSettings().then((s: any) => {
    syncSettingsToPricing(s);
  }).catch(() => {});

  if (typeof window.tokenMonitor.onSettingsPush === "function") {
    window.tokenMonitor.onSettingsPush((nextSettings: any) => {
      syncSettingsToPricing(nextSettings);
    });
  }
}

const settingsValueAtom = Atom.family((_environmentId: EnvironmentId) => serverSettingsAtom);
const configValueAtom = Atom.family((_environmentId: EnvironmentId | null) => primaryServerConfigAtom);
const providersValueAtom = Atom.family((_environmentId: EnvironmentId) =>
  Atom.make<ReadonlyArray<ServerProvider>>((get) => get(serverProvidersAtom))
);
const updateStateAtom = Atom.family((_environmentId: EnvironmentId | null) =>
  Atom.make({ status: "idle" as const })
);
const usagePricesAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(""));
const usageScanSettingsAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(""));

export const serverEnvironment = {
  settingsValueAtom,
  configValueAtom,
  serverConfigValueAtom: configValueAtom,
  providersValueAtom,
  updateStateAtom,
  usagePricesAtom,
  usageScanSettingsAtom,
  configProjection: (_target: any) => Atom.make(AsyncResult.initial()),
  welcome: (_target: any) => Atom.make(AsyncResult.initial()),
  legacyThreadMigration: (_target: any) => Atom.make(AsyncResult.initial()),
  databaseStorage: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),
  storageCleanupReport: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),
  providerAuthState: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),
  chatGptHandoffState: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),
  codexAuthCallbackState: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),
  providerInstallState: Atom.family((_target: any) => Atom.make(AsyncResult.initial())),

  // Commands
  updateSettings: async ({ input }: any) => {
    if (typeof window !== "undefined" && window.tokenMonitor && input?.patch?.usagePriceOverrides) {
      try {
        const overrides = input.patch.usagePriceOverrides;
        const settings = await window.tokenMonitor.getSettings().catch(() => ({}));
        let existingPricing = Array.isArray((settings as any)?.customModelPricing)
          ? [...(settings as any).customModelPricing]
          : [];

        for (const [modelId, rates] of Object.entries(overrides)) {
          if (rates === null) {
            existingPricing = existingPricing.filter((e: any) => e.modelId !== modelId);
          } else {
            const r: any = rates;
            const idx = existingPricing.findIndex((p: any) => p.modelId === modelId);
            const existingEntry = idx >= 0 ? existingPricing[idx] : { modelId };

            // User requirement: preserve cacheWrite1hPerM and other unknown fields of an existing entry
            // when editing it, and leave rates the user didn't set undefined instead of converting to 0.
            const newEntry: Record<string, any> = {
              ...existingEntry,
              modelId,
            };

            const inputRate = parseUnitPrice(r.inputCostPerMillionTokens);
            if (inputRate !== undefined) {
              newEntry.inputPerM = inputRate;
            } else if ("inputCostPerMillionTokens" in r) {
              delete newEntry.inputPerM;
            }

            const outputRate = parseUnitPrice(r.outputCostPerMillionTokens);
            if (outputRate !== undefined) {
              newEntry.outputPerM = outputRate;
            } else if ("outputCostPerMillionTokens" in r) {
              delete newEntry.outputPerM;
            }

            const cacheReadRate = parseUnitPrice(r.cacheReadCostPerMillionTokens);
            if (cacheReadRate !== undefined) {
              newEntry.cacheReadPerM = cacheReadRate;
            } else if ("cacheReadCostPerMillionTokens" in r) {
              delete newEntry.cacheReadPerM;
            }

            const cacheWriteRate = parseUnitPrice(r.cacheWriteCostPerMillionTokens);
            if (cacheWriteRate !== undefined) {
              newEntry.cacheWritePerM = cacheWriteRate;
            } else if ("cacheWriteCostPerMillionTokens" in r) {
              delete newEntry.cacheWritePerM;
            }

            if (idx >= 0) {
              existingPricing[idx] = newEntry;
            } else {
              existingPricing.push(newEntry);
            }
          }
        }

        await window.tokenMonitor.updateSettings({ customModelPricing: existingPricing });
        syncSettingsToPricing({ customModelPricing: existingPricing });
        return { _tag: "Success" as const, value: undefined };
      } catch (err) {
        console.error("Failed to update customModelPricing via tokenMonitor:", err);
        return { _tag: "Failure" as const, cause: { error: err } };
      }
    }
    return { _tag: "Success" as const, value: undefined };
  },

  refreshProviders: async () => {
    if (typeof window !== "undefined" && window.tokenMonitor) {
      const res = await window.tokenMonitor.getStats({ force: true, feedback: true }).catch(() => null);
      if (res) {
        const stats = (res as any)?.data?.stats || (res as any)?.stats || res;
        syncStatsToPresentation(stats);
      }
    }
    return { _tag: "Success" as const, value: undefined };
  },

  refreshUsageLimits: async () => {
    if (typeof window !== "undefined" && window.tokenMonitor) {
      const res = await window.tokenMonitor.getStats({ force: true, feedback: true }).catch(() => null);
      if (res) {
        const stats = (res as any)?.data?.stats || (res as any)?.stats || res;
        syncStatsToPresentation(stats);
      }
    }
    return { _tag: "Success" as const, value: undefined };
  },

  consumeResetCredit: async () => {
    // User Directive: UI must not offer reset-credit redemption
    return { _tag: "Failure" as const, cause: { error: new Error("Reset credits cannot be redeemed from Token Monitor.") } };
  },
};
