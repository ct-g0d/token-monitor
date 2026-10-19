import { Atom } from "effect/reactivity";
import {
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  type KeybindingsConfig,
  type ServerProvider,
  type ServerConfig,
  type EditorId,
  type EnvironmentTheme,
  type ServerConfigStreamEvent,
  type ServerLifecycleWelcomePayload,
  type ServerLifecycleLegacyThreadMigrationPayload,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

export const EMPTY_SERVER_PROVIDERS: ReadonlyArray<ServerProvider> = [];

export const primaryServerConfigAtom = Atom.make<ServerConfig | null>(() => null);
export const primaryServerConfigEventAtom = Atom.make<ServerConfigStreamEvent | null>(() => null);
export const primaryServerWelcomeAtom = Atom.make<ServerLifecycleWelcomePayload | null>(() => null);
export const primaryServerLegacyThreadMigrationAtom = Atom.make<ServerLifecycleLegacyThreadMigrationPayload | null>(() => null);
export const primaryServerAvailableEditorsAtom = Atom.make<ReadonlyArray<EditorId>>(() => []);
export const primaryServerEnvironmentThemesAtom = Atom.make<ReadonlyArray<EnvironmentTheme>>(() => []);

export const primaryServerSettingsAtom = Atom.make(() => DEFAULT_SERVER_SETTINGS);

export const primaryServerKeybindingsAtom = Atom.make((): KeybindingsConfig => 
  DEFAULT_RESOLVED_KEYBINDINGS
);

export const primaryServerProvidersAtom = Atom.make<ReadonlyArray<ServerProvider>>(() => EMPTY_SERVER_PROVIDERS);

export const providersIgnoringCheckedAtAtom = (_environmentId: EnvironmentId) =>
  Atom.make<ReadonlyArray<ServerProvider>>(() => EMPTY_SERVER_PROVIDERS);

export const environmentUpdateStatesAtom = (_key?: string) => Atom.make(() => []);
export const environmentServerConfigsAtom = (_key?: string) => Atom.make(() => []);

export const updateOutdatedServer = () => Promise.resolve({ _tag: "Success" as const });

const dummyAtom = Atom.make(() => ({ _tag: "Initial" as const }));
const dummyPermissionAtom = Atom.make(() => null);

function makeCommandMock(): any {
  const fn: any = (..._args: any[]) => dummyAtom;
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === "permissionAtom") return dummyPermissionAtom;
      if (prop in target) return (target as any)[prop];
      return makeCommandMock();
    },
  });
}

export const serverEnvironment: any = new Proxy(
  {
    updateSettings: () => Promise.resolve({ _tag: "Success" as const }),
    usageSummary: () => Atom.make(() => ({ _tag: "Initial" as const })),
    configValueAtom: () => null,
    updateStateAtom: () => Atom.make(() => null),
    providersValueAtom: () => Atom.make(() => EMPTY_SERVER_PROVIDERS),
    configProjection: () => Atom.make(() => ({ _tag: "Initial" as const })),
    welcome: () => Atom.make(() => ({ _tag: "Initial" as const })),
    legacyThreadMigration: () => Atom.make(() => ({ _tag: "Initial" as const })),
  },
  {
    get(target: any, prop: string | symbol) {
      if (prop in target) return target[prop];
      const mock = makeCommandMock();
      target[prop] = mock;
      return mock;
    },
  }
);
