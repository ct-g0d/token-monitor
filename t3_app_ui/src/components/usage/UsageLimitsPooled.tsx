import {
  CHATGPT_USAGE_URL,
  collectLimitAccounts,
  collectExternalUsageLinks,
  collectLimitNotices,
  collectLimitPools,
  cursorUsageWindowDetails,
  displayLimitWindows,
  formatResetsIn,
  type LimitAccount,
  type LimitPool,
  type LimitPoolMember,
  type LimitPoolWindow,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon, ChevronDownIcon, ExternalLinkIcon, SlidersHorizontalIcon, TicketIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatUpcomingTimestamp } from "~/timestampFormat";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { providerClients } from "~/components/settings/providerDriverMeta";
import { RedactedSensitiveText } from "~/components/settings/RedactedSensitiveText";
import { Button } from "~/components/ui/button";
import { OpenAI } from "~/components/Icons";
import { Alert, AlertTitle } from "~/components/ui/alert";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import {
  PaceIcon,
  ResetCreditDialog,
  barColor as defaultBarColor,
  resetCreditsSummary,
  useResetCredit,
} from "~/components/usage/UsageLimits";

function openExternalLink(url: string) {
  if (typeof window !== "undefined" && window.tokenMonitor?.openExternalUrl) {
    void window.tokenMonitor.openExternalUrl(url);
    return;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    return;
  }
}

function getProviderBarColor(driver: string): string {
  if (driver === "claude" || driver === "claudeAgent") return "#d97757";
  if (driver === "antigravity") return "#8c7bd1";
  if (driver === "codex") return "#10a37f";
  if (driver === "deepseek") return "#4d6bfe";
  if (driver === "cursor") return "#8b8b8b";
  if (driver === "grok") return "#1d9bf0";
  if (driver === "opencode") return "#5b9bbd";
  return defaultBarColor(driver as any);
}

function getProviderLabel(driver: string): string {
  if (driver === "claude" || driver === "claudeAgent") return "Claude Code";
  if (driver === "antigravity") return "Antigravity";
  if (driver === "codex") return "Codex";
  if (driver === "deepseek") return "DeepSeek";
  if (driver === "cursor") return "Cursor";
  if (driver === "opencode") return "OpenCode";
  if (driver === "workbuddy") return "WorkBuddy";
  return providerClients.get(driver as any)?.label ?? driver;
}

function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

function accountHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function AccountChip({ email }: { readonly email: string }) {
  const hue = accountHue(email);
  return (
    <span
      role="img"
      aria-label={`Account ${accountInitials(email)}`}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-3xs leading-none font-semibold"
      style={{ backgroundColor: `oklch(0.85 0.08 ${hue})`, color: `oklch(0.35 0.1 ${hue})` }}
    >
      {accountInitials(email)}
    </span>
  );
}

function AccountAvatar({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.redeem) {
    return (
      <ProviderInstanceIcon
        driverKind={account.driver}
        displayName={
          account.displayName ??
          getProviderLabel(String(account.driver))
        }
        accentColor={account.accentColor}
        showBadge={Boolean(account.displayName)}
        indicatorBackground="var(--popover)"
        className={cn("size-5", className)}
        iconClassName="size-4 text-foreground/80"
      />
    );
  }
  return account.email ? <AccountChip email={account.email} /> : null;
}

function AccountName({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.displayName) return <span className={className}>{account.displayName}</span>;
  if (account.email) {
    return (
      <span className={cn("inline-flex min-w-0 items-center", className)}>
        <AccountChip email={account.email} />
      </span>
    );
  }
  return (
    <span className={className}>
      {getProviderLabel(String(account.driver))}
    </span>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground tabular-nums">{children}</span>
    </div>
  );
}

function SegmentPopover({
  account,
  window,
  reset,
  now,
  redeem,
  onRedeem,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly redeem: ReturnType<typeof useResetCredit> | null;
  readonly onRedeem: () => void;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const where =
    account.environments.length > 0
      ? account.environments.map((environment) => environment.label).join(", ")
      : account.sourceLabel;
  const credits =
    redeem && account.limits.resetCredits?.availableCount ? account.limits.resetCredits : null;
  return (
    <div className="flex w-72 max-w-[calc(100vw-3rem)] flex-col gap-2.5 text-xs">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AccountAvatar account={account} />
          <span className="truncate">
            {account.displayName ?? getProviderLabel(String(account.driver))}
          </span>
        </span>
        {account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel="Toggle account email visibility"
            revealTooltip="Click to reveal email"
            hideTooltip="Click to hide email"
            className="w-fit"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        {account.plan ? <Row label="Plan">{account.plan}</Row> : null}
        {where ? (
          <Row label={account.environments.length > 0 ? "Signed in" : "Via"}>{where}</Row>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        <Row label="Left">{remaining}%</Row>
        {window.resetsAt ? (
          <Row label="Resets">
            {formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)}
            {resetsIn ? ` · ${resetsIn.replace("resets in ", "in ")}` : ""}
          </Row>
        ) : null}
        {reset && reset.restoresPercent > 0 ? (
          <Row label="Restores">+{reset.restoresPercent}% of pool</Row>
        ) : null}
      </div>
      {credits && redeem ? (
        <div className="border-t border-border/60 pt-2.5 text-muted-foreground">
          <span className="flex items-center gap-3">
            <span className="tabular-nums">{resetCreditsSummary(credits, now, true)}</span>
            <Button
              size="xs"
              variant="outline"
              disabled={redeem.busy || !redeem.canManageProviders}
              className="ms-auto"
              onClick={onRedeem}
            >
              {redeem.busy ? "Using…" : "Use reset"}
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PoolSegment({
  account,
  window,
  reset,
  color,
  now,
  index,
  showAccountName,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly color: string;
  readonly now: number;
  readonly index: number;
  readonly showAccountName: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            style={{ gridColumn: index, gridRow: 1 }}
            aria-label={`${account.displayName ?? (account.email ? accountInitials(account.email) : account.driver)}: ${remaining}% left${resetsIn ? `, ${resetsIn}` : ""}${credits ? `, ${credits} reset ${credits === 1 ? "credit" : "credits"} banked` : ""}`}
            className="relative h-5 min-w-0 cursor-pointer overflow-hidden rounded-md bg-muted text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[popup-open]:ring-1 data-[popup-open]:ring-inset data-[popup-open]:ring-border @2xl/pool:h-8"
          />
        }
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-md opacity-35"
          style={{ width: `${remaining}%`, backgroundColor: color }}
        />
        {remaining < 100 && reset ? (
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 opacity-20"
            style={{
              width: `${100 - remaining}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 5px)`,
            }}
          />
        ) : null}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-3xs leading-none font-semibold text-foreground/80 tabular-nums @2xl/pool:hidden"
        >
          {index}
        </span>
        <div className="relative hidden h-full min-w-0 items-center gap-1.5 px-2 text-xs @2xl/pool:flex">
          {showAccountName ? (
            <AccountName
              account={account}
              className="min-w-0 truncate font-medium text-foreground"
            />
          ) : null}
          <span className="shrink-0 font-semibold text-foreground tabular-nums">{remaining}%</span>
          <span className="ms-auto flex shrink-0 items-center gap-1.5 rounded-sm bg-background/85 px-1.5 py-0.5 text-2xs text-foreground tabular-nums">
            {resetsIn?.replace("resets in ", "↻ ") ?? ""}
            {credits ? (
              <>
                {resetsIn ? (
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                ) : null}
                <span aria-hidden className="inline-flex items-center gap-0.5 font-semibold">
                  <TicketIcon className="size-3" aria-hidden />
                  {credits}
                </span>
              </>
            ) : null}
          </span>
        </div>
      </PopoverTrigger>
      <LegendRow account={account} window={window} color={color} now={now} index={index} />
      {account.redeem ? (
        <RedeemableSegmentPopup
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeemAt={account.redeem}
          closePopover={() => setOpen(false)}
        />
      ) : (
        <PopoverPopup side="top" sideOffset={6}>
          <SegmentPopover
            account={account}
            window={window}
            reset={reset}
            now={now}
            redeem={null}
            onRedeem={() => {}}
          />
        </PopoverPopup>
      )}
    </Popover>
  );
}

function LegendRow({
  account,
  window,
  color,
  now,
  index,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly color: string;
  readonly now: number;
  readonly index: number;
}) {
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <PopoverTrigger
      style={{ gridColumn: "1 / -1", gridRow: index + 1 }}
      render={<Button variant="ghost" size="compact" />}
      className="min-w-0 @2xl/pool:hidden"
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-3xs leading-none font-semibold text-foreground/80 tabular-nums">
        <span
          aria-hidden
          className="absolute inset-0 rounded-sm opacity-35"
          style={{ backgroundColor: color }}
        />
        <span className="sr-only">Segment </span>
        <span className="relative">{index}</span>
      </span>
      <AccountName account={account} className="min-w-0 truncate font-medium text-foreground" />
      <span className="shrink-0 font-semibold text-foreground tabular-nums">{remaining}%</span>
      <span className="ms-auto flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground tabular-nums">
        {resetsIn?.replace("resets in ", "↻ ") ?? ""}
        {credits ? (
          <>
            {resetsIn ? <span aria-hidden>·</span> : null}
            <span
              aria-hidden
              className="inline-flex items-center gap-0.5 font-semibold text-foreground"
            >
              <TicketIcon className="size-3" aria-hidden />
              {credits}
            </span>
            <span className="sr-only">
              {credits} reset {credits === 1 ? "credit" : "credits"} banked
            </span>
          </>
        ) : null}
      </span>
    </PopoverTrigger>
  );
}

function RedeemableSegmentPopup({
  account,
  window,
  reset,
  now,
  redeemAt,
  closePopover,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
  readonly closePopover: () => void;
}) {
  const redeem = useResetCredit(redeemAt.environmentId, redeemAt.input);
  return (
    <>
      <PopoverPopup side="top" sideOffset={6}>
        <SegmentPopover
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeem={redeem}
          onRedeem={() => {
            closePopover();
            redeem.setConfirming(true);
          }}
        />
      </PopoverPopup>
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={redeem.setConfirming}
        onConfirm={() => void redeem.redeem()}
        disabled={!redeem.canManageProviders}
      />
      {redeem.status ? (
        <span role="status" className="col-span-full text-xs text-muted-foreground">
          <AccountName account={account} className="font-medium text-foreground" /> {redeem.status}
        </span>
      ) : null}
    </>
  );
}

function PoolBar({
  pool,
  color,
  now,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
}) {
  const restores = new Map(pool.resets.map((reset) => [reset.member.account.key, reset]));
  return (
    <div className="@container/pool min-w-0">
      <div
        className="grid gap-x-1 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${pool.columns.length}, minmax(0, 1fr))` }}
      >
        {pool.columns.map((member, position) =>
          member.window ? (
            <PoolSegment
              key={member.account.key}
              account={member.account}
              window={member.window}
              reset={restores.get(member.account.key)}
              color={color}
              now={now}
              index={position + 1}
              showAccountName={pool.columns.length > 1}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function PoolWindowCard({
  pool,
  color,
  now,
  label,
  description,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
}) {
  const nextRefill = pool.resets.find((reset) => reset.restoresPercent > 0);
  const firstWindow = pool.members[0]?.window as any;
  const isCredits = firstWindow?.metric === "credits";
  const balanceAmount = typeof firstWindow?.remaining === "number" ? firstWindow.remaining : null;
  const memberAccount = pool.members[0]?.account as any;
  const monthSpend = memberAccount?.limits?.balance?.monthSpend;

  return (
    <div className="grid items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 p-4 md:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <span className="tm-label truncate">{label ?? pool.label}</span>
        <span className="flex items-baseline gap-2">
          {isCredits && balanceAmount !== null ? (
            <>
              <span className="text-[26px] leading-none font-semibold text-foreground tabular-nums">
                ${balanceAmount.toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                <span>balance</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-[26px] leading-none font-semibold text-foreground tabular-nums">
                {pool.remainingPercent}%
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                <span>left</span>
                {pool.pace ? <PaceIcon pace={pool.pace} /> : null}
              </span>
            </>
          )}
        </span>
        {isCredits && typeof monthSpend === "number" ? (
          <span className="text-2xs text-muted-foreground tabular-nums">
            ${monthSpend.toFixed(2)} spent this month
          </span>
        ) : nextRefill && pool.columns.length > 1 ? (
          <span className="text-xs font-medium text-foreground tabular-nums">
            ↻ +{nextRefill.restoresPercent}%
          </span>
        ) : null}
      </div>
      <PoolBar pool={pool} color={color} now={now} />
      {description ? (
        <p className="text-xs text-muted-foreground md:col-span-2">{description}</p>
      ) : null}
    </div>
  );
}

function limitWindowKey(driver: string, window: LimitPoolWindow): string {
  return `${driver}:${window.kind}:${window.id}`;
}

function PoolSection({
  pool,
  now,
  visibleLimitKeys,
}: {
  readonly pool: LimitPool;
  readonly now: number;
  readonly visibleLimitKeys: ReadonlySet<string> | null;
}) {
  const color = getProviderBarColor(String(pool.driver));
  const label = getProviderLabel(String(pool.driver));
  const windows = displayLimitWindows(pool).filter(
    (window) => visibleLimitKeys === null || visibleLimitKeys.has(limitWindowKey(String(pool.driver), window)),
  );
  if (windows.length === 0) return null;
  const planSummary = pool.accounts.length > 1
    ? `${pool.accounts.length} / ${pool.accounts[0]?.plan || "Pro"}`
    : pool.accounts[0]?.plan;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ProviderInstanceIcon
            driverKind={pool.driver}
            displayName={label}
            indicatorBackground="var(--background)"
            className="size-5"
            iconClassName="size-4 text-foreground/80"
          />
          {label}
        </h2>
        {planSummary ? (
          <span className="text-xs text-muted-foreground tabular-nums">{planSummary}</span>
        ) : null}
      </div>
      {windows.map((window) => {
        const details = pool.driver === "cursor" ? cursorUsageWindowDetails(window.id) : undefined;
        return (
          <PoolWindowCard
            key={`${window.kind}:${window.id}`}
            pool={window}
            color={color}
            now={now}
            label={details?.label}
            description={details?.description}
          />
        );
      })}
    </section>
  );
}

export function UsageLimitsPooled({
  presentations,
  now,
  cursorPrompt,
}: {
  readonly presentations: Parameters<typeof collectLimitAccounts>[0];
  readonly now: number;
  readonly cursorPrompt?: ReactNode;
}) {
  const accounts = collectLimitAccounts(presentations);
  const pools = collectLimitPools(accounts, now);
  const limitOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const pool of pools) {
      for (const window of displayLimitWindows(pool)) {
        options.set(
          limitWindowKey(String(pool.driver), window),
          `${getProviderLabel(String(pool.driver))} · ${window.label ?? pool.label}`,
        );
      }
    }
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [pools]);
  const [hiddenLimitKeys, setHiddenLimitKeys] = useState<ReadonlySet<string>>(() => {
    try {
      if (typeof window === "undefined") return new Set();
      const stored = window.localStorage.getItem("t3code:limits-hidden:v1");
      const parsed = stored ? JSON.parse(stored) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("t3code:limits-hidden:v1", JSON.stringify([...hiddenLimitKeys]));
    } catch {
      // Ignore unavailable storage.
    }
  }, [hiddenLimitKeys]);
  const visibleLimitKeys = useMemo(
    () =>
      hiddenLimitKeys.size === 0
        ? null
        : new Set(limitOptions.map(([key]) => key).filter((key) => !hiddenLimitKeys.has(key))),
    [hiddenLimitKeys, limitOptions],
  );
  const visibleLimitCount = visibleLimitKeys === null ? limitOptions.length : visibleLimitKeys.size;
  const limitFilterLabel =
    limitOptions.length === 0
      ? "No limits"
      : visibleLimitCount === limitOptions.length
        ? "All limits"
        : visibleLimitCount === 0
          ? "No limits"
          : `${visibleLimitCount} limits`;
  const rawNotices = collectLimitNotices(presentations);
  
  // Filter out spurious notices for notConfigured providers
  const notices = rawNotices.filter((n) =>
    !n.toLowerCase().includes("opencode") &&
    !n.toLowerCase().includes("workbuddy") &&
    !n.toLowerCase().includes("personal") &&
    !n.toLowerCase().includes("antigravity")
  );

  // Collect providers in notConfigured state
  const allProviders = [...presentations.values()].flatMap(
    (p) => p.serverConfig?.providers ?? []
  );
  const seenDrivers = new Set<string>();
  const notConfiguredDrivers: { driver: string; name: string }[] = [];
  allProviders.forEach((p) => {
    const d = String(p.driver);
    if (seenDrivers.has(d)) return;
    const isUnconfigured = (p as any).status === "notConfigured" || p.auth.status === "unauthenticated";
    if (isUnconfigured && !pools.some((pool) => String(pool.driver) === d)) {
      seenDrivers.add(d);
      notConfiguredDrivers.push({
        driver: d,
        name: getProviderLabel(d),
      });
    }
  });

  const externalLinks = collectExternalUsageLinks(presentations);
  const cursorPromptAt =
    Math.max(
      pools.findIndex((pool) => pool.driver === "codex"),
      pools.findIndex((pool) => pool.driver === "claudeAgent" || (pool.driver as any) === "claude"),
    ) + 1;

  const openSettings = () => {
    if (typeof (window as any).tokenMonitor?.openSettings === "function") {
      (window as any).tokenMonitor.openSettings();
    } else {
      const btn = document.querySelector('button[aria-label="Settings"], [data-view="settings"]') as HTMLElement;
      if (btn) btn.click();
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {limitOptions.length > 0 ? (
        <div className="flex justify-end">
          <Menu>
            <MenuTrigger
              render={<Button size="sm" variant="outline" />}
              className="gap-2"
              aria-label="Choose visible limits"
            >
              <SlidersHorizontalIcon className="size-3.5" aria-hidden />
              <span>{limitFilterLabel}</span>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-64">
              <MenuCheckboxItem
                checked={hiddenLimitKeys.size === 0}
                closeOnClick={false}
                onCheckedChange={(checked) => setHiddenLimitKeys(checked ? new Set() : new Set(limitOptions.map(([key]) => key)))}
              >
                All limits
              </MenuCheckboxItem>
              <MenuSeparator />
              {limitOptions.map(([key, label]) => (
                <MenuCheckboxItem
                  key={key}
                  checked={!hiddenLimitKeys.has(key)}
                  closeOnClick={false}
                  onCheckedChange={(checked) => {
                    const next = new Set(hiddenLimitKeys);
                    if (checked) next.delete(key);
                    else next.add(key);
                    setHiddenLimitKeys(next);
                  }}
                >
                  {label}
                </MenuCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
      ) : null}
      {pools.length === 0 && notices.length === 0 && !cursorPrompt && externalLinks.length === 0 && notConfiguredDrivers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No provider on the selected environments reports subscription limits.
        </p>
      ) : null}

      {pools.map((pool, index) => (
        <Fragment key={pool.driver}>
          {index === cursorPromptAt ? cursorPrompt : null}
          <PoolSection pool={pool} now={now} visibleLimitKeys={visibleLimitKeys} />
        </Fragment>
      ))}

      {cursorPromptAt === pools.length ? cursorPrompt : null}

      {notConfiguredDrivers.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="tm-label !text-foreground">
            Unconfigured Providers
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {notConfiguredDrivers.map(({ driver, name }) => (
              <div
                key={driver}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <ProviderInstanceIcon
                    driverKind={driver as any}
                    displayName={name}
                    className="size-5"
                    iconClassName="size-4 text-foreground/80"
                  />
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{name}</h3>
                    <p className="text-xs text-muted-foreground">Not configured</p>
                  </div>
                </div>
                <Button size="xs" variant="outline" onClick={openSettings}>
                  Add account
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {externalLinks.map((link) => (
        <section
          key={link.url}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {link.url === CHATGPT_USAGE_URL ? (
              <OpenAI className="size-5 shrink-0" aria-hidden="true" />
            ) : null}
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-medium">{link.label}</h2>
              {link.url === CHATGPT_USAGE_URL ? (
                <p className="text-xs text-muted-foreground">
                  View usage in ChatGPT with your connected account.
                </p>
              ) : link.message ? (
                <p className="max-w-xl text-xs text-muted-foreground">{link.message}</p>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost-muted"
            size="xs"
            onClick={() => openExternalLink(link.url)}
          >
            Manage usage
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </section>
      ))}

      <LimitNotices notices={notices} />
    </div>
  );
}

function LimitNotices({ notices }: { readonly notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert variant="warning" controlAlignment="first-line">
      <AlertTriangleIcon />
      {notices.map((notice) => (
        <AlertTitle key={notice} className="break-words">
          {notice}
        </AlertTitle>
      ))}
    </Alert>
  );
}
