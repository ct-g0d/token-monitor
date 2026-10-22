import React from 'react';
import {
  Settings2Icon,
  LayoutDashboardIcon,
  AppWindowIcon,
  PaletteIcon,
  WrenchIcon,
  GaugeIcon,
  CreditCardIcon,
  CloudIcon,
} from 'lucide-react';
import { cn } from '~/lib/utils';

export interface SettingsNavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', path: '/settings/general', label: 'General', icon: Settings2Icon },
  { id: 'main', path: '/settings/main', label: 'Widget Layout & Metrics', icon: LayoutDashboardIcon },
  { id: 'window', path: '/settings/window', label: 'Window & Presence', icon: AppWindowIcon },
  { id: 'appearance', path: '/settings/appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'tools', path: '/settings/tools', label: 'Collection & Tools', icon: WrenchIcon },
  { id: 'limits', path: '/settings/limits', label: 'AI Limits & Accounts', icon: GaugeIcon },
  { id: 'subscriptions', path: '/settings/subscriptions', label: 'Subscriptions', icon: CreditCardIcon },
  { id: 'sync', path: '/settings/sync', label: 'Multi-device Sync', icon: CloudIcon },
];

interface SettingsNavProps {
  activePath: string;
  onSelect: (path: string) => void;
}

export function SettingsNav({ activePath, onSelect }: SettingsNavProps) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      <div className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        Settings
      </div>
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive = activePath === item.path || (item.path === '/settings/general' && activePath === '/settings');
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.path)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left w-full cursor-pointer',
              isActive
                ? 'bg-accent text-accent-foreground font-semibold shadow-xs/5'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <Icon className={cn('size-4 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
