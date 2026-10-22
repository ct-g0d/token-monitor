import { Atom, AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import {
  AuthProvidersManageScope,
  type AuthEnvironmentScope,
  type AuthSessionState,
  type EnvironmentId,
} from "@t3tools/contracts";

const desktopSession: AuthSessionState = {
  authenticated: true,
  scopes: ["settings:write", "orchestration:operate"],
  permissions: ["settings:write", "orchestration:operate"],
  auth: {
    policy: "desktop-managed-local",
    bootstrapMethods: ["desktop-bootstrap"],
    sessionMethods: ["bearer-access-token"],
  },
} as any;

const sessionAtom = Atom.make(AsyncResult.success(desktopSession)).pipe(
  Atom.withLabel("adapter-session-atom")
);

const emptyPreparedConnectionAtom = Atom.make(Option.none()).pipe(
  Atom.withLabel("adapter-prepared-connection:empty")
);

export const environmentSession = {
  sessionStateAtom: Atom.family((_envId: EnvironmentId) => sessionAtom),
  preparedConnectionValueAtom: Atom.family((_envId: EnvironmentId) => emptyPreparedConnectionAtom),
};

export const environmentSessionStatesAtom = Atom.family((_key: string) =>
  Atom.make(() => [AsyncResult.success(desktopSession)]).pipe(
    Atom.withLabel(`adapter-environment-session-states:${_key}`)
  )
);

export function useEnvironmentScope(
  _environmentId: EnvironmentId | null,
  scope: AuthEnvironmentScope,
): boolean {
  if (scope === AuthProvidersManageScope || scope === "providers:manage") {
    return false;
  }
  return true;
}

export function readEnvironmentScope(
  _environmentId: EnvironmentId,
  scope: AuthEnvironmentScope,
): boolean {
  if (scope === AuthProvidersManageScope || scope === "providers:manage") {
    return false;
  }
  return true;
}

export function useEnvironmentsWithScope(
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId }>,
  scope: AuthEnvironmentScope,
): ReadonlySet<EnvironmentId> {
  if (scope === AuthProvidersManageScope || scope === "providers:manage") {
    return new Set();
  }
  return new Set(environments.map(({ environmentId }) => environmentId));
}

export function usePreparedConnection(_environmentId: EnvironmentId | null) {
  return Option.none();
}

export function readPreparedConnection(_environmentId: EnvironmentId) {
  return null;
}

export function useEnvironmentSessionState(_environmentId: EnvironmentId) {
  return {
    data: desktopSession,
    hasError: false,
    isPending: false,
  };
}
