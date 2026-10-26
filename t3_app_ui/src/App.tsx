import React, { useEffect, useState } from 'react';
import './index.css';

import { UsagePage } from '@/components/usage/UsagePage';
import { WindowControls } from './settings/WindowControls';
import { SettingsPage } from './settings/SettingsPage';
import { SettingsScopeProvider } from '~/components/settings/SettingsScopeContext';
import { Sidebar, type MainView } from './components/shell/Sidebar';
import { useTokenMonitorSettings } from './settings/useSettings';

import { ServiceStatusView } from './views/ServiceStatusView';

// Main-process view names (tray, last view state, URL `breakdown`) folded onto the active views
function viewFor(name: string | null | undefined): MainView {
  const target = String(name || '').toLowerCase();
  if (target === 'settings') return 'settings';
  if (target === 'limits') return 'limits';
  if (target === 'status') return 'status';
  return 'usage';
}

const BREAKDOWN: Record<MainView, string> = {
  usage: 'home',
  limits: 'limits',
  status: 'status',
  settings: 'home',
};

function getInitialView(): MainView {
  const { search, hash, pathname } = window.location;
  if (pathname.startsWith('/settings') || hash.includes('/settings')) return 'settings';
  const hashQuery = hash.indexOf('?');
  const params = new URLSearchParams(hashQuery === -1 ? search : hash.slice(hashQuery));
  return viewFor(params.get('breakdown'));
}

export function App() {
  const [activeView, setActiveView] = useState<MainView>(getInitialView);
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

  // View and settings requests from main/tray
  useEffect(() => {
    const offView = window.tokenMonitor?.onOpenView?.((view: string) => {
      const nextView = viewFor(view);
      if (nextView === 'limits') {
        setLimitsSeq((seq) => seq + 1);
      }
      setActiveView(nextView);
    });
    const offSettings = window.tokenMonitor?.onOpenSettings?.(() => setActiveView('settings'));
    return () => {
      offView?.();
      offSettings?.();
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
          {activeView === 'settings' && <SettingsPage />}
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
