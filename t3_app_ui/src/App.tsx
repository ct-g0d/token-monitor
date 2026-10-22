import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import './index.css';

import { UsagePage } from '~/components/usage/UsagePage';
import { SettingsLayout } from './settings/SettingsLayout';
import { WindowControls } from './settings/WindowControls';
import { SettingsScopeProvider } from '~/components/settings/SettingsScopeContext';
import {
  WorkspacePageHeader,
} from '~/components/WorkspacePageHeader';
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbText,
} from '~/components/WorkspaceBreadcrumb';
import { ToggleGroup, Toggle } from '~/components/ui/toggle-group';

import { SessionsView } from './views/SessionsView';
import { ProjectsView } from './views/ProjectsView';
import { TrendsView } from './views/TrendsView';
import { DevicesView } from './views/DevicesView';
import { ServiceStatusView } from './views/ServiceStatusView';

import {
  Settings as SettingsIcon,
  Activity,
  Layers,
  FolderGit2,
  TrendingUp,
  Laptop,
  Server,
  Zap,
} from 'lucide-react';

type MainView = 'usage' | 'sessions' | 'projects' | 'trends' | 'devices' | 'status';

function getSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.has(key)) return params.get(key);
  const hashIdx = window.location.hash.indexOf('?');
  if (hashIdx !== -1) {
    const hashParams = new URLSearchParams(window.location.hash.slice(hashIdx));
    if (hashParams.has(key)) return hashParams.get(key);
  }
  return null;
}

function getInitialView(): MainView {
  if (typeof window !== 'undefined') {
    const breakdown = (getSearchParam('breakdown') || '').toLowerCase();
    if (['session', 'sessions'].includes(breakdown)) return 'sessions';
    if (['project', 'projects'].includes(breakdown)) return 'projects';
    if (['trend', 'trends'].includes(breakdown)) return 'trends';
    if (['device', 'devices'].includes(breakdown)) return 'devices';
    if (breakdown === 'status') return 'status';
    if (['home', 'usage', 'limits'].includes(breakdown)) return 'usage';
  }
  return 'usage';
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));

  useEffect(() => {
    const handleHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const isSettings = location.pathname.startsWith('/settings') || hash.includes('/settings');
  const activeSettingsPath = isSettings
    ? (location.pathname.startsWith('/settings')
        ? location.pathname
        : (hash.replace(/^#/, '').split('?')[0] || '/settings/general'))
    : '/settings/general';

  const [activeView, setActiveView] = useState<MainView>(getInitialView);
  const [rateDisplay, setRateDisplay] = useState<{ rate: number; mode: 'second' | 'minute' }>({
    rate: 0,
    mode: 'second',
  });

  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Honour initial URL breakdown=limits
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const breakdown = (getSearchParam('breakdown') || '').toLowerCase();
      if (breakdown === 'limits' || breakdown === 'usage' || breakdown === 'home') {
        setActiveView('usage');
      } else if (['session', 'sessions'].includes(breakdown)) {
        setActiveView('sessions');
      } else if (['project', 'projects'].includes(breakdown)) {
        setActiveView('projects');
      } else if (['trend', 'trends'].includes(breakdown)) {
        setActiveView('trends');
      } else if (['device', 'devices'].includes(breakdown)) {
        setActiveView('devices');
      } else if (breakdown === 'status') {
        setActiveView('status');
      }
    }
  }, []);

  // Sync view state back to main process
  useEffect(() => {
    const breakdownMap: Record<MainView, string> = {
      usage: 'home',
      sessions: 'session',
      projects: 'project',
      trends: 'trends',
      devices: 'device',
      status: 'status',
    };
    if (typeof window !== 'undefined' && (window as any).tokenMonitor?.setViewState) {
      (window as any).tokenMonitor.setViewState({ breakdown: breakdownMap[activeView] || 'home' });
    }
  }, [activeView]);

  // Listen for view navigation events from main/tray
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).tokenMonitor?.onOpenView) {
      const unsub = (window as any).tokenMonitor.onOpenView((view: string) => {
        const target = view?.toLowerCase();
        navigate({ to: '/' });
        if (target === 'limits' || ['home', 'usage', 'tool', 'model'].includes(target)) {
          setActiveView('usage');
        } else if (['project', 'projects'].includes(target)) {
          setActiveView('projects');
        } else if (['session', 'sessions'].includes(target)) {
          setActiveView('sessions');
        } else if (['trend', 'trends'].includes(target)) {
          setActiveView('trends');
        } else if (['device', 'devices'].includes(target)) {
          setActiveView('devices');
        } else if (target === 'status') {
          setActiveView('status');
        }
      });
      return unsub;
    }
  }, [navigate]);

  // Listen for onOpenSettings event from main
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).tokenMonitor?.onOpenSettings) {
      const unsub = (window as any).tokenMonitor.onOpenSettings(() => {
        navigate({ to: '/settings/general' });
      });
      return unsub;
    }
  }, [navigate]);

  // Poll or listen for stream rate
  useEffect(() => {
    const updateRate = async () => {
      try {
        if (typeof window !== 'undefined' && window.tokenMonitor?.getStreamStatus) {
          const status = await window.tokenMonitor.getStreamStatus();
          if (status && typeof status.ratePerSecond === 'number') {
            setRateDisplay((prev) => ({
              ...prev,
              rate: prev.mode === 'minute' ? status.ratePerMinute || status.ratePerSecond * 60 : status.ratePerSecond,
            }));
          }
        }
      } catch {
        // ignore background poll errors
      }
    };

    updateRate();
    const interval = setInterval(updateRate, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleRateMode = () => {
    setRateDisplay((prev) => ({
      ...prev,
      mode: prev.mode === 'second' ? 'minute' : 'second',
    }));
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-tab], [data-control]')) {
      return;
    }
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (tm?.toggleMaximize) {
      tm.toggleMaximize();
    } else if (tm?.dashboard?.toggleMaximize) {
      tm.dashboard.toggleMaximize();
    }
  };

  const navItems = [
    { id: 'usage' as const, label: 'Usage', icon: Activity },
    { id: 'sessions' as const, label: 'Sessions', icon: Layers },
    { id: 'projects' as const, label: 'Projects', icon: FolderGit2 },
    { id: 'trends' as const, label: 'Trends', icon: TrendingUp },
    { id: 'devices' as const, label: 'Devices', icon: Laptop },
    { id: 'status' as const, label: 'Status', icon: Server },
  ];

  const isCompactNav = windowWidth < 960;
  const isVeryNarrow = windowWidth < 680;

  return (
    <SettingsScopeProvider search={{}} onChange={() => {}}>
      {isSettings ? (
        <SettingsLayout
          activePath={activeSettingsPath}
          onNavigate={(path) => navigate({ to: path })}
          onBackToApp={() => {
            if (typeof window !== 'undefined' && window.location.hash.includes('/settings')) {
              window.location.hash = '';
            }
            navigate({ to: '/' });
          }}
        />
      ) : (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground select-none">
          {/* T3 Genuine Desktop Page Header / Titlebar */}
          <WorkspacePageHeader
            electron
            reserveNativeControls={false}
            className="h-10 min-h-10 max-h-10 border-b border-border/30 bg-background/80 backdrop-blur-md pl-3 pr-0 flex items-center justify-between gap-1 select-none drag-region [-webkit-app-region:drag]"
            onDoubleClick={handleHeaderDoubleClick}
          >
            {/* Left: Breadcrumb */}
            <div className="flex items-center gap-1.5 shrink-0 [-webkit-app-region:no-drag]">
              <WorkspaceBreadcrumb ariaLabel="App navigation" className="shrink-0">
                <WorkspaceBreadcrumbItem className="shrink-0">
                  <WorkspaceBreadcrumbText className="font-bold text-xs tracking-tight text-foreground/90 shrink-0 whitespace-nowrap">
                    Token Monitor
                  </WorkspaceBreadcrumbText>
                </WorkspaceBreadcrumbItem>
                {!isVeryNarrow && (
                  <>
                    <span className="text-muted-foreground/40 text-xs shrink-0 select-none">/</span>
                    <WorkspaceBreadcrumbItem current className="shrink-0">
                      <WorkspaceBreadcrumbText className="text-xs font-semibold capitalize text-foreground shrink-0 whitespace-nowrap">
                        {activeView}
                      </WorkspaceBreadcrumbText>
                    </WorkspaceBreadcrumbItem>
                  </>
                )}
              </WorkspaceBreadcrumb>
            </div>

            {/* Center: Genuine T3 Segmented View Switcher */}
            <div className="flex items-center justify-center min-w-0 flex-1 px-1 [-webkit-app-region:no-drag]">
              <ToggleGroup
                aria-label="Token Monitor views"
                variant="segmented"
                value={[activeView]}
                onValueChange={(next) => {
                  const val = next[0] as MainView;
                  if (val) setActiveView(val);
                }}
                className="shrink-0"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Toggle
                      key={item.id}
                      value={item.id}
                      data-tab={item.id}
                      title={item.label}
                      aria-label={item.label}
                      className={`text-xs shrink-0 transition-all ${
                        isCompactNav ? 'px-2 py-1' : 'gap-1.5 px-2.5'
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      {!isCompactNav && <span>{item.label}</span>}
                    </Toggle>
                  );
                })}
              </ToggleGroup>
            </div>

            {/* Right: Live Rate Pill + Settings + Window Controls */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto pr-0 [-webkit-app-region:no-drag]">
              {/* Live Rate Pill */}
              <button
                type="button"
                onClick={toggleRateMode}
                title={`Click to switch between tok/s and TPM (Current: ${rateDisplay.mode === 'second' ? 'Tokens / sec' : 'Tokens / min'})`}
                className={`items-center rounded-full border border-border/40 bg-muted/30 hover:bg-muted/60 transition-colors font-mono text-muted-foreground cursor-pointer shrink-0 [-webkit-app-region:no-drag] ${
                  isVeryNarrow
                    ? 'hidden sm:inline-flex gap-1 px-1.5 py-0.5 text-[10px]'
                    : 'inline-flex gap-1.5 px-2 py-0.5 text-[11px]'
                }`}
              >
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <Zap className="size-3 text-amber-500 shrink-0" />
                <span>
                  {rateDisplay.rate > 0 ? rateDisplay.rate.toFixed(1) : '0.0'}{' '}
                  {!isVeryNarrow && (rateDisplay.mode === 'second' ? 'tok/s' : 'TPM')}
                </span>
              </button>

              {/* Settings Gear */}
              <button
                type="button"
                onClick={() => navigate({ to: '/settings/general' })}
                title="Settings"
                aria-label="Settings"
                data-control="settings"
                className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md transition-colors cursor-pointer shrink-0 [-webkit-app-region:no-drag]"
              >
                <SettingsIcon className="size-3.5" />
              </button>

              {/* Window Controls (Min / Max / Close) */}
              <WindowControls />
            </div>
          </WorkspacePageHeader>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden relative">
            {activeView === 'usage' && <UsagePage />}
            {activeView === 'sessions' && <SessionsView />}
            {activeView === 'projects' && <ProjectsView />}
            {activeView === 'trends' && <TrendsView />}
            {activeView === 'devices' && <DevicesView />}
            {activeView === 'status' && <ServiceStatusView />}
          </div>
        </div>
      )}
    </SettingsScopeProvider>
  );
}
