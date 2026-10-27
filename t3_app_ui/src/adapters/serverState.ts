import { toUsagePriceOverrides, applyPriceOverridesPatch, applyModelAliasesPatch } from "./pricingTargetHelpers";
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
import { serverProvidersAtom, syncStatsToPresentation, primaryPresentationAtom, PRIMARY_ENV_ID } from "./presentationState";

export const EMPTY_SERVER_PROVIDERS: ReadonlyArray<ServerProvider> = [];

export const primaryServerConfigAtom = Atom.make<ServerConfig | null>((get) => {
  const presentation = get(primaryPresentationAtom);
  return (presentation?.serverConfig as ServerConfig) ?? null;
});
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
export const environmentServerConfigsAtom = Atom.make<ReadonlyMap<EnvironmentId, any>>((get) => {
  const presentation = get(primaryPresentationAtom);
  const map = new Map<EnvironmentId, any>();
  if (presentation?.serverConfig) {
    map.set(PRIMARY_ENV_ID, presentation.serverConfig);
  }
  return map;
});

export const updateOutdatedServer = async () => ({ _tag: "Success" as const, value: undefined });



export const serverSettingsAtom = Atom.make<ServerSettings>(DEFAULT_SERVER_SETTINGS);
export const primaryServerSettingsAtom = serverSettingsAtom;

export function syncSettingsToPricing(settings: any) {
  if (!settings) return;
  const priceOverrides = toUsagePriceOverrides(settings.customModelPricing);
  const modelAliases =
    settings.modelAliases && typeof settings.modelAliases === "object" && !Array.isArray(settings.modelAliases)
      ? { ...settings.modelAliases }
      : {};
  const current = appAtomRegistry.get(serverSettingsAtom);
  appAtomRegistry.set(serverSettingsAtom, {
    ...current,
    usagePriceOverrides: priceOverrides,
    usageModelAliases: modelAliases,
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
    if (
      typeof window !== "undefined" &&
      window.tokenMonitor &&
      (input?.patch?.usagePriceOverrides || input?.patch?.usageModelAliases)
    ) {
      try {
        const patch: Record<string, any> = {};
        const settings = await window.tokenMonitor.getSettings().catch(() => ({}));

        if (input.patch.usagePriceOverrides) {
          patch.customModelPricing = applyPriceOverridesPatch(
            (settings as any)?.customModelPricing || [],
            input.patch.usagePriceOverrides,
          );
        }

        if (input.patch.usageModelAliases) {
          patch.modelAliases = applyModelAliasesPatch(
            (settings as any)?.modelAliases,
            input.patch.usageModelAliases,
          );
        }

        await window.tokenMonitor.updateSettings(patch);
        const updated = {
          ...settings,
          ...patch,
        };
        syncSettingsToPricing(updated);
        return { _tag: "Success" as const, value: undefined };
      } catch (err) {
        console.error("Failed to update pricing / alias settings via tokenMonitor:", err);
        return { _tag: "Failure" as const, cause: { error: err } };
      }
    }
    return { _tag: "Success" as const, value: undefined };
  },

  refreshProviders: async () => {
    if (typeof window !== "undefined" && window.tokenMonitor) {
      const res = await window.tokenMonitor.getStats({ force: true, awaitLimits: true }).catch(() => null);
      if (res) {
        const stats = (res as any)?.data?.stats || (res as any)?.stats || res;
        syncStatsToPresentation(stats);
      }
    }
    return { _tag: "Success" as const, value: undefined };
  },

  refreshUsageLimits: async () => {
    if (typeof window !== "undefined" && window.tokenMonitor) {
      const res = await window.tokenMonitor.getStats({ force: true, awaitLimits: true }).catch(() => null);
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
