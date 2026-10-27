export function formatCountdown(resetsIn: string | null | undefined): string | null {
  if (!resetsIn) return null;
  if (resetsIn.startsWith("resets in ")) {
    return `in ${resetsIn.slice("resets in ".length)}`;
  }
  return resetsIn;
}

export function getAccountPlanLabel(
  account: { plan?: string } | undefined | null,
  isCodex?: boolean,
): string | null {
  if (!account) return isCodex ? "Plus" : null;
  if (account.plan) {
    const raw = account.plan.trim();
    if (raw.length > 0) {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  }
  return isCodex ? "Plus" : null;
}

export function resolvePlanSummary(
  accounts: ReadonlyArray<{ plan?: string }> | undefined | null,
  isCodex: boolean,
): string | null {
  if (!accounts || accounts.length === 0) return null;
  const primaryAccount = accounts[0];
  const primaryPlan = getAccountPlanLabel(primaryAccount, isCodex);
  if (isCodex) {
    return accounts.length > 1
      ? `${accounts.length} / ${primaryPlan ?? "Plus"}`
      : (primaryPlan ?? "Plus");
  }
  return accounts.length > 1
    ? `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
    : primaryPlan;
}
