import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { SettingsNav, SETTINGS_NAV_ITEMS } from './SettingsNav';
import { GeneralSettings } from './GeneralSettings';
import { MainSettings } from './MainSettings';
import { WindowSettings } from './WindowSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { CollectionSettings } from './CollectionSettings';
import { LimitsSettings } from './LimitsSettings';
import { SubscriptionsSettings } from './SubscriptionsSettings';
import { SyncSettings } from './SyncSettings';
import { WindowControls } from './WindowControls';
import { useTokenMonitorSettings } from './useSettings';

interface SettingsLayoutProps {
  activePath: string;
  onNavigate: (path: string) => void;
  onBackToApp: () => void;
}

export function SettingsLayout({ activePath, onNavigate, onBackToApp }: SettingsLayoutProps) {
  const { settings, updateSettings, refreshSettings } = useTokenMonitorSettings();

  const activeItem = SETTINGS_NAV_ITEMS.find(
    (item) => item.path === activePath || (item.path === '/settings/general' && activePath === '/settings')
  ) || SETTINGS_NAV_ITEMS[0];

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-control]')) return;
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    (tm?.toggleMaximize || tm?.dashboard?.toggleMaximize)?.();
  };

  const renderActivePanel = () => {
    switch (activeItem.id) {
      case 'general':
        return <GeneralSettings settings={settings} updateSettings={updateSettings} />;
      case 'main':
        return <MainSettings settings={settings} updateSettings={updateSettings} />;
      case 'window':
        return <WindowSettings settings={settings} updateSettings={updateSettings} />;
      case 'appearance':
        return <AppearanceSettings settings={settings} updateSettings={updateSettings} />;
      case 'tools':
        return <CollectionSettings settings={settings} updateSettings={updateSettings} />;
      case 'limits':
        return (
          <LimitsSettings
            settings={settings}
            updateSettings={updateSettings}
            refreshSettings={refreshSettings}
          />
        );
      case 'subscriptions':
        return (
          <SubscriptionsSettings
            settings={settings}
            updateSettings={updateSettings}
            refreshSettings={refreshSettings}
          />
        );
      case 'sync':
        return (
          <SyncSettings
            settings={settings}
            updateSettings={updateSettings}
            refreshSettings={refreshSettings}
          />
        );
      default:
        return <GeneralSettings settings={settings} updateSettings={updateSettings} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar Navigation */}
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col justify-between">
        <div className="flex flex-col min-h-0 flex-1">
          {/* Draggable header area */}
          <div
            className="drag-region [-webkit-app-region:drag] h-9 flex items-center px-3 border-b border-border/40 select-none cursor-default"
            onDoubleClick={handleHeaderDoubleClick}
          >
            <span className="text-xs font-semibold text-foreground/80 tracking-wide [-webkit-app-region:no-drag]">
              Token Monitor
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            <SettingsNav activePath={activePath} onSelect={onNavigate} />
          </div>
        </div>

        <div className="border-t border-border/50 p-2">
          <button
            type="button"
            onClick={onBackToApp}
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer [-webkit-app-region:no-drag]"
          >
            <ArrowLeftIcon className="size-3.5" />
            <span>Back to App</span>
          </button>
        </div>
      </aside>

      {/* Main Settings Content Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        {/* Top Header Bar with Drag Region and Window Controls */}
        <header
          className="drag-region [-webkit-app-region:drag] h-9 border-b border-border flex items-center justify-between pl-4 pr-0 shrink-0 select-none"
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground [-webkit-app-region:no-drag]">
            <span>Settings</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="text-foreground font-semibold">{activeItem.label}</span>
          </div>

          <WindowControls />
        </header>

        {/* Scrollable Settings Panel */}
        <main className="flex-1 min-h-0 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
          {renderActivePanel()}
        </main>
      </div>
    </div>
  );
}
