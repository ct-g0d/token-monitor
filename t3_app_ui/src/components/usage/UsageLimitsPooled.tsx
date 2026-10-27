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
import { AlertTriangleIcon, ChevronDownIcon, ClockIcon, ExternalLinkIcon, Gauge, PlusIcon, SlidersHorizontalIcon, TicketIcon } from "lucide-react";
import { getProviderPresentation } from "~/components/usage/usageProviders";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Atom } from "effect/reactivity";
import { useAtomValue } from "@effect/atom-react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatUpcomingTimestamp } from "~/timestampFormat";
import { ProviderDriverKind } from "@t3tools/contracts";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { providerClients } from "~/components/settings/providerDriverMeta";
import { RedactedSensitiveText } from "~/components/settings/RedactedSensitiveText";
import { Button, InlineButton } from "~/components/ui/button";
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
import { appAtomRegistry } from "~/rpc/atomRegistry";

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
  const presentation = getProviderPresentation(driver);
  if (presentation.color) return presentation.color;
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
  const presentation = getProviderPresentation(driver);
  if (presentation.label) return presentation.label;
  return providerClients.get(driver as any)?.label ?? driver;
}

function formatPlanName(plan: string | undefined): string {
  if (!plan) return "";
  const trimmed = plan.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
  isCodex,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly color: string;
  readonly now: number;
  readonly index: number;
  readonly showAccountName: boolean;
  readonly isCodex?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now);
  const countdown = resetsIn ? resetsIn.replace("resets in ", "") : null;
  const credits = account.limits.resetCredits?.availableCount ?? 0;

  const planLabel = isCodex
    ? account.plan
      ? account.plan.charAt(0).toUpperCase() + account.plan.slice(1)
      : "Plus"
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            style={
              isCodex
                ? { gridColumn: "1 / -1", gridRow: index, width: "100%" }
                : { gridColumn: index, gridRow: 1 }
            }
            aria-label={`${account.displayName ?? (account.email ? accountInitials(account.email) : account.driver)}: ${remaining}% left${resetsIn ? `, ${resetsIn}` : ""}${credits ? `, ${credits} reset ${credits === 1 ? "credit" : "credits"} banked` : ""}`}
            className={cn(
              "relative min-w-0 cursor-pointer overflow-hidden rounded-md bg-muted text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[popup-open]:ring-1 data-[popup-open]:ring-inset data-[popup-open]:ring-border",
              isCodex ? "h-8" : "h-6 sm:h-7 @xl/pool:h-8",
            )}
          />
        }
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-md opacity-35"
          style={{ width: `${remaining}%`, backgroundColor: color }}
        />
        {remaining < 100 && (isCodex || reset) ? (
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 opacity-20"
            style={{
              width: `${100 - remaining}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 5px)`,
            }}
          />
        ) : null}
        {!isCodex ? (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-3xs leading-none font-semibold text-foreground/80 tabular-nums @lg/pool:hidden"
          >
            {index}
          </span>
        ) : null}
        <div
          className={cn(
            "relative h-full min-w-0 items-center gap-1.5 px-2 text-xs",
            isCodex ? "flex" : "hidden @lg/pool:flex",
          )}
        >
          {isCodex ? (
            <span className="shrink-0 font-medium text-foreground tabular-nums">
              {`${planLabel} ${remaining}%`}
            </span>
          ) : (
            <>
              {showAccountName ? (
                <AccountName
                  account={account}
                  className="min-w-0 truncate font-medium text-foreground"
                />
              ) : null}
              <span className="shrink-0 font-semibold text-foreground tabular-nums">
                {remaining}%
              </span>
            </>
          )}
          {isCodex ? (
            countdown ? (
              <span className="ms-auto flex shrink-0 items-center gap-1.5 rounded-sm bg-background/85 px-1.5 py-0.5 text-2xs text-foreground tabular-nums">
                <ClockIcon className="size-3 text-muted-foreground" aria-hidden />
                <span>{countdown}</span>
              </span>
            ) : null
          ) : (
            <span className="ms-auto flex shrink-0 items-center gap-1.5 rounded-sm bg-background/85 px-1.5 py-0.5 text-2xs text-foreground tabular-nums">
              {resetsIn ? resetsIn.replace("resets in ", "in ") : ""}
              {credits ? (
                <>
                  {resetsIn ? (
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className="inline-flex items-center gap-0.5 font-semibold"
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
          )}
        </div>
      </PopoverTrigger>
      {!isCodex ? (
        <LegendRow account={account} window={window} color={color} now={now} index={index} />
      ) : null}
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
      className="min-w-0 @lg/pool:hidden"
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
        {resetsIn ? resetsIn.replace("resets in ", "in ") : ""}
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
  isCodex,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
  readonly isCodex?: boolean;
}) {
  const isCodexPool =
    Boolean(isCodex) ||
    String(pool.id).toLowerCase().includes("codex") ||
    pool.columns.some((c) => String(c.account.driver).toLowerCase().includes("codex"));

  const restores = new Map(pool.resets.map((reset) => [reset.member.account.key, reset]));
  const validColumns = pool.columns.filter((member) => member.window != null);
  const columns = isCodexPool ? validColumns : pool.columns;
  return (
    <div className="@container/pool min-w-0">
      <div
        className={cn("grid gap-x-1 gap-y-1", isCodexPool && columns.length > 1 && "gap-y-1.5")}
        style={{
          gridTemplateColumns: isCodexPool
            ? "minmax(0, 1fr)"
            : `repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((member, position) =>
          member.window ? (
            <PoolSegment
              key={member.account.key}
              account={member.account}
              window={member.window}
              reset={restores.get(member.account.key)}
              color={color}
              now={now}
              index={position + 1}
              showAccountName={columns.length > 1}
              isCodex={isCodexPool}
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
  isCodex,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  readonly isCodex?: boolean;
}) {
  const isCodexWindow =
    Boolean(isCodex) ||
    String(pool.id).toLowerCase().includes("codex") ||
    pool.members.some((m) => String(m.account.driver).toLowerCase().includes("codex"));

  const nextRefill = pool.resets.find((reset) => reset.restoresPercent > 0);
  const firstWindow = pool.members[0]?.window as any;
  const isCredits = firstWindow?.metric === "credits";
  const balanceAmount = typeof firstWindow?.remaining === "number" ? firstWindow.remaining : null;
  const memberAccount = pool.members[0]?.account as any;
  const monthSpend = memberAccount?.limits?.balance?.monthSpend;

  const cardTitle = isCodexWindow
    ? pool.kind === "session"
      ? "Session"
      : pool.kind === "weekly"
        ? "Weekly"
        : pool.kind === "monthly" || (pool.kind as string) === "billing"
          ? "Monthly"
          : label ?? pool.label
    : label ?? pool.label;

  const refillPercent = nextRefill?.restoresPercent ?? (100 - pool.remainingPercent);
  const showRefill = isCodexWindow
    ? refillPercent > 0 && pool.remainingPercent < 100
    : nextRefill && pool.columns.length > 1;

  return (
    <div className="grid items-center gap-x-4 sm:gap-x-6 gap-y-2.5 sm:gap-y-3 rounded-lg border border-border/60 p-3 sm:p-4 md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
      <div className="flex flex-wrap items-baseline justify-between sm:justify-start gap-x-3 sm:gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-foreground shrink-0">{cardTitle}</span>
        <span className="inline-flex items-baseline gap-1.5 self-baseline">
          {isCredits && balanceAmount !== null ? (
            <>
              <span className="text-xl sm:text-[22px] md:text-[24px] leading-tight font-semibold text-foreground tabular-nums">
                ${balanceAmount.toFixed(2)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                <span>balance</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-xl sm:text-[22px] md:text-[24px] leading-tight font-semibold text-foreground tabular-nums">
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
        ) : showRefill ? (
          <span className="text-xs font-medium text-foreground tabular-nums">
            ↺ +{refillPercent}%
          </span>
        ) : null}
      </div>
      <PoolBar pool={pool} color={color} now={now} isCodex={isCodexWindow} />
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
  const isCodex = String(pool.driver).toLowerCase().includes("codex") || String(pool.id).toLowerCase().includes("codex");
  const color = getProviderBarColor(String(pool.driver));
  const label = getProviderLabel(String(pool.driver));
  const windows = displayLimitWindows(pool)
    .filter(
      (window) => visibleLimitKeys === null || visibleLimitKeys.has(limitWindowKey(String(pool.driver), window)),
    )
    .sort((a, b) => {
      if (isCodex) {
        const order: Record<string, number> = { session: 0, weekly: 1, monthly: 2 };
        return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      }
      return 0;
    });
  if (windows.length === 0) return null;
  const primaryAccount = pool.accounts[0];
  const primaryPlan = primaryAccount?.plan
    ? formatPlanName(primaryAccount.plan)
    : "Plus";
  const singlePlan = primaryAccount?.plan ? formatPlanName(primaryAccount.plan) : "";
  const planSummary = pool.accounts.length > 1
    ? `${pool.accounts.length} / ${primaryPlan}`
    : singlePlan;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0">
          <ProviderInstanceIcon
            driverKind={pool.driver}
            displayName={label}
            indicatorBackground="var(--background)"
            className="size-5 shrink-0"
            iconClassName="size-4 text-foreground/80"
          />
          <span className="truncate">{label}</span>
        </h2>
        {planSummary ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">{planSummary}</span>
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
            isCodex={isCodex}
          />
        );
      })}
    </section>
  );
}

function readInitialHiddenLimitKeys(): ReadonlySet<string> {
  try {
    if (typeof window === "undefined") return new Set();
    const stored = window.localStorage.getItem("t3code:limits-hidden:v1");
    const parsed = stored ? JSON.parse(stored) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

export const hiddenLimitKeysAtom = Atom.make<ReadonlySet<string>>(readInitialHiddenLimitKeys()).pipe(
  Atom.keepAlive,
  Atom.withLabel("limits:hidden-limit-keys"),
);

export function setHiddenLimitKeys(next: ReadonlySet<string>): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("t3code:limits-hidden:v1", JSON.stringify([...next]));
    }
  } catch {
    // Ignore unavailable storage.
  }
  appAtomRegistry.set(hiddenLimitKeysAtom, next);
}

export function collectLimitOptions(
  presentations: Parameters<typeof collectLimitAccounts>[0],
  now: number,
  hiddenDrivers?: ReadonlySet<string>,
): readonly (readonly [string, string])[] {
  const accounts = collectLimitAccounts(presentations).filter(
    (account) => !hiddenDrivers || !hiddenDrivers.has(String(account.driver)),
  );
  const pools = collectLimitPools(accounts, now);
  const options = new Map<string, string>();
  for (const pool of pools) {
    const isCodex = pool.driver === "codex";
    for (const window of displayLimitWindows(pool)) {
      const cardTitle = isCodex
        ? window.kind === "session"
          ? "Session"
          : window.kind === "weekly"
            ? "Weekly"
            : window.kind === "monthly" || (window.kind as string) === "billing"
              ? "Monthly"
              : window.label ?? pool.label
        : window.label ?? pool.label;
      options.set(
        limitWindowKey(String(pool.driver), window),
        `${getProviderLabel(String(pool.driver))} · ${cardTitle}`,
      );
    }
  }
  return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
}

export function UsageLimitsFilter({
  limitOptions,
}: {
  readonly limitOptions: readonly (readonly [string, string])[];
}) {
  const hiddenLimitKeys = useAtomValue(hiddenLimitKeysAtom);

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

  const singleVisibleOption =
    visibleLimitKeys !== null && visibleLimitKeys.size === 1
      ? limitOptions.find(([k]) => visibleLimitKeys.has(k))
      : limitOptions.length === 1
        ? limitOptions[0]
        : null;
  const singleProvider = singleVisibleOption ? singleVisibleOption[0].split(":")[0] : null;

  if (limitOptions.length === 0) return null;

  return (
    <Menu>
      <MenuTrigger
        render={<InlineButton />}
        className="group/usage-limits min-w-0 max-w-full gap-1.5 flex items-center"
        aria-label="Choose visible limits"
      >
        {singleProvider ? (
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make(singleProvider)}
            displayName={singleVisibleOption?.[1] ?? ""}
            className="size-3.5 shrink-0"
            iconClassName="size-3.5"
          />
        ) : (
          <SlidersHorizontalIcon
            className="size-3.5 shrink-0 text-muted-foreground opacity-70 transition-opacity group-hover/usage-limits:opacity-100 group-focus-visible/usage-limits:opacity-100"
            aria-hidden
          />
        )}
        <span className="min-w-0 truncate">{limitFilterLabel}</span>
        <ChevronDownIcon
          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/usage-limits:opacity-100 group-focus-visible/usage-limits:opacity-100 group-data-popup-open/usage-limits:opacity-100"
          aria-hidden
        />
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-64">
        <MenuCheckboxItem
          checked={hiddenLimitKeys.size === 0}
          closeOnClick={false}
          onCheckedChange={(checked) =>
            setHiddenLimitKeys(checked ? new Set() : new Set(limitOptions.map(([key]) => key)))
          }
        >
          All limits
        </MenuCheckboxItem>
        <MenuSeparator />
        {limitOptions.map(([key, label]) => {
          const provider = key.split(":")[0];
          return (
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
              <span className="flex min-w-0 items-center gap-2">
                <ProviderInstanceIcon
                  driverKind={ProviderDriverKind.make(provider)}
                  displayName={label}
                  className="size-3.5 shrink-0"
                  iconClassName="size-3.5"
                />
                <span className="truncate">{label}</span>
              </span>
            </MenuCheckboxItem>
          );
        })}
      </MenuPopup>
    </Menu>
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
  const limitOptions = useMemo(
    () => collectLimitOptions(presentations, now),
    [presentations, now],
  );
  const hiddenLimitKeys = useAtomValue(hiddenLimitKeysAtom);
  const visibleLimitKeys = useMemo(
    () =>
      hiddenLimitKeys.size === 0
        ? null
        : new Set(limitOptions.map(([key]) => key).filter((key) => !hiddenLimitKeys.has(key))),
    [hiddenLimitKeys, limitOptions],
  );

  const rawNotices = collectLimitNotices(presentations);
  
  // Filter out spurious notices for notConfigured providers
  const notices = rawNotices.filter((n) =>
    !n.toLowerCase().includes("opencode") &&
    !n.toLowerCase().includes("workbuddy") &&
    !n.toLowerCase().includes("personal") &&
    !n.toLowerCase().includes("antigravity")
  );

  const externalLinks = collectExternalUsageLinks(presentations);
  const cursorPromptAt =
    Math.max(
      pools.findIndex((pool) => pool.driver === "codex"),
      pools.findIndex((pool) => pool.driver === "claudeAgent" || (pool.driver as any) === "claude"),
    ) + 1;

  const openSettings = (openAddProvider = false) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tm-open-settings", {
          detail: { section: "accounts", openAddProvider },
        }),
      );
    }
    if (typeof (window as any).tokenMonitor?.openSettings === "function") {
      (window as any).tokenMonitor.openSettings();
    } else {
      const btn = document.querySelector('button[aria-label="Settings"], [data-view="settings"]') as HTMLElement;
      if (btn) btn.click();
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {pools.length === 0 ? (
        <Empty className="py-12 border border-dashed rounded-lg border-border/60" data-slot="limits-empty-state">
          <EmptyMedia variant="icon">
            <Gauge className="size-4.5 text-muted-foreground" aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No Limits Configured</EmptyTitle>
            <EmptyDescription>
              No connected providers are currently reporting quota or subscription limits.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              size="sm"
              onClick={() => openSettings(true)}
              className="gap-1.5"
            >
              <PlusIcon className="size-4" />
              <span>Add Provider</span>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        pools.map((pool, index) => (
          <Fragment key={pool.driver}>
            {index === cursorPromptAt ? cursorPrompt : null}
            <PoolSection pool={pool} now={now} visibleLimitKeys={visibleLimitKeys} />
          </Fragment>
        ))
      )}

      {cursorPromptAt === pools.length ? cursorPrompt : null}

      {pools.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 bg-muted/15 p-4">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-medium text-foreground">Add Provider</h3>
            <p className="text-xs text-muted-foreground">
              Connect an AI provider account to monitor live usage and subscription limits.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openSettings(true)} className="gap-1.5 shrink-0">
            <PlusIcon className="size-4" />
            <span>Add Provider</span>
          </Button>
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
