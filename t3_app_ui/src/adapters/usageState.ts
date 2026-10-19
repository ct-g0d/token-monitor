import {
  EnvironmentId,
  UsageDay,
  USAGE_CONTRACT_VERSION,
  type UsageSummaryInput,
  type UsageProviderKind,
  type UsageSummary,
  type UsageBucket,
} from "@t3tools/contracts";
import { mergeUsage, type EnvironmentUsage, type MergedUsage } from "@t3tools/shared/usageMerge";
import { useState, useMemo } from "react";

export interface EnvironmentUsageStatus {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly isPending: boolean;
  readonly canReadDiagnostics: boolean;
  readonly isConnected: boolean;
  readonly error: string | null;
  readonly summary: UsageSummary | null;
  readonly needsCursorKeychainAccess: boolean;
}

export interface UsageView {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly merged: MergedUsage;
  readonly isPending: boolean;
  readonly shown: {
    readonly window: UsageSummaryInput;
    readonly merged: MergedUsage;
  } | null;
  readonly isPartial: boolean;
  readonly refresh: (input?: UsageSummaryInput) => void;
}

// Generate realistic usage buckets across the last 90 days
function generateSampleBuckets(): UsageBucket[] {
  const buckets: UsageBucket[] = [];
  const providers: { provider: UsageProviderKind; models: string[]; dailyCostBase: number; tokenMultiplier: number }[] = [
    { provider: "codex", models: ["gpt-4o", "gpt-4o-mini", "o1-preview"], dailyCostBase: 14.5, tokenMultiplier: 62000000 },
    { provider: "opencode", models: ["claude-3-7-sonnet", "deepseek-coder"], dailyCostBase: 4.8, tokenMultiplier: 21000000 },
    { provider: "antigravity", models: ["gemini-2.5-pro", "gemini-2.5-flash"], dailyCostBase: 11.2, tokenMultiplier: 58000000 },
  ];

  const now = new Date();
  const endDate = new Date(now);
  const startDate = new Date(now.getTime() - 95 * 86400000);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().slice(0, 10);
    const day = UsageDay.make(dayStr);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const activityFactor = isWeekend ? 0.35 : 0.8 + Math.sin(d.getTime() / 86400000) * 0.35;

    for (const p of providers) {
      for (let i = 0; i < p.models.length; i++) {
        const model = p.models[i];
        const share = i === 0 ? 0.65 : i === 1 ? 0.25 : 0.10;
        const uncached = Math.round(p.tokenMultiplier * activityFactor * share * 0.45);
        const cached = Math.round(p.tokenMultiplier * activityFactor * share * 0.40);
        const output = Math.round(p.tokenMultiplier * activityFactor * share * 0.15);
        const reasoning = Math.round(output * 0.3);
        const cost = Number((p.dailyCostBase * activityFactor * share).toFixed(2));
        const savings = Number((cost * 0.22).toFixed(2));

        buckets.push({
          day,
          provider: p.provider,
          model,
          totals: {
            uncachedInputTokens: uncached,
            cachedInputTokens: cached,
            cacheCreationTokens: 0,
            outputTokens: output,
            reasoningTokens: reasoning,
          },
          costUsd: cost,
          cacheSavingsUsd: savings,
          categoryCostUsd: {
            input: Number((cost * 0.55).toFixed(2)),
            cacheRead: Number((cost * 0.10).toFixed(2)),
            cacheWrite: 0,
            output: Number((cost * 0.35).toFixed(2)),
          },
          costSource: "modelPriced",
          records: Math.round(15 * activityFactor * share) + 1,
          unpricedRecords: 0,
          sessions: Math.round(8 * activityFactor * share) + 1,
        });
      }
    }
  }

  // Generate hourly buckets for past 24 hours
  for (let h = 0; h < 24; h++) {
    const hourDate = new Date(now.getTime() - h * 3600000);
    const dayStr = hourDate.toISOString().slice(0, 10);
    const hourStart = hourDate.toISOString().slice(0, 13) + ":00:00Z";
    const day = UsageDay.make(dayStr);

    for (const p of providers) {
      const model = p.models[0];
      buckets.push({
        day,
        hourStart,
        provider: p.provider,
        model,
        totals: {
          uncachedInputTokens: 250000,
          cachedInputTokens: 180000,
          cacheCreationTokens: 0,
          outputTokens: 60000,
          reasoningTokens: 15000,
        },
        costUsd: Number((p.dailyCostBase / 24 * (0.5 + Math.random() * 0.8)).toFixed(2)),
        cacheSavingsUsd: 0.05,
        costSource: "modelPriced",
        records: 2,
        unpricedRecords: 0,
        sessions: 1,
      });
    }
  }

  return buckets;
}

const sampleBuckets = generateSampleBuckets();

const now = new Date();
const testEnvironmentId = EnvironmentId.make("primary-environment");
const environmentsList: readonly EnvironmentUsageStatus[] = [
  {
    environmentId: testEnvironmentId,
    label: "Local Workstation",
    isPending: false,
    canReadDiagnostics: true,
    isConnected: true,
    error: null,
    summary: {
      contractVersion: USAGE_CONTRACT_VERSION,
      readAt: now.toISOString(),
      sinceDay: UsageDay.make(new Date(now.getTime() - 95 * 86400000).toISOString().slice(0, 10)),
      untilDay: UsageDay.make(now.toISOString().slice(0, 10)),
      timeZone: "UTC",
      buckets: sampleBuckets,
      sources: [
        {
          fingerprint: {
            provider: "codex",
            resolvedHomePath: "/user/workspace",
            isConfigHome: false,
          },
          status: "ok",
          distinctSessions: 142,
          records: 1200,
          unpricedRecords: 0,
          bytes: 1048576,
        },
        {
          fingerprint: {
            provider: "opencode",
            resolvedHomePath: "/user/workspace",
            isConfigHome: false,
          },
          status: "ok",
          distinctSessions: 85,
          records: 750,
          unpricedRecords: 0,
          bytes: 524288,
        },
        {
          fingerprint: {
            provider: "antigravity",
            resolvedHomePath: "/user/workspace",
            isConfigHome: false,
          },
          status: "ok",
          distinctSessions: 110,
          records: 980,
          unpricedRecords: 0,
          bytes: 819200,
        },
      ],
      pricing: { status: "fresh", source: "tokex", fetchedAt: null, knownModels: 8 },
      scanDurationMs: 42,
    },
    needsCursorKeychainAccess: false,
  },
];

const envUsage: EnvironmentUsage = {
  environmentId: testEnvironmentId,
  label: "Local Workstation",
  summary: environmentsList[0].summary!,
};

export function mergeAnsweredUsage(
  environments: readonly EnvironmentUsageStatus[],
  keepBucket?: (bucket: UsageBucket) => boolean,
): MergedUsage {
  const answered: EnvironmentUsage[] = environments.flatMap(({ environmentId, label, summary }) =>
    summary === null
      ? []
      : [
          {
            environmentId,
            label,
            summary:
              keepBucket === undefined
                ? summary
                : { ...summary, buckets: summary.buckets.filter(keepBucket) },
          },
        ],
  );
  return mergeUsage(answered, USAGE_CONTRACT_VERSION);
}

function withoutProviders(
  environments: readonly EnvironmentUsageStatus[],
  hiddenProviders: ReadonlySet<UsageProviderKind>,
): readonly EnvironmentUsageStatus[] {
  if (hiddenProviders.size === 0) return environments;
  return environments.map((environment) =>
    environment.summary === null
      ? environment
      : {
          ...environment,
          summary: {
            ...environment.summary,
            buckets: environment.summary.buckets.filter(
              (bucket) => !hiddenProviders.has(bucket.provider),
            ),
            sources: environment.summary.sources.filter(
              (source) => !hiddenProviders.has(source.fingerprint.provider),
            ),
          },
        },
  );
}

function deriveSelection(
  environments: readonly EnvironmentUsageStatus[],
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null,
  hiddenProviders: ReadonlySet<UsageProviderKind>,
) {
  const selectedEnvironments =
    selectedEnvironmentIds === null
      ? environments
      : environments.filter((environment) => selectedEnvironmentIds.has(environment.environmentId));
  return {
    environments,
    selectedEnvironmentIds,
    hiddenProviders,
    selectedEnvironments,
    merged: mergeAnsweredUsage(withoutProviders(selectedEnvironments, hiddenProviders)),
  };
}

export function useUsage(
  input: UsageSummaryInput,
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null = null,
  hiddenProviders: ReadonlySet<UsageProviderKind> = new Set(),
): UsageView {
  const [refreshCount, setRefreshCount] = useState(0);

  const { selectedEnvironments, merged } = useMemo(() => {
    return deriveSelection(environmentsList, selectedEnvironmentIds, hiddenProviders);
  }, [selectedEnvironmentIds, hiddenProviders, refreshCount]);

  return {
    environments: environmentsList,
    selectedEnvironments,
    merged,
    isPending: false,
    shown: {
      window: input,
      merged,
    },
    isPartial: false,
    refresh: () => {
      setRefreshCount((c) => c + 1);
    },
  };
}
