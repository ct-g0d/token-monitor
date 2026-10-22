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
