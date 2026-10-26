import { ChatGptUsageButton } from "~/components/settings/ChatGptUsageButton";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import {
  ProviderDriverKind,
  type EnvironmentId,
  type UsageProviderKind,
  type UsageSummaryInput,
} from "@t3tools/contracts";
import { ChevronDownIcon, InfoIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import {
  cursorKeychainAccessEnvironments,
  refreshUsageLimits,
} from "@t3tools/client-runtime/state/usage";
import { usageLoadingState } from "@t3tools/client-runtime/state/usage-progress";

import {
  isModelCostUnknown,
  type DailyTotals,
  type HourlyTotals,
  type MergedUsage,
} from "@t3tools/shared/usageMerge";

import { cn } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentPresentations } from "~/state/presentation";
import { primaryServerKeybindingsAtom, serverEnvironment } from "~/state/server";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { isModelPickerOpen } from "~/modelPickerVisibility";
import { shortcutLabelForCommand } from "~/keybindings";
import { useUsage, type EnvironmentUsageStatus } from "@/adapters/usageState";
import type { WindowSessions } from "@/types/tokenMonitor";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  enumerateDays,
  enumerateHourStarts,
  formatCount,
  formatDateTimeShort,
  formatDayShort,
  formatHourShort,
  formatPercent,
  formatTokens,
  formatUsd,
  makeWindow,
} from "@t3tools/shared/usageFormat";
import { Button, InlineButton } from "~/components/ui/button";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SidebarInset } from "~/components/ui/sidebar";
import { Skeleton } from "~/components/ui/skeleton";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { PageHeader } from "@/components/shell/PageHeader";
import { UsageLimitsSection } from "~/components/usage/UsageLimits";
import { UsagePriceOverrides } from "~/components/usage/UsagePriceOverrides";
import { UsageProviderChart } from "~/components/usage/UsageProviderChart";
import { SpeedPremium, UsageModelDialog } from "~/components/usage/UsageModelDialog";
import { UsageShareBar } from "~/components/usage/UsageShareBar";
import { ActivityHeatmap } from "@/components/usage/ActivityHeatmap";
import {
  costTypeSegments,
  modelShare,
  sortModelsByTokens,
  speedCostSegments,
  tokenTypeSegments,
} from "~/components/usage/usageBreakdown";
import {
  METRIC_OPTIONS,
  WINDOW_OPTIONS,
  resolveUsageShortcut,
  type UsageMetric,
} from "~/components/usage/usageShortcuts";
import { useEscapeToGoBack } from "~/hooks/useNavigateBack";
import {
  PROVIDER_ORDER,
  PROVIDER_PRESENTATION,
  getSelectableProviders,
  providersWithUsage,
} from "@/components/usage/usageProviders";
import {
  readUsagePagePreferences,
  saveUsagePagePreferences,
  type UsagePagePreferences,
} from "~/components/usage/usagePagePreferences";

function isUsageMetric(value: string | null | undefined): value is UsageMetric {
  return METRIC_OPTIONS.some((option) => option.value === value);
}

function isUsageWindowDays(value: number): value is UsagePagePreferences["windowDays"] {
  return WINDOW_OPTIONS.some((option) => option.days === value);
}

const providerLabel = (provider: UsageProviderKind) => PROVIDER_PRESENTATION[provider].label;

function usageLoading(
  showingKept: boolean,
  selectedEnvironments: Parameters<typeof usageLoadingState>[0],
  refreshingUsage: boolean,
  hiddenProviders: ReadonlySet<UsageProviderKind>,
) {
  if (showingKept) {
    return { partial: true, everyProvider: true, providers: new Set<UsageProviderKind>() };
  }
  const state = usageLoadingState(selectedEnvironments, refreshingUsage);
  const providers = new Set([...state.providers].filter((p) => !hiddenProviders.has(p)));
  return {
    partial: state.everyProvider || providers.size > 0,
    everyProvider: state.everyProvider,
    providers,
  };
}

/**
 * The model whose detail dialog is open. It lives outside UsagePage so opening
 * or closing the dialog renders only its host, not the whole usage page.
 */
const selectedUsageModelKeyAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("usage:selected-model-key"),
);

function selectUsageModel(key: string | null): void {
  appAtomRegistry.set(selectedUsageModelKeyAtom, key);
}

function UsageModelDialogHost({
  models,
  onSetPrice,
  ...dialogProps
}: Omit<Parameters<typeof UsageModelDialog>[0], "model" | "onSetPrice" | "onClose"> & {
  readonly models: MergedUsage["models"];
  readonly onSetPrice: (model: string) => void;
}) {
  const selectedKey = useAtomValue(selectedUsageModelKeyAtom);
  useEffect(() => () => selectUsageModel(null), []);
  const model =
    selectedKey === null
      ? undefined
      : models.find((candidate) => `${candidate.provider}:${candidate.model}` === selectedKey);
  if (model === undefined) return null;
  return (
    <UsageModelDialog
      {...dialogProps}
      model={model}
      onSetPrice={() => {
        selectUsageModel(null);
        onSetPrice(model.model);
      }}
      onClose={() => selectUsageModel(null)}
    />
  );
}

// Usage (tokens/cost over a window) and Limits (live quotas) share one page
export function UsagePage({ mode }: { readonly mode: "usage" | "limits" }) {
  const [preferences, setPreferences] = useState(readUsagePagePreferences);
  useEscapeToGoBack();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcutTitle = (
    option: (typeof METRIC_OPTIONS)[number] | (typeof WINDOW_OPTIONS)[number],
  ) => {
    const shortcut = shortcutLabelForCommand(keybindings, option.command, {
      context: { usagePageOpen: true },
    });
    return shortcut ? `${option.label} (${shortcut})` : option.label;
  };
  const [windowSelection, setWindowSelection] = useState(() => ({
    days: preferences.windowDays,
    window: makeWindow(
      preferences.windowDays,
      undefined,
      preferences.windowDays === 1 ? "hour" : "day",
    ),
  }));
  const showingLimits = mode === "limits";
  const metric: UsageMetric = preferences.metric === "cost" ? "cost" : "tokens";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [limitsNow, setLimitsNow] = useState(() => Date.now());
  const refreshingRef = useRef(false);
  const [priceDialog, setPriceDialog] = useState<{ readonly model?: string } | null>(null);
  const hiddenProviders = useMemo(() => new Set(preferences.hiddenProviders), [preferences.hiddenProviders]);
  const { days: windowDays, window } = windowSelection;
  const isPast24Hours = windowDays === 1;
  const {
    merged: answeredUsage,
    environments,
    selectedEnvironments,
    shown,
    refresh,
    activeDays,
    peakDayTokens,
    hasWindowSessions,
    windowSessions,
    stats,
  } = useUsage(window, null, hiddenProviders);
  const merged = shown?.merged ?? answeredUsage;
  const shownWindow = shown?.window ?? window;
  const summarySinceDay = (environments[0]?.summary as any)?.sinceDay;
  const effectiveWindow = useMemo(() => {
    if (windowDays === 0 && summarySinceDay && shownWindow.sinceDay !== summarySinceDay) {
      return { ...shownWindow, sinceDay: summarySinceDay };
    }
    return shownWindow;
  }, [windowDays, summarySinceDay, shownWindow]);
  const shownHourly = effectiveWindow.resolution === "hour";
  const refreshingUsage = isRefreshing && !showingLimits;
  const showingKept = shown !== null && shown.window !== window;
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const providersByEnvironment = useAtomValue(environmentPresentations.providersByEnvironmentAtom);
  const selectableProviders = useMemo(
    () =>
      getSelectableProviders({
        mode,
        presentations: presentations.values(),
        stats,
        merged,
        windowSessions,
        hiddenProviders,
      }) as readonly UsageProviderKind[],
    [mode, presentations, stats, merged, windowSessions, hiddenProviders],
  );
  const cursorAccessEnvironments = useMemo(
    () => (hiddenProviders.has("cursor") ? [] : cursorKeychainAccessEnvironments(selectedEnvironments)),
    [hiddenProviders, selectedEnvironments],
  );
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  const canReadDiagnostics = selectedEnvironments.some(
    (environment) => environment.canReadDiagnostics,
  );

  const updatePreferences = (patch: Partial<UsagePagePreferences>) => {
    const nextPreferences = { ...preferences, ...patch };
    setPreferences(nextPreferences);
    saveUsagePagePreferences(nextPreferences);
  };
  const selectWindow = (days: number) => {
    if (!isUsageWindowDays(days)) return;
    updatePreferences({ windowDays: days });
    setWindowSelection({
      days,
      window: makeWindow(days, undefined, days === 1 ? "hour" : "day"),
    });
  };
  const selectMetric = (nextMetric: UsageMetric) => {
    updatePreferences({ metric: nextMetric });
  };
  const refreshLimits = (automatic = false, afterPending = false) =>
    // Settled so the timestamp still advances when a refresh throws.
    settlePromise(() =>
      Promise.all(
        Array.from(presentations, ([environmentId, presentation]) => {
          if (presentation.connection.phase === "connected" && presentation.serverConfig !== null) {
            return refreshUsageLimits(
              environmentId,
              () => refreshProviders({ environmentId, input: {} }),
              automatic,
              afterPending,
            );
          }
        }),
      ),
    ).then((result) => {
      setLimitsNow(Date.now());
      if (!AsyncResult.isSuccess(result)) throw Cause.squash(result.cause);
    });
  const onUsageKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      isCommandPaletteOpen() ||
      isModelPickerOpen()
    )
      return;

    const command = resolveUsageShortcut(event, keybindings);
    const metricOption = METRIC_OPTIONS.find((option) => option.command === command);
    const periodOption = WINDOW_OPTIONS.find((option) => option.command === command);
    if (!metricOption && !periodOption) return;

    event.preventDefault();
    event.stopPropagation();
    if (metricOption && metricOption.value !== "limits" && !showingLimits) selectMetric(metricOption.value);
    if (periodOption && !showingLimits) selectWindow(periodOption.days);
  });

  useEffect(() => {
    globalThis.window.addEventListener("keydown", onUsageKeyDown, true);
    return () => globalThis.window.removeEventListener("keydown", onUsageKeyDown, true);
  }, []);

  const refreshWindow = () => {
    if (refreshingRef.current) return;

    if (showingLimits) {
      refreshingRef.current = true;
      setIsRefreshing(true);
      void refreshLimits().finally(() => {
        refreshingRef.current = false;
        setIsRefreshing(false);
      });
      return;
    }
    const nextWindow = makeWindow(windowDays, undefined, isPast24Hours ? "hour" : "day");
    if (
      nextWindow.sinceDay !== window.sinceDay ||
      nextWindow.untilDay !== window.untilDay ||
      nextWindow.sinceTime !== window.sinceTime ||
      nextWindow.untilTime !== window.untilTime
    ) {
      setWindowSelection({ days: windowDays, window: nextWindow });
    }
    refreshingRef.current = true;
    setIsRefreshing(true);
    void refresh(nextWindow).finally(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
    });
  };
  const connectedLimitsEnvironments = useMemo(
    () =>
      [...presentations]
        .filter(
          ([environmentId, presentation]) =>
            presentation.connection.phase === "connected" &&
            presentation.serverConfig !== null,
        )
        .map(([environmentId]) => environmentId)
        .sort()
        .join(","),
    [presentations],
  );
  const autoRefreshLimits = useEffectEvent(() => {
    const hasProviders = [...presentations].some(
      ([, presentation]) => (presentation.serverConfig?.providers?.length ?? 0) > 0,
    );
    void refreshLimits(!hasProviders ? false : true);
  });
  useEffect(() => {
    if (showingLimits && connectedLimitsEnvironments) autoRefreshLimits();
  }, [showingLimits, connectedLimitsEnvironments]);

  const days = useMemo(
    () => enumerateDays(effectiveWindow.sinceDay, effectiveWindow.untilDay),
    [effectiveWindow.sinceDay, effectiveWindow.untilDay],
  );
  const hours = useMemo(
    () =>
      shownWindow.sinceTime === undefined || shownWindow.untilTime === undefined
        ? []
        : enumerateHourStarts(shownWindow.sinceTime, shownWindow.untilTime),
    [shownWindow.sinceTime, shownWindow.untilTime],
  );
  const showChatGptSharing = useMemo(
    () =>
      !hiddenProviders.has("codex") &&
      [...providersByEnvironment].some(
        ([, providers]) => providers.some(usesChatGptSharing),
      ),
    [hiddenProviders, providersByEnvironment],
  );

  const windowLabel = useMemo(
    () =>
      shownHourly && effectiveWindow.sinceTime !== undefined && effectiveWindow.untilTime !== undefined
        ? `${formatDateTimeShort(effectiveWindow.sinceTime, effectiveWindow.timeZone)} to ${formatDateTimeShort(effectiveWindow.untilTime, effectiveWindow.timeZone)}`
        : `${formatDayShort(effectiveWindow.sinceDay)} to ${formatDayShort(effectiveWindow.untilDay)}`,
    [
      shownHourly,
      effectiveWindow.sinceTime,
      effectiveWindow.untilTime,
      effectiveWindow.timeZone,
      effectiveWindow.sinceDay,
      effectiveWindow.untilDay,
    ],
  );
  const headerControls = (
    <>
      <div className="flex h-8 items-center gap-3 rounded-[3px] px-3.5 shadow-[inset_0_0_0_1px_var(--border)] [&_*]:font-mono [&_*]:text-[11px] [&_*]:tracking-[0.06em] [&_*]:uppercase">
      <UsageProviderFilter
        availableProviders={selectableProviders}
        hiddenProviders={hiddenProviders}
        onChange={(next) => updatePreferences({ hiddenProviders: next })}
      />
      {showingLimits ? null : (
        <Menu>
          <MenuTrigger
            render={<InlineButton />}
            aria-label="Usage options"
            className="group/usage-options"
          >
            <SlidersHorizontalIcon
              className="size-3.5 text-muted-foreground opacity-70 transition-opacity group-hover/usage-options:opacity-100 group-focus-visible/usage-options:opacity-100"
              aria-hidden
            />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={() => setPriceDialog({})}>
              <SlidersHorizontalIcon aria-hidden />
              Model prices
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
      </div>
      {showingLimits ? null : (
      <>
      <ToggleGroup
        aria-label="Usage metric"
        variant="segmented"
        value={[metric]}
        onValueChange={(next) => {
          const value = next[0];
          if (isUsageMetric(value)) selectMetric(value);
        }}
      >
        {METRIC_OPTIONS.filter((option) => option.value !== "limits").map((option) => (
          <Toggle key={option.value} value={option.value} title={shortcutTitle(option)}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <ToggleGroup
        aria-label="Usage period"
        variant="segmented"
        value={[String(windowDays)]}
        onValueChange={(next) => {
          const value = next[0];
          if (value) selectWindow(Number(value));
        }}
      >
        {WINDOW_OPTIONS.map((option) => (
          <Toggle key={option.days} value={String(option.days)} title={shortcutTitle(option)}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      </>
      )}
      <Button
        onClick={refreshWindow}
        aria-label={showingLimits ? "Refresh limits" : "Refresh usage"}
        aria-busy={isRefreshing}
        disabled={isRefreshing || (!showingLimits && !canReadDiagnostics)}
        size="icon-sm"
        variant="ghost"
      >
        <RefreshIcon size="sm" refreshing={isRefreshing} />
      </Button>
    </>
  );

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none isolate bg-transparent">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
        <PageHeader title={showingLimits ? "Limits" : "Usage"} subtitle={showingLimits ? undefined : windowLabel}>
          {headerControls}
        </PageHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex w-full max-w-[1200px] flex-col gap-6 px-10 pt-4 pb-12">
            {selectedEnvironments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {`Connect an environment to see ${showingLimits ? "limits" : "usage"}.`}
              </p>
            ) : showingLimits ? (
              <UsageLimitsSection
                selectedEnvironmentIds={null}
                hiddenProviders={hiddenProviders}
                now={limitsNow}
                cursorPrompt={
                  cursorAccessEnvironments.length > 0 ? (
                    <CursorEnableLimits
                      environments={cursorAccessEnvironments}
                      onEnabled={() => {
                        void refresh();
                        void refreshLimits(false, true);
                      }}
                    />
                  ) : null
                }
              />
            ) : shown === null ? (
              <UsageSkeleton />
            ) : !canReadDiagnostics ? (
              <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
                {selectedEnvironments.map((environment) => (
                  <p key={environment.environmentId}>
                    {selectedEnvironments.length > 1 ? `${environment.label}: ` : null}
                    {environment.error}
                  </p>
                ))}
              </div>
            ) : (
              <UsageOverview
                merged={merged}
                shownWindow={effectiveWindow}
                days={days}
                hours={hours}
                showingKept={showingKept}
                metric={metric === "tokens" ? "tokens" : "cost"}
                selectedEnvironments={selectedEnvironments}
                hiddenProviders={hiddenProviders}
                refreshingUsage={refreshingUsage}
                cursorAccessEnvironments={cursorAccessEnvironments}
                showChatGptSharing={showChatGptSharing}
                activeDays={activeDays}
                peakDayTokens={peakDayTokens}
                hasWindowSessions={hasWindowSessions}
                windowSessions={windowSessions}
                onCursorEnabled={() => {
                  void refresh();
                  void refreshLimits(false, true);
                }}
                onSelectModel={selectUsageModel}
              />
            )}
          </div>
        </ScrollArea>
      </div>
      {showingLimits ? null : (
        <UsageModelDialogHost
          models={merged.models}
          environments={selectedEnvironments}
          metric={metric === "tokens" ? "tokens" : "cost"}
          chartWindow={{
            days,
            hours,
            resolution: shownHourly ? "hour" : "day",
            timeZone: shownWindow.timeZone,
            referenceTime: shownWindow.untilTime,
          }}
          onSetPrice={(model) => setPriceDialog({ model })}
        />
      )}
      {priceDialog ? (
        <UsagePriceOverrides
          usage={environments}
          initialSelectedEnvironmentIds={null}
          initialModel={priceDialog.model}
          onOpenChange={(open) => {
            if (!open) setPriceDialog(null);
          }}
        />
      ) : null}
    </SidebarInset>
  );
}

function UsageOverview({
  merged,
  shownWindow,
  days,
  hours,
  showingKept,
  metric,
  selectedEnvironments,
  hiddenProviders,
  refreshingUsage,
  cursorAccessEnvironments,
  showChatGptSharing,
  activeDays,
  peakDayTokens,
  hasWindowSessions,
  windowSessions,
  onCursorEnabled,
  onSelectModel,
}: {
  readonly merged: MergedUsage;
  readonly shownWindow: any;
  readonly days: readonly string[];
  readonly hours: readonly string[];
  readonly showingKept: boolean;
  readonly metric: "tokens" | "cost";
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly refreshingUsage: boolean;
  readonly cursorAccessEnvironments: readonly EnvironmentUsageStatus[];
  readonly showChatGptSharing: boolean;
  readonly activeDays?: number | undefined;
  readonly peakDayTokens?: number | undefined;
  readonly hasWindowSessions?: boolean | undefined;
  readonly windowSessions?: WindowSessions | undefined;
  readonly onCursorEnabled: () => void;
  readonly onSelectModel: (key: string) => void;
}) {
  const [breakdown, setBreakdown] = useState<"model" | "time">("model");
  const shownHourly = shownWindow.resolution === "hour";
  const loading = useMemo(
    () => usageLoading(showingKept, selectedEnvironments, refreshingUsage, hiddenProviders),
    [showingKept, selectedEnvironments, refreshingUsage, hiddenProviders],
  );
  // A primitive copy: reading `loading.partial` in the JSX would keep `loading` alive
  // across every derivation below and fold them into one cache scope.
  const loadingPartial = loading.partial === true;
  const loadingProviders = useMemo(
    () =>
      new Set(
        PROVIDER_ORDER.filter((provider) => loading.everyProvider || loading.providers.has(provider)),
      ),
    [loading.everyProvider, loading.providers],
  );
  const providersWithData = useMemo(
    () => new Set(providersWithUsage(merged.providers)),
    [merged.providers],
  );
  const activeProviders = useMemo(
    () =>
      [...PROVIDER_ORDER].filter(
        (provider) => providersWithData.has(provider) || loading.providers.has(provider),
      ),
    [providersWithData, loading.providers],
  );
  const chartLoadingProviders = useMemo(
    () =>
      new Set(
        activeProviders.filter((provider) => loadingProviders.has(provider)),
      ),
    [activeProviders, loadingProviders],
  );
  const sourceMessages = useMemo(
    () => [
      ...new Set(
        selectedEnvironments.flatMap(
          (environment) =>
            environment.summary?.sources.flatMap((source) =>
              source.message &&
              !source.action &&
              !hiddenProviders.has(source.fingerprint.provider) &&
              (source.status === "partial" ||
                source.status === "failed" ||
                source.fingerprint.provider === "cursor")
                ? [source.message]
                : [],
            ) ?? [],
        ),
      ),
    ],
    [selectedEnvironments, hiddenProviders],
  );
  const breakdownPeriods: readonly (DailyTotals | HourlyTotals)[] = useMemo(
    () => (shownHourly ? merged.hourly : merged.daily).toReversed(),
    [shownHourly, merged.hourly, merged.daily],
  );
  const breakdownModels = useMemo(
    () =>
      breakdown === "model" && metric === "tokens"
        ? sortModelsByTokens(merged.models)
        : merged.models,
    [breakdown, metric, merged.models],
  );
  const breakdownPeak = useMemo(
    () =>
      breakdownModels.reduce(
        (peak, model) => Math.max(peak, metric === "tokens" ? model.totalTokens : model.costUsd),
        0,
      ),
    [breakdownModels, metric],
  );
  const cursorInsertAt = useMemo(
    () => Math.max(activeProviders.indexOf("codex"), activeProviders.indexOf("claude")) + 1,
    [activeProviders],
  );
  const summaryRows: ReadonlyArray<
    | { readonly kind: "usage"; readonly provider: UsageProviderKind }
    | { readonly kind: "enable"; readonly environment: EnvironmentUsageStatus }
  > = useMemo(
    () => [
      ...activeProviders
        .slice(0, cursorInsertAt)
        .map((provider) => ({ kind: "usage" as const, provider })),
      ...cursorAccessEnvironments.map((environment) => ({ kind: "enable" as const, environment })),
      ...activeProviders
        .slice(cursorInsertAt)
        .map((provider) => ({ kind: "usage" as const, provider })),
    ],
    [activeProviders, cursorInsertAt, cursorAccessEnvironments],
  );
  const timeValueColumnWidth = useMemo(
    () => `${60 / (activeProviders.length + 2)}%`,
    [activeProviders.length],
  );
  const windowActiveDays = useMemo(
    () =>
      merged.daily.filter((d) =>
        metric === "cost" ? d.costUsd > 0 : d.totalTokens > 0,
      ).length,
    [merged.daily, metric],
  );
  const windowPeak = useMemo(
    () =>
      merged.daily.reduce(
        (max, d) =>
          Math.max(max, metric === "cost" ? d.costUsd : d.totalTokens),
        0,
      ),
    [merged.daily, metric],
  );


  return (
    <div aria-busy={loadingPartial} className="flex flex-col gap-10 pb-10">
      {sourceMessages.map((message) => (
        <p key={message} className="mb-4 text-sm text-muted-foreground">
          {message}
        </p>
      ))}
      <section className="flex flex-col gap-8">
        <div className="flex items-center gap-2">
          <h2 className="tm-label !text-foreground">Totals</h2>
          {metric === "cost" && merged.costQuality.unpricedShare > 0 ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={<InlineButton tone="muted" />}
                aria-label="Unpriced usage details"
              >
                <InfoIcon className="size-3" aria-hidden />
              </PopoverTrigger>
              <PopoverPopup side="top" tooltipStyle>
                API estimate excludes {formatPercent(merged.costQuality.unpricedShare)} unpriced records.
              </PopoverPopup>
            </Popover>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-1 md:grid-cols-5">
          <Metric loading={loadingPartial} label="Processed tokens" value={formatTokens(merged.totalTokens)} />
          <Metric loading={loadingPartial} label="Cached input" value={formatTokens(merged.cachedInputTokens)} />
          <Metric loading={loadingPartial} label="Uncached input" value={formatTokens(merged.uncachedInputTokens)} />
          <Metric loading={loadingPartial} label="Output" value={formatTokens(merged.outputTokens)} />
          <Metric loading={loadingPartial} label="Cache savings" value={formatUsd(merged.costQuality.cacheSavingsUsd)} />
        </div>
        <UsageProviderChart
          providers={activeProviders}
          loadingProviders={chartLoadingProviders}
          days={days}
          daily={merged.daily}
          hours={hours}
          hourly={merged.hourly}
          metric={metric}
          referenceTime={shownWindow.untilTime}
          resolution={shownHourly ? "hour" : "day"}
          timeZone={shownWindow.timeZone}
        />

        {showChatGptSharing ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>ChatGPT shared usage</span>
            <ChatGptUsageButton size="xs" />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
          {summaryRows.map((row) => {
            if (row.kind === "enable") {
              return (
                <CursorEnableRow
                  key={`enable:${row.environment.environmentId}`}
                  environmentId={row.environment.environmentId}
                  label={row.environment.label}
                  showEnvironment={selectedEnvironments.length > 1}
                  onEnabled={onCursorEnabled}
                />
              );
            }
            const provider = row.provider;
            const totals = merged.providers.find((entry) => entry.provider === provider);
            const share = metric === "cost" ? (totals?.costShare ?? 0) : (totals?.tokenShare ?? 0);
            const providerLoading = loadingProviders.has(provider);
            const awaitingData = providerLoading && !providersWithData.has(provider);
            const providerSessions = hasWindowSessions
              ? (windowSessions?.[provider] ?? totals?.sessions ?? 0)
              : 0;
            return (
              <div
                key={provider}
                className="flex min-w-0 flex-col gap-2 border-l-[3px] pl-3"
                style={{ borderColor: PROVIDER_PRESENTATION[provider].color }}
              >
                <span className="tm-label flex min-w-0 items-center gap-1.5">
                  <ProviderMark provider={provider} className="size-3.5" />
                  <span className="truncate">{PROVIDER_PRESENTATION[provider].label}</span>
                </span>
                <span
                  className={cn(
                    "text-[26px] leading-none font-semibold text-foreground tabular-nums",
                    figureClass(providerLoading),
                  )}
                >
                  {awaitingData
                    ? "—"
                    : metric === "cost"
                      ? formatUsd(totals?.costUsd ?? 0)
                      : formatTokens(totals?.totalTokens ?? 0)}
                </span>
                <span
                  className={cn(
                    "text-2xs text-muted-foreground tabular-nums",
                    figureClass(providerLoading),
                    awaitingData && "invisible",
                  )}
                >
                  {hasWindowSessions && providerSessions > 0
                    ? `${formatPercent(share)} · ${formatCount(providerSessions)} sessions`
                    : `${formatPercent(share)} · —`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {metric === "tokens" && merged.totalTokens > 0 ? (
        <section className={cn("border-t border-border pt-8", figureClass(loadingPartial))}>
          <UsageShareBar
            label="Tokens by type"
            segments={tokenTypeSegments({
              uncachedInputTokens: merged.uncachedInputTokens,
              cachedInputTokens: merged.cachedInputTokens,
              cacheCreationTokens: merged.cacheCreationTokens,
              outputTokens: merged.outputTokens,
            })}
            format={formatTokens}
          />
        </section>
      ) : null}

      {metric === "cost" && merged.costUsd > 0 ? (
        <section className={cn("grid gap-x-12 gap-y-6 border-t border-border pt-8 lg:grid-cols-2", figureClass(loadingPartial))}>
          <UsageShareBar label="Cost by type" segments={costTypeSegments(merged.categoryCost)} format={formatUsd} />
          <UsageShareBar
            label="Cost by speed"
            segments={speedCostSegments(merged.speedCost)}
            format={formatUsd}
            aside={
              merged.speedCost.premium > 0 ? (
                <SpeedPremium premiumUsd={merged.speedCost.premium} />
              ) : undefined
            }
          />
        </section>
      ) : null}

      <ActivityHeatmap
        metric={metric}
        sinceDay={shownWindow.sinceDay}
        untilDay={shownWindow.untilDay}
        activeDays={windowActiveDays}
        peakValue={windowPeak}
        peakTokens={metric === "tokens" ? windowPeak : undefined}
      />

      <section className="flex flex-col gap-3 border-t border-border pt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="tm-label !text-foreground">Breakdown</h2>
          <ToggleGroup
            aria-label="Usage breakdown"
            variant="segmented"
            value={[breakdown]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "model" || value === "time") setBreakdown(value);
            }}
          >
            {(
              [
                { value: "model", label: "Model" },
                { value: "time", label: shownHourly ? "Hour" : "Day" },
              ] as const
            ).map((option) => (
              <Toggle key={option.value} value={option.value}>
                {option.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>

        {breakdown === "model" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right tm-label">
                <th className="py-2 pr-3 text-left font-medium">#</th>
                <th className="w-full py-2 text-left font-medium">Model</th>
                <th className="py-2 pl-6 font-medium">Cost</th>
                <th className="hidden py-2 pl-6 font-medium sm:table-cell">Share</th>
                <th className="py-2 pl-6 font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {breakdownModels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No activity in this window.
                  </td>
                </tr>
              ) : (
                breakdownModels.map((model, index) => {
                  const key = `${model.provider}:${model.model}`;
                  const value = metric === "tokens" ? model.totalTokens : model.costUsd;
                  const share = modelShare(model, metric === "tokens" ? "tokens" : "cost");
                  const rowFigures = figureClass(loadingProviders.has(model.provider));
                  return (
                    <tr
                      key={key}
                      className="relative border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:bg-muted/50 has-focus-visible:bg-muted/50"
                    >
                      <td className="py-2.5 pr-3 text-left text-xs">{index + 1}</td>
                      <td className="py-2.5 text-left whitespace-normal">
                        <button
                          type="button"
                          onClick={() => onSelectModel(key)}
                          className="flex items-center gap-2 text-left text-foreground outline-none after:absolute after:inset-0"
                        >
                          <ProviderMark provider={model.provider} className="size-3.5" />
                          {model.model}
                        </button>
                        <div aria-hidden className={cn("mt-1.5 h-0.5 max-w-48", rowFigures)}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width:
                                value > 0 && breakdownPeak > 0
                                  ? `max(0.5rem, ${(value / breakdownPeak) * 100}%)`
                                  : 0,
                              backgroundColor: PROVIDER_PRESENTATION[model.provider].color,
                            }}
                          />
                        </div>
                      </td>
                      <td className={cn("py-2.5 pl-6 text-foreground", rowFigures)}>
                        {isModelCostUnknown(model) ? (
                          <span className="text-muted-foreground">Unpriced</span>
                        ) : (
                          formatUsd(model.costUsd)
                        )}
                      </td>
                      <td className={cn("hidden py-2.5 pl-6 sm:table-cell", rowFigures)}>
                        {share === null ? "" : formatPercent(share)}
                      </td>
                      <td className={cn("py-2.5 pl-6", rowFigures)}>
                        {formatTokens(model.totalTokens)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-2/5" />
              {activeProviders.map((provider) => (
                <col key={provider} style={{ width: timeValueColumnWidth }} />
              ))}
              <col style={{ width: timeValueColumnWidth }} />
              <col style={{ width: timeValueColumnWidth }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left tm-label">
                <th className="py-2 font-medium">{shownHourly ? "Hour" : "Day"}</th>
                {activeProviders.map((provider) => (
                  <th key={provider} className="py-2 text-right font-medium">
                    {PROVIDER_PRESENTATION[provider].label}
                  </th>
                ))}
                <th className="py-2 text-right font-medium">Total</th>
                <th className="py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {breakdownPeriods.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeProviders.length + 3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No activity in this window.
                  </td>
                </tr>
              ) : (
                breakdownPeriods.map((period) => (
                  <tr
                    key={"hourStart" in period ? period.hourStart : period.day}
                    className="border-b border-border/50 transition-colors hover:bg-muted/50"
                  >
                    <td className="py-2 text-foreground tabular-nums">
                      {"hourStart" in period
                        ? formatHourShort(period.hourStart, shownWindow.timeZone)
                        : formatDayShort(period.day)}
                    </td>
                    {activeProviders.map((provider) => (
                      <td
                        key={provider}
                        className={cn(
                          "py-2 text-right text-muted-foreground tabular-nums",
                          figureClass(loadingProviders.has(provider)),
                        )}
                      >
                        {formatUsd(period.byProvider.get(provider)?.costUsd ?? 0)}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "py-2 text-right text-foreground tabular-nums",
                        figureClass(loadingPartial),
                      )}
                    >
                      {formatUsd(period.costUsd)}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right text-muted-foreground tabular-nums",
                        figureClass(loadingPartial),
                      )}
                    >
                      {formatTokens(period.totalTokens)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const CURSOR_KEYCHAIN_COPY = "Requires access to your Cursor login in macOS Keychain.";

function CursorEnableButton({
  environmentId,
  label,
  onEnabled,
  tooltip,
  buttonText = "Enable",
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly onEnabled: () => void;
  readonly tooltip: boolean;
  readonly buttonText?: string;
}) {
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "enable Cursor account usage",
  });
  const [pending, setPending] = useState(false);
  const enable = async () => {
    setPending(true);
    const result = await updateSettings({
      environmentId,
      input: { patch: { cursorKeychainUsageEnabled: true } },
    });
    if (result._tag === "Success") onEnabled();
    setPending(false);
  };
  const button = tooltip ? (
    <InlineButton
      disabled={pending}
      aria-busy={pending}
      aria-label={`Enable Cursor usage from ${label}`}
      onClick={() => void enable()}
    >
      {buttonText}
    </InlineButton>
  ) : (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      aria-label={`Enable Cursor usage from ${label}`}
      onClick={() => void enable()}
    >
      {buttonText}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{CURSOR_KEYCHAIN_COPY}</TooltipPopup>
    </Tooltip>
  );
}

function CursorEnableRow({
  environmentId,
  label,
  showEnvironment,
  onEnabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly showEnvironment: boolean;
  readonly onEnabled: () => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-2 border-l-[3px] pl-3"
      style={{ borderColor: PROVIDER_PRESENTATION.cursor.color }}
    >
      <span className="tm-label flex min-w-0 items-center gap-1.5">
        <ProviderMark provider="cursor" className="size-3.5" />
        <span className="truncate">Cursor{showEnvironment ? ` · ${label}` : ""}</span>
      </span>
      <div className="pt-1">
        <CursorEnableButton
          environmentId={environmentId}
          label={label}
          onEnabled={onEnabled}
          tooltip
        />
      </div>
    </div>
  );
}

function CursorEnableLimits({
  environments,
  onEnabled,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly onEnabled: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ProviderInstanceIcon
          driverKind={ProviderDriverKind.make("cursor")}
          displayName="Cursor"
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
        Cursor
      </h2>
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border/60 p-4">
        <p className="text-xs text-muted-foreground">{CURSOR_KEYCHAIN_COPY}</p>
        <div className="flex flex-wrap gap-2">
          {environments.map((environment) => (
            <CursorEnableButton
              key={environment.environmentId}
              environmentId={environment.environmentId}
              label={environment.label}
              buttonText={environments.length > 1 ? `Enable on ${environment.label}` : "Enable"}
              onEnabled={onEnabled}
              tooltip={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProviderMark({
  provider,
  className,
}: {
  readonly provider: UsageProviderKind;
  readonly className: string;
}) {
  const presentation = PROVIDER_PRESENTATION[provider];
  return (
    <ProviderInstanceIcon
      driverKind={presentation.driverKind}
      displayName={presentation.label}
      iconClassName={className}
    />
  );
}

function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}

function Metric({
  label,
  value,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="tm-label">{label}</span>
      <span
        className={cn("text-[26px] leading-none font-semibold text-foreground tabular-nums", figureClass(loading))}
      >
        {value}
      </span>
    </div>
  );
}

function UsageProviderFilter({
  availableProviders = PROVIDER_ORDER as readonly UsageProviderKind[],
  hiddenProviders,
  onChange,
}: {
  readonly availableProviders?: readonly UsageProviderKind[];
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly onChange: (hiddenProviders: readonly UsageProviderKind[]) => void;
}) {
  const visible = availableProviders.filter((provider) => !hiddenProviders.has(provider));
  const allChecked = availableProviders.length > 0 && visible.length === availableProviders.length;
  const label =
    availableProviders.length === 0
      ? "No providers"
      : allChecked
        ? "All providers"
        : visible.length === 0
          ? "No providers"
          : visible.length === 1
            ? PROVIDER_PRESENTATION[visible[0]!].label
            : `${visible.length} providers`;

  return (
    <Menu>
      <MenuTrigger render={<InlineButton />} className="group/usage-provider min-w-0 max-w-full">
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon
          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/usage-provider:opacity-100 group-focus-visible/usage-provider:opacity-100 group-data-popup-open/usage-provider:opacity-100"
          aria-hidden
        />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuCheckboxItem
          checked={allChecked}
          closeOnClick={false}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? [...hiddenProviders].filter(
                    (p) => !availableProviders.includes(p),
                  )
                : [
                    ...new Set([
                      ...hiddenProviders,
                      ...availableProviders,
                    ]),
                  ],
            )
          }
        >
          All providers
        </MenuCheckboxItem>
        <MenuSeparator />
        {availableProviders.map((provider) => (
          <MenuCheckboxItem
            key={provider}
            checked={!hiddenProviders.has(provider)}
            closeOnClick={false}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...hiddenProviders].filter((p) => p !== provider)
                  : [...new Set([...hiddenProviders, provider])],
              )
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <ProviderMark provider={provider} className="size-3.5" />
              <span className="truncate">{PROVIDER_PRESENTATION[provider].label}</span>
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function UsageSkeleton() {
  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-4 w-32" />
          </div>
          {PROVIDER_ORDER.map((provider) => (
            <div key={provider} className="flex flex-col gap-1">
              <div className="flex min-h-5 items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <Skeleton shape="pill" className="size-2 shrink-0" />
                  <Skeleton shape="pill" className="size-4 shrink-0" />
                  <Skeleton className="h-3.5 w-20" />
                </span>
                <Skeleton className="h-3.5 w-14" />
              </div>
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="flex flex-col gap-1">
            <Skeleton className="ml-16 h-56" />
            <Skeleton className="ml-16 h-4" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="tm-label !text-foreground">Totals</h2>
        <MetricSkeletons
          labels={["Processed tokens", "Cached input", "Uncached input", "Output", "Cache savings"]}
        />
      </section>

      <section className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2" />
          <Skeleton className="h-4 w-72" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="tm-label !text-foreground">Breakdown</h2>
          <Skeleton shape="card" className="h-7 w-28" />
        </div>
        <Skeleton className="h-44" />
      </section>
    </>
  );
}

function MetricSkeletons({ labels }: { readonly labels: readonly string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-1 md:grid-cols-5">
      {labels.map((label) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="tm-label">{label}</span>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
