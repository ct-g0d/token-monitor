import { type CSSProperties, memo } from "react";

import { providerInstanceInitials } from "@t3tools/client-runtime/state/provider-instance-display";

import { ProviderDriverKind } from "@t3tools/contracts";
import { AntigravityIcon, ClaudeAI, Icon, OpenAI } from "../Icons";
import { PROVIDER_ICON_CATALOG, getProviderIconComponent } from "../providerIcons";

import { cn } from "~/lib/utils";
import { providerClients } from "../settings/providerDriverMeta";
import { ProviderPackageIcon } from "./ProviderPackageIcon";
import {
  AcpRegistryAgentIcon,
  officialAcpRegistryIconUrlForAgentId,
  resolveOfficialAcpRegistryIconUrl,
} from "../settings/AcpRegistryIcon";

export const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> = {
  [ProviderDriverKind.make("codex")]: OpenAI,
  [ProviderDriverKind.make("claudeAgent")]: ClaudeAI,
  [ProviderDriverKind.make("claude")]: ClaudeAI,
  [ProviderDriverKind.make("antigravity")]: AntigravityIcon,
  ...Object.fromEntries(
    Object.entries(PROVIDER_ICON_CATALOG).map(([k, icon]) => [ProviderDriverKind.make(k), icon]),
  ),
};

const PROVIDER_TEXT_COLOR_BY_PROVIDER: Partial<Record<ProviderDriverKind, string>> = {
  [ProviderDriverKind.make("codex")]: "text-black dark:text-white",
  [ProviderDriverKind.make("claudeAgent")]: "text-[#d97757]",
  [ProviderDriverKind.make("claude")]: "text-[#d97757]",
  [ProviderDriverKind.make("antigravity")]: "text-[#5b87bf]",
  [ProviderDriverKind.make("deepseek")]: "text-[#4d6bfe]",
  [ProviderDriverKind.make("dsh")]: "text-[#4d6bfe]",
  [ProviderDriverKind.make("kimi")]: "text-[#1783FF]",
  [ProviderDriverKind.make("minimax")]: "text-[#ff647c]",
  [ProviderDriverKind.make("workbuddy")]: "text-[#0DC8A5]",
  [ProviderDriverKind.make("qoder")]: "text-[#2ADB5C]",
  [ProviderDriverKind.make("qodercn")]: "text-[#2ADB5C]",
  [ProviderDriverKind.make("volcengine")]: "text-[#006EFF]",
  [ProviderDriverKind.make("openrouter")]: "text-[#6566F1]",
  [ProviderDriverKind.make("cline")]: "text-[#9D4EDD]",
  [ProviderDriverKind.make("kiro")]: "text-[#9046FF]",
  [ProviderDriverKind.make("trae")]: "text-[#32F08C]",
  [ProviderDriverKind.make("alibaba")]: "text-[#615CED]",
  [ProviderDriverKind.make("commandcode")]: "text-[#8C4EDD]",
  [ProviderDriverKind.make("zed")]: "text-[#4173e7]",
};

export function providerTextColor(driverKind: ProviderDriverKind): {
  readonly className?: string;
  readonly style?: CSSProperties;
} {
  const icon = providerClients.get(driverKind)?.icon;
  if (icon) {
    return {
      className: "text-(--icon-light) dark:text-(--icon-dark)",
      style: { "--icon-light": icon.fill.light, "--icon-dark": icon.fill.dark } as CSSProperties,
    };
  }
  const normalizedKey = String(driverKind || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const className =
    PROVIDER_TEXT_COLOR_BY_PROVIDER[driverKind] ??
    PROVIDER_TEXT_COLOR_BY_PROVIDER[ProviderDriverKind.make(normalizedKey)];
  return className ? { className } : {};
}

export function resolveProviderInstanceAcpRegistryIconUrl(input: {
  readonly driverKind: ProviderDriverKind;
  readonly agentId?: string | undefined;
  readonly iconUrl?: string | undefined;
}): string | null {
  if (input.driverKind !== "acpRegistry") return null;
  return (
    resolveOfficialAcpRegistryIconUrl(input.iconUrl ?? null) ??
    officialAcpRegistryIconUrlForAgentId(input.agentId?.trim() || null)
  );
}

export const ProviderInstanceIcon = memo(function ProviderInstanceIcon(props: {
  driverKind: ProviderDriverKind;
  displayName: string;
  accentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  showBadge?: boolean;
  badgeContent?: "initials" | "none";
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
  statusDotClassName?: string;
  indicatorBackground?: string;
}) {
  const normalizedKey = String(props.driverKind || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const Icon =
    PROVIDER_ICON_BY_PROVIDER[props.driverKind] ??
    PROVIDER_ICON_BY_PROVIDER[ProviderDriverKind.make(normalizedKey)] ??
    getProviderIconComponent(normalizedKey) ??
    (normalizedKey === "claude" ? ClaudeAI : null);
  const packageIcon = providerClients.get(props.driverKind)?.icon;
  const indicatorBackground = props.indicatorBackground ?? "var(--card)";
  const accentStyle = props.accentColor
    ? ({ "--provider-accent": props.accentColor } as CSSProperties)
    : undefined;
  const badgeContent = props.badgeContent ?? "initials";
  const isAcpRegistry = props.driverKind === "acpRegistry";
  const acpRegistryIconUrl = resolveProviderInstanceAcpRegistryIconUrl({
    driverKind: props.driverKind,
    agentId: props.acpRegistryAgentId,
    iconUrl: props.acpRegistryIconUrl,
  });

  return (
    <span
      className={cn(
        "relative isolate z-30 inline-flex shrink-0 items-center justify-center overflow-visible",
        props.className,
      )}
      style={accentStyle}
      data-provider-accent-color={props.accentColor}
    >
      {isAcpRegistry ? (
        <AcpRegistryAgentIcon
          className={cn("size-5 rounded-none bg-transparent", props.iconClassName)}
          fallbackClassName="size-full"
          icon={acpRegistryIconUrl}
        />
      ) : packageIcon ? (
        <ProviderPackageIcon
          icon={packageIcon}
          className={cn("size-5 shrink-0", props.iconClassName)}
          aria-hidden
        />
      ) : Icon ? (
        <Icon className={cn("size-5 shrink-0", props.iconClassName)} aria-hidden />
      ) : (
        <span className={cn("text-3xs font-semibold leading-none", props.iconClassName)}>
          {providerInstanceInitials(props.displayName)}
        </span>
      )}
      {props.statusDotClassName ? (
        <span
          className={cn(
            "pointer-events-none absolute -left-0.5 -top-0.5 z-10 size-2 rounded-full",
            props.statusDotClassName,
          )}
          style={{ boxShadow: `0 0 0 2px ${indicatorBackground}` }}
          aria-hidden
        />
      ) : null}
      {props.showBadge ? (
        <span
          className={cn(
            "pointer-events-none absolute right-0 bottom-0 z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-0.5 text-4xs font-semibold leading-none shadow-sm",
            props.accentColor
              ? "bg-(--provider-accent) text-white"
              : "bg-card text-muted-foreground",
            props.badgeClassName,
          )}
          style={{ borderColor: indicatorBackground }}
          aria-hidden
        >
          {badgeContent === "initials" ? providerInstanceInitials(props.displayName) : null}
        </span>
      ) : null}
    </span>
  );
});
