import React, { useEffect, useState } from 'react';
import './index.css';

import { UsagePage } from '@/components/usage/UsagePage';
import { WindowControls } from './settings/WindowControls';
import { SettingsPage } from './settings/SettingsPage';
import { SettingsScopeProvider } from '~/components/settings/SettingsScopeContext';
import { Sidebar, type MainView } from './components/shell/Sidebar';
import { useTokenMonitorSettings } from './settings/useSettings';
import { ServiceStatusView } from './views/ServiceStatusView';

const BREAKDOWN: Record<MainView, string> = {
  usage: 'home',
  limits: 'limits',
  status: 'status',
  settings: 'settings',
};

function viewFor(name: string | null | undefined): MainView {
  const target = String(name || '').toLowerCase();
  if (target === 'settings') return 'settings';
  if (target === 'limits') return 'limits';
  if (target === 'status') return 'status';
  return 'usage';
}

function getInitialView(): MainView {
  if (typeof window === 'undefined') return 'usage';
  const { search, hash, pathname } = window.location;
  if (pathname.startsWith('/settings') || hash.includes('/settings')) return 'settings';
  const hashQuery = hash.indexOf('?');
  const params = new URLSearchParams(hashQuery === -1 ? search : hash.slice(hashQuery));
  return viewFor(params.get('breakdown'));
}

export function App() {
  const [activeView, setActiveView] = useState<MainView>(getInitialView);
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  const [settingsDetail, setSettingsDetail] = useState<any>(null);

  // Ensure persisted settings (language, theme, etc.) load and apply globally across the app
  useTokenMonitorSettings();

  const [limitsSeq, setLimitsSeq] = useState(0);

  const handleSelectView = (view: MainView) => {
    if (view === 'limits') {
      setLimitsSeq((seq) => seq + 1);
    }
    setActiveView(view);
  };

  // Sync view state back to main process
  useEffect(() => {
    window.tokenMonitor?.setViewState?.({ breakdown: BREAKDOWN[activeView] });
  }, [activeView]);

  // View and settings requests from main/tray and inter-component events
  useEffect(() => {
    const offView = window.tokenMonitor?.onOpenView?.((view: string) => {
      const nextView = viewFor(view);
      if (nextView === 'limits') {
        setLimitsSeq((seq) => seq + 1);
      }
      setActiveView(nextView);
    });

    const offSettings = window.tokenMonitor?.onOpenSettings?.((section?: string) => {
      let sec = section;
      if (sec === 'edge-dock' || sec === 'hoverbar' || sec === 'hover_bar') {
        sec = 'hover-bar';
      } else if (sec === 'limits') {
        sec = 'accounts';
      }
      setSettingsSection(sec || null);
      setActiveView('settings');
    });

    const handleOpenSettingsEvent = (e: any) => {
      let section = e?.detail?.section;
      if (section === 'edge-dock' || section === 'hoverbar' || section === 'hover_bar') {
        section = 'hover-bar';
      } else if (section === 'limits') {
        section = 'accounts';
      }
      setSettingsSection(section || 'general');
      setSettingsDetail(e?.detail || null);
      setActiveView('settings');
    };
    window.addEventListener('tm-open-settings', handleOpenSettingsEvent);

    return () => {
      offView?.();
      offSettings?.();
      window.removeEventListener('tm-open-settings', handleOpenSettingsEvent);
    };
  }, []);

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-tab], [data-control]')) {
      return;
    }
    const tm = window.tokenMonitor;
    (tm?.toggleMaximize || tm?.dashboard?.toggleMaximize)?.();
  };

  return (
    <SettingsScopeProvider search={{}} onChange={() => {}}>
      <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground select-none">
        <Sidebar active={activeView} onSelect={handleSelectView} />

        <main key={activeView} className="tm-view-in absolute inset-y-0 right-0 left-16 md:left-[216px] flex flex-col overflow-hidden transition-[left] duration-150">
          {(activeView === 'usage' || activeView === 'limits') && (
            <UsagePage
              key={activeView === 'limits' ? `limits-${limitsSeq}` : 'usage'}
              mode={activeView}
            />
          )}
          {activeView === 'status' && <ServiceStatusView />}
          {activeView === 'settings' && (
            <SettingsPage
              initialSection={settingsSection}
              initialDetail={settingsDetail}
              onClearInitialSection={() => {
                setSettingsSection(null);
                setSettingsDetail(null);
              }}
            />
          )}
        </main>

        {/* Window controls own the top-right corner.
            Must stay last: Chromium applies drag regions in DOM order, so a page's drag
            header rendered later would override this overlay's no-drag buttons. */}
        <div
          className="absolute top-0 right-0 z-30 flex h-10 justify-end [-webkit-app-region:drag]"
          onDoubleClick={handleHeaderDoubleClick}
        >
          <WindowControls />
        </div>
      </div>
    </SettingsScopeProvider>
  );
}
