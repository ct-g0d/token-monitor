export type PrimaryEnvironmentTarget = never;

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function readPrimaryEnvironmentTarget(): null {
  return null;
}

export function resolvePrimaryEnvironmentHttpUrl(): string {
  return "";
}
