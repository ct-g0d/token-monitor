import { UsageProviderKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "t3code:usage-page-preferences:v1";
const UsagePagePreferencesSchema = Schema.Struct({
  metric: Schema.Literals(["cost", "tokens", "limits"]),
  windowDays: Schema.Literals([0, 1, 7, 30, 90]),
  hiddenProviders: Schema.optional(Schema.Array(UsageProviderKind)),
});
export type UsagePagePreferences = typeof UsagePagePreferencesSchema.Type;

const DEFAULT_PREFERENCES: UsagePagePreferences = { metric: "tokens", windowDays: 30 };

export function readUsagePagePreferences(): UsagePagePreferences {
  try {
    const item = getLocalStorageItem<UsagePagePreferences, any>(STORAGE_KEY, UsagePagePreferencesSchema as any);
    if (item) {
      return item;
    }
  } catch {
    // fallback
  }
  return DEFAULT_PREFERENCES;
}

export function saveUsagePagePreferences(preferences: UsagePagePreferences): void {
  try {
    setLocalStorageItem<UsagePagePreferences, any>(STORAGE_KEY, preferences, UsagePagePreferencesSchema as any);
  } catch (error) {
    console.error("Could not save Usage page preferences.", error);
  }
}
