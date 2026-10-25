import { ProviderDriverKind } from "@t3tools/contracts";

export interface UsageProviderPresentation {
  readonly label: string;
  readonly color: string;
  readonly driverKind: ProviderDriverKind;
}

const KNOWN_PROVIDERS: Record<string, UsageProviderPresentation> = {
  codex: {
    label: "Codex",
    color: "#10a37f",
    driverKind: ProviderDriverKind.make("codex"),
  },
  claude: {
    label: "Claude Code",
    color: "#d97757",
    driverKind: ProviderDriverKind.make("claudeAgent"),
  },
  grok: {
    label: "Grok Build",
    color: "#1d9bf0",
    driverKind: ProviderDriverKind.make("grok"),
  },
  cursor: {
    label: "Cursor",
    color: "#8b8b8b",
    driverKind: ProviderDriverKind.make("cursor"),
  },
  opencode: {
    label: "OpenCode",
    color: "#5b9bbd",
    driverKind: ProviderDriverKind.make("opencode"),
  },
  antigravity: {
    label: "Antigravity",
    color: "#8c7bd1",
    driverKind: ProviderDriverKind.make("antigravity"),
  },
  pi: {
    label: "Pi",
    color: "#4d9f8a",
    driverKind: ProviderDriverKind.make("pi"),
  },
  kimi: {
    label: "Kimi",
    color: "#00b4db",
    driverKind: ProviderDriverKind.make("kimi"),
  },
  deepseek: {
    label: "DeepSeek",
    color: "#4d6bfe",
    driverKind: ProviderDriverKind.make("deepseek"),
  },
  minimax: {
    label: "MiniMax",
    color: "#ff647c",
    driverKind: ProviderDriverKind.make("minimax"),
  },
  mimo: {
    label: "Mimo",
    color: "#00c49f",
    driverKind: ProviderDriverKind.make("mimo"),
  },
  copilot: {
    label: "Copilot",
    color: "#5c6bc0",
    driverKind: ProviderDriverKind.make("copilot"),
  },
  cline: {
    label: "Cline",
    color: "#38bdf8",
    driverKind: ProviderDriverKind.make("cline"),
  },
  factory: {
    label: "Factory Droid",
    color: "#f59e0b",
    driverKind: ProviderDriverKind.make("factory"),
  },
  droid: {
    label: "Droid",
    color: "#f59e0b",
    driverKind: ProviderDriverKind.make("droid"),
  },
  zai: {
    label: "Z.ai GLM",
    color: "#ff7849",
    driverKind: ProviderDriverKind.make("zai"),
  },
  zaiteam: {
    label: "Z.ai Team",
    color: "#ff5722",
    driverKind: ProviderDriverKind.make("zaiteam"),
  },
  qoder: {
    label: "Qoder",
    color: "#9333ea",
    driverKind: ProviderDriverKind.make("qoder"),
  },
  qodercn: {
    label: "Qoder CN",
    color: "#a855f7",
    driverKind: ProviderDriverKind.make("qodercn"),
  },
  volcengine: {
    label: "Volcengine Ark",
    color: "#0ea5e9",
    driverKind: ProviderDriverKind.make("volcengine"),
  },
  openrouter: {
    label: "OpenRouter",
    color: "#6366f1",
    driverKind: ProviderDriverKind.make("openrouter"),
  },
  ollama: {
    label: "Ollama",
    color: "#14b8a6",
    driverKind: ProviderDriverKind.make("ollama"),
  },
  zed: {
    label: "Zed",
    color: "#eab308",
    driverKind: ProviderDriverKind.make("zed"),
  },
  devin: {
    label: "Devin",
    color: "#06b6d4",
    driverKind: ProviderDriverKind.make("devin"),
  },
  workbuddy: {
    label: "Workbuddy",
    color: "#ec4899",
    driverKind: ProviderDriverKind.make("workbuddy"),
  },
  kiro: {
    label: "Kiro",
    color: "#84cc16",
    driverKind: ProviderDriverKind.make("kiro"),
  },
  trae: {
    label: "Trae",
    color: "#3b82f6",
    driverKind: ProviderDriverKind.make("trae"),
  },
  alibaba: {
    label: "Alibaba Cloud",
    color: "#f97316",
    driverKind: ProviderDriverKind.make("alibaba"),
  },
  stepfun: {
    label: "StepFun",
    color: "#0284c7",
    driverKind: ProviderDriverKind.make("stepfun"),
  },
  thirdparty: {
    label: "Third-Party APIs",
    color: "#64748b",
    driverKind: ProviderDriverKind.make("thirdparty"),
  },
  commandcode: {
    label: "CommandCode",
    color: "#8c4edd",
    driverKind: ProviderDriverKind.make("commandcode"),
  },
  notion: {
    label: "Notion",
    color: "#000000",
    driverKind: ProviderDriverKind.make("notion"),
  },
  typesafe: {
    label: "TypeSafe",
    color: "#3b82f6",
    driverKind: ProviderDriverKind.make("typesafe"),
  },
  mistral: {
    label: "Mistral",
    color: "#ea580c",
    driverKind: ProviderDriverKind.make("mistral"),
  },
  groq: {
    label: "Groq",
    color: "#f55036",
    driverKind: ProviderDriverKind.make("groq"),
  },
  cerebras: {
    label: "Cerebras",
    color: "#ff6f00",
    driverKind: ProviderDriverKind.make("cerebras"),
  },
  github: {
    label: "GitHub",
    color: "#24292f",
    driverKind: ProviderDriverKind.make("github"),
  },
  gitlab: {
    label: "GitLab",
    color: "#e24329",
    driverKind: ProviderDriverKind.make("gitlab"),
  },
  azure: {
    label: "Azure DevOps",
    color: "#0078d7",
    driverKind: ProviderDriverKind.make("azure"),
  },
  bitbucket: {
    label: "Bitbucket",
    color: "#0052cc",
    driverKind: ProviderDriverKind.make("bitbucket"),
  },
  forgejo: {
    label: "Forgejo",
    color: "#ff6600",
    driverKind: ProviderDriverKind.make("forgejo"),
  },
  gitcafe: {
    label: "GitCafe",
    color: "#a78bfa",
    driverKind: ProviderDriverKind.make("gitcafe"),
  },
  dsh: {
    label: "DeepSeek Hardware",
    color: "#4d6bfe",
    driverKind: ProviderDriverKind.make("dsh"),
  },
  vertex: {
    label: "Vertex AI",
    color: "#4285f4",
    driverKind: ProviderDriverKind.make("vertex"),
  },
  bedrock: {
    label: "AWS Bedrock",
    color: "#ff9900",
    driverKind: ProviderDriverKind.make("bedrock"),
  },
  gemini: {
    label: "Google Gemini",
    color: "#1a73e8",
    driverKind: ProviderDriverKind.make("gemini"),
  },
  cohere: {
    label: "Cohere",
    color: "#39594d",
    driverKind: ProviderDriverKind.make("cohere"),
  },
  together: {
    label: "Together AI",
    color: "#0f6fff",
    driverKind: ProviderDriverKind.make("together"),
  },
  hyperbolic: {
    label: "Hyperbolic",
    color: "#26b5ce",
    driverKind: ProviderDriverKind.make("hyperbolic"),
  },
  sambanova: {
    label: "SambaNova",
    color: "#f58220",
    driverKind: ProviderDriverKind.make("sambanova"),
  },
  fireworks: {
    label: "Fireworks AI",
    color: "#ff4f00",
    driverKind: ProviderDriverKind.make("fireworks"),
  },
  perplexity: {
    label: "Perplexity",
    color: "#20808d",
    driverKind: ProviderDriverKind.make("perplexity"),
  },
  ai21: {
    label: "AI21 Labs",
    color: "#7142cf",
    driverKind: ProviderDriverKind.make("ai21"),
  },
  replicate: {
    label: "Replicate",
    color: "#000000",
    driverKind: ProviderDriverKind.make("replicate"),
  },
  upstage: {
    label: "Upstage",
    color: "#6528f7",
    driverKind: ProviderDriverKind.make("upstage"),
  },
  vllm: {
    label: "vLLM",
    color: "#5865f2",
    driverKind: ProviderDriverKind.make("vllm"),
  },
  lmstudio: {
    label: "LM Studio",
    color: "#3b82f6",
    driverKind: ProviderDriverKind.make("lmstudio"),
  },
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateDynamicPresentation(providerId: string): UsageProviderPresentation {
  const normalized = String(providerId || "unknown").trim();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const hash = hashString(normalized);
  const hue = hash % 360;
  const color = `hsl(${hue}, 65%, 55%)`;
  return {
    label,
    color,
    driverKind: ProviderDriverKind.make(normalized.replace(/[^a-zA-Z0-9_-]/g, "") || "generic"),
  };
}

export function getProviderPresentation(providerId: string): UsageProviderPresentation {
  const key = String(providerId || "").trim().toLowerCase();
  return KNOWN_PROVIDERS[key] || generateDynamicPresentation(key);
}

export const PROVIDER_PRESENTATION: Record<string, UsageProviderPresentation> = new Proxy(KNOWN_PROVIDERS, {
  get(target, prop: string) {
    if (typeof prop !== "string") return undefined;
    const key = prop.toLowerCase();
    if (key === "claude" || key === "claudeagent") return target.claude;
    if (key in target) {
      return target[key];
    }
    return generateDynamicPresentation(prop);
  },
});

export const PROVIDER_ORDER = Object.keys(KNOWN_PROVIDERS);

export function providersWithUsage(
  totals: readonly {
    readonly provider: string;
    readonly costUsd: number;
    readonly totalTokens: number;
  }[],
): readonly string[] {
  const active = new Set(
    totals
      .filter((entry) => entry.totalTokens > 0 || entry.costUsd > 0)
      .map((entry) => entry.provider),
  );
  const ordered: string[] = [];
  for (const p of PROVIDER_ORDER) {
    if (active.has(p)) {
      ordered.push(p);
      active.delete(p);
    }
  }
  // Include any custom or uncatalogued active providers
  for (const remaining of active) {
    ordered.push(remaining);
  }
  return ordered;
}

export function normalizeProviderKey(providerOrDriver: string): string {
  const norm = String(providerOrDriver || "").trim().toLowerCase();
  if (norm === "claudeagent") return "claude";
  return norm;
}

export function getSelectableProviders(options: {
  readonly mode: "usage" | "limits";
  readonly presentations?: Iterable<any> | null;
  readonly stats?: any;
  readonly merged?: any;
  readonly windowSessions?: any;
  readonly hiddenProviders?: ReadonlySet<string> | null;
}): readonly string[] {
  const isLimits = options.mode === "limits";
  const signedInProviders = new Set<string>();
  const limitRecordProviders = new Set<string>();
  const usageRecordProviders = new Set<string>();

  // 1. Inspect presentations (serverConfig.providers & usageLimitSources)
  if (options.presentations) {
    for (const presentation of options.presentations) {
      if (!presentation) continue;
      const providers = presentation?.serverConfig?.providers ?? [];
      for (const p of providers) {
        if (!p) continue;
        const key = normalizeProviderKey(p.driver);
        const isUnconfigured =
          p.status === "notConfigured" || p.auth?.status === "unauthenticated";
        const hasEmail = Boolean(p.auth?.email && String(p.auth.email).trim());
        const isAuthenticated = p.auth?.status === "authenticated";

        if (!isUnconfigured && (hasEmail || isAuthenticated)) {
          signedInProviders.add(key);
        }

        const hasWindows = Array.isArray(p.usageLimits?.windows) && p.usageLimits.windows.length > 0;
        const hasResetCredits = Boolean(
          p.usageLimits?.resetCredits &&
            typeof p.usageLimits.resetCredits.availableCount === "number",
        );
        const hasBalance = Boolean(
          p.usageLimits &&
            (typeof p.usageLimits.balance?.amount === "number" ||
              typeof p.usageLimits.balanceUsd === "number"),
        );
        const hasExternalUsage = Boolean(p.usageLimits?.externalUsage);
        if (hasWindows || hasResetCredits || hasBalance || hasExternalUsage) {
          limitRecordProviders.add(key);
        }
      }

      const sources = presentation?.serverConfig?.usageLimitSources ?? [];
      for (const source of sources) {
        for (const account of source?.accounts ?? []) {
          if (!account) continue;
          const key = normalizeProviderKey(account.driver);
          signedInProviders.add(key);
          const hasWindows =
            Array.isArray(account.usageLimits?.windows) && account.usageLimits.windows.length > 0;
          const hasResetCredits = Boolean(
            account.usageLimits?.resetCredits &&
              typeof account.usageLimits.resetCredits.availableCount === "number",
          );
          const hasBalance = Boolean(
            account.usageLimits &&
              (typeof account.usageLimits.balance?.amount === "number" ||
                typeof account.usageLimits.balanceUsd === "number"),
          );
          if (hasWindows || hasResetCredits || hasBalance) {
            limitRecordProviders.add(key);
          }
        }
      }
    }
  }

  // 2. Inspect stats.limits
  const statsLimits = options.stats?.limits;
  if (statsLimits) {
    const rawProviders = Array.isArray(statsLimits.providers)
      ? statsLimits.providers
      : Array.isArray(statsLimits)
        ? statsLimits
        : [];
    for (const lp of rawProviders) {
      if (!lp) continue;
      const key = normalizeProviderKey(lp.provider);
      const isUnconfigured = lp.status === "notConfigured" || lp.status === "unsupported";
      const hasAccountInfo = Boolean(lp.accountKey || lp.email || lp.accountEmail);
      const accountsList = Array.isArray(lp.accounts) ? lp.accounts : [];
      const hasAccounts = accountsList.some(
        (acc: any) =>
          acc &&
          acc.status !== "notConfigured" &&
          Boolean(acc.email || acc.accountEmail || acc.accountKey),
      );
      if (!isUnconfigured && (hasAccountInfo || hasAccounts)) {
        signedInProviders.add(key);
      }

      const hasWindows = Array.isArray(lp.windows) && lp.windows.length > 0;
      const hasBalance =
        typeof lp.balance === "number" ||
        typeof lp.balance?.amount === "number" ||
        typeof lp.balanceUsd === "number";
      const hasResetCredits = Boolean(
        lp.resetCredits && typeof lp.resetCredits.availableCount === "number",
      );
      const hasAccountsWithLimits = accountsList.some(
        (acc: any) =>
          acc &&
          ((Array.isArray(acc.windows) && acc.windows.length > 0) ||
            typeof acc.balance === "number" ||
            typeof acc.balanceUsd === "number"),
      );
      if (!isUnconfigured && (hasWindows || hasBalance || hasResetCredits || hasAccountsWithLimits)) {
        limitRecordProviders.add(key);
      }
    }
  }

  // 3. Inspect usage records
  if (options.merged?.providers && Array.isArray(options.merged.providers)) {
    for (const entry of options.merged.providers) {
      if (
        Number(entry.totalTokens || 0) > 0 ||
        Number(entry.costUsd || 0) > 0 ||
        Number(entry.records || 0) > 0 ||
        Number(entry.sessions || 0) > 0
      ) {
        usageRecordProviders.add(normalizeProviderKey(entry.provider));
      }
    }
  }

  const periods = options.stats?.periods;
  if (periods) {
    for (const periodKey of ["today", "month", "allTime"] as const) {
      const p = periods[periodKey];
      if (!p) continue;
      if (p.clients && typeof p.clients === "object") {
        for (const [client, val] of Object.entries(p.clients)) {
          if (typeof val === "number" && val > 0) {
            usageRecordProviders.add(normalizeProviderKey(client));
          } else if (
            val &&
            typeof val === "object" &&
            (Number((val as any).tokens || 0) > 0 || Number((val as any).cost || 0) > 0)
          ) {
            usageRecordProviders.add(normalizeProviderKey(client));
          }
        }
      }
      if (p.clientTokens && typeof p.clientTokens === "object") {
        for (const [client, tokens] of Object.entries(p.clientTokens)) {
          if (Number(tokens || 0) > 0) {
            usageRecordProviders.add(normalizeProviderKey(client));
          }
        }
      }
      if (p.clientCosts && typeof p.clientCosts === "object") {
        for (const [client, cost] of Object.entries(p.clientCosts)) {
          if (Number(cost || 0) > 0) {
            usageRecordProviders.add(normalizeProviderKey(client));
          }
        }
      }
      if (p.sessions && typeof p.sessions === "object") {
        for (const [client, count] of Object.entries(p.sessions)) {
          if (client !== "total" && Number(count || 0) > 0) {
            usageRecordProviders.add(normalizeProviderKey(client));
          }
        }
      }
    }
  }

  if (options.stats?.sessionsByWindow && typeof options.stats.sessionsByWindow === "object") {
    for (const winObj of Object.values(options.stats.sessionsByWindow)) {
      if (winObj && typeof winObj === "object") {
        for (const [client, count] of Object.entries(winObj as Record<string, any>)) {
          if (client !== "total" && Number(count || 0) > 0) {
            usageRecordProviders.add(normalizeProviderKey(client));
          }
        }
      }
    }
  }

  if (options.windowSessions && typeof options.windowSessions === "object") {
    for (const [client, count] of Object.entries(options.windowSessions)) {
      if (client !== "total" && Number(count || 0) > 0) {
        usageRecordProviders.add(normalizeProviderKey(client));
      }
    }
  }

  const selectableSet = new Set<string>();
  for (const provider of PROVIDER_ORDER) {
    const norm = normalizeProviderKey(provider);
    const hasAccount = signedInProviders.has(norm);
    const hasLimit = limitRecordProviders.has(norm);
    const hasUsage = usageRecordProviders.has(norm);

    if (isLimits) {
      if (hasAccount || hasLimit) {
        selectableSet.add(provider);
      }
    } else {
      if (hasAccount || hasUsage || hasLimit) {
        selectableSet.add(provider);
      }
    }
  }

  // Also include any extra active providers not in PROVIDER_ORDER
  const allExtra = new Set([
    ...signedInProviders,
    ...limitRecordProviders,
    ...(isLimits ? [] : usageRecordProviders),
  ]);
  for (const p of allExtra) {
    if (p && !selectableSet.has(p)) {
      selectableSet.add(p);
    }
  }

  // Prevent filter lockout: preserve any provider currently hidden that has records or was known
  if (options.hiddenProviders) {
    for (const p of options.hiddenProviders) {
      const norm = normalizeProviderKey(p);
      if (signedInProviders.has(norm) || limitRecordProviders.has(norm) || usageRecordProviders.has(norm)) {
        selectableSet.add(p);
      }
    }
  }

  return [
    ...PROVIDER_ORDER.filter((p) => selectableSet.has(p)),
    ...Array.from(selectableSet).filter((p) => !PROVIDER_ORDER.includes(p)),
  ];
}
