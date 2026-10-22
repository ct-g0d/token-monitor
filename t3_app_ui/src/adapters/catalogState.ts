import { Atom, AsyncResult } from "effect/reactivity";
import { PRIMARY_ENV_ID } from "./presentationState";
import { AVAILABLE_CONNECTION_STATE } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";

export interface ConnectionCatalogEntry {
  readonly environmentId: EnvironmentId;
  readonly enabled: boolean;
  readonly target: {
    readonly _tag: "PrimaryConnectionTarget";
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly httpBaseUrl: string;
    readonly wsBaseUrl: string;
  };
  readonly unsupportedReason?: string;
}

export interface EnvironmentCatalogState {
  readonly isReady: boolean;
  readonly entries: ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>;
}

const primaryEntry: ConnectionCatalogEntry = {
  environmentId: PRIMARY_ENV_ID,
  enabled: true,
  target: {
    _tag: "PrimaryConnectionTarget",
    environmentId: PRIMARY_ENV_ID,
    label: "Token Monitor Workstation",
    httpBaseUrl: "http://127.0.0.1:9333",
    wsBaseUrl: "ws://127.0.0.1:9333",
  },
};

const defaultCatalogState: EnvironmentCatalogState = {
  isReady: true,
  entries: new Map([[PRIMARY_ENV_ID, primaryEntry]]),
};

export const catalogAtom = Atom.make(AsyncResult.success(defaultCatalogState)).pipe(
  Atom.withLabel("adapter-catalog-atom")
);

export const catalogValueAtom = Atom.make<EnvironmentCatalogState>(defaultCatalogState).pipe(
  Atom.withLabel("adapter-catalog-value-atom")
);

export const networkStatusAtom = Atom.make(AsyncResult.success("online" as const)).pipe(
  Atom.withLabel("adapter-network-status-atom")
);

export const networkStatusValueAtom = Atom.make<"online" | "offline" | "unknown">("online").pipe(
  Atom.withLabel("adapter-network-status-value-atom")
);

export const githubRoutingPermissionsAtom = Atom.make(
  AsyncResult.success([] as const)
).pipe(Atom.withLabel("adapter-github-routing-permissions-atom"));

export const githubRoutingPermissionsValueAtom = Atom.make<readonly any[]>([]).pipe(
  Atom.withLabel("adapter-github-routing-permissions-value-atom")
);

export const stateAtom = Atom.family((_environmentId: EnvironmentId) =>
  Atom.make(AsyncResult.success(AVAILABLE_CONNECTION_STATE)).pipe(
    Atom.withLabel(`adapter-connection-state:${_environmentId}`)
  )
);

export const environmentCatalog = {
  catalogAtom,
  catalogValueAtom,
  networkStatusAtom,
  networkStatusValueAtom,
  githubRoutingPermissionsAtom,
  githubRoutingPermissionsValueAtom,
  stateAtom,
  register: async () => ({ _tag: "Success" as const, value: undefined }),
  remove: async () => ({ _tag: "Success" as const, value: undefined }),
  removeRelayEnvironments: async () => ({ _tag: "Success" as const, value: undefined }),
  setEnabled: async () => ({ _tag: "Success" as const, value: undefined }),
  removeRoute: async () => ({ _tag: "Success" as const, value: undefined }),
  reorderRoutes: async () => ({ _tag: "Success" as const, value: undefined }),
  retryNow: async () => ({ _tag: "Success" as const, value: undefined }),
  setGitHubRoutingPermission: async () => ({ _tag: "Success" as const, value: undefined }),
};
