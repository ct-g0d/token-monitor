import { UsageProviderKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "t3code:usage-page-preferences:v1";
const UsagePagePreferencesSchema = Schema.Struct({
  metric: Schema.Literals(["cost", "tokens", "limits"]),
  windowDays: Schema.Literals([1, 7, 30, 90]),
  hiddenProviders: Schema.optional(Schema.Array(Schema.String as unknown as Schema.Schema<UsageProviderKind>)),
});
export type UsagePagePreferences = typeof UsagePagePreferencesSchema.Type;

const DEFAULT_PREFERENCES: UsagePagePreferences = { metric: "tokens", windowDays: 30 };

export function readUsagePagePreferences(): UsagePagePreferences {
  try {
    const item = getLocalStorageItem(STORAGE_KEY, UsagePagePreferencesSchema);
    if (item) {
      // Ensure initial view is always tokens overview so totals and breakdown table are displayed
      return { ...item, metric: "tokens" };
    }
  } catch {
    // fallback
  }
  return DEFAULT_PREFERENCES;
}

export function saveUsagePagePreferences(preferences: UsagePagePreferences): void {
  try {
    setLocalStorageItem(STORAGE_KEY, preferences, UsagePagePreferencesSchema);
  } catch (error) {
    console.error("Could not save Usage page preferences.", error);
  }
}
