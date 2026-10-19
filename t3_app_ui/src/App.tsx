import React from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import './index.css';

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '~/components/ui/sidebar';
import { SidebarChromeHeader, SidebarUtilityMenu } from '~/components/sidebar/SidebarChrome';
import { SettingsSidebarNav } from '~/components/settings/SettingsSidebarNav';
import { UsagePage } from '~/components/usage/UsagePage';
import { WorkspacePageHeader } from '~/components/WorkspacePageHeader';
import { SettingsBreadcrumb } from '~/components/settings/SettingsBreadcrumb';
import { SettingsScopeProvider } from '~/components/settings/SettingsScopeContext';
import { ArrowLeftIcon } from 'lucide-react';

// Genuine untouched Settings Panels from T3 Code
import {
  GeneralSettingsPanel,
  AppearanceSettingsPanel,
  ArchivedThreadsPanel,
} from '~/components/settings/SettingsPanels';
import { StorageSettingsPanel } from '~/components/settings/StorageSettings';
import { OpenSourceLicensesPanel } from '~/components/settings/OpenSourceLicenses';
import { ProviderSettingsPanel } from '~/components/settings/ProviderSettingsPanel';
import { KeybindingsSettingsPanel } from '~/components/settings/KeybindingsSettings';
import { ProjectsSettings } from '~/components/settings/ProjectsSettings';
import { SourceControlSettingsPanel } from '~/components/settings/SourceControlSettings';
import { IntegrationsSettingsPanel } from '~/components/settings/IntegrationsSettings';
import { ConnectionsSettings } from '~/components/settings/ConnectionsSettings';
import { ScheduledTasksSettings } from '~/components/settings/ScheduledTasksSettings';
import { SnapShotSettings } from '~/components/settings/SnapShotSettings';
import { DiagnosticsSettingsPanel } from '~/components/settings/DiagnosticsSettings';

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const isSettings = location.pathname.startsWith('/settings') || searchParams.get('tab') === 'settings';
  const tabPath = searchParams.get('path');
  const activeSettingsPath = (location.pathname === '/settings' || location.pathname === '/settings/')
    ? (tabPath || '/settings/general')
    : (location.pathname.startsWith('/settings/') ? location.pathname : (tabPath || '/settings/general'));

  // Render the authentic settings panel for the selected path
  const renderSettingsPanel = () => {
    switch (activeSettingsPath) {
      case '/settings/general':
        return <GeneralSettingsPanel />;
      case '/settings/appearance':
        return <AppearanceSettingsPanel />;
      case '/settings/providers':
        return <ProviderSettingsPanel environmentId={"primary-environment" as any} projectIds={[]} scoped />;
      case '/settings/keybindings':
        return <KeybindingsSettingsPanel />;
      case '/settings/projects':
        return <ProjectsSettings />;
      case '/settings/source-control':
        return <SourceControlSettingsPanel />;
      case '/settings/integrations':
        return <IntegrationsSettingsPanel />;
      case '/settings/connections':
        return <ConnectionsSettings />;
      case '/settings/scheduled-tasks':
        return <ScheduledTasksSettings />;
      case '/settings/snap-shot':
        return <SnapShotSettings />;
      case '/settings/storage':
        return <StorageSettingsPanel />;
      case '/settings/diagnostics':
        return <DiagnosticsSettingsPanel />;
      case '/settings/archived':
        return <ArchivedThreadsPanel />;
      case '/settings/open-source-licenses':
        return <OpenSourceLicensesPanel />;
      default:
        return <GeneralSettingsPanel />;
    }
  };

  return (
    <SettingsScopeProvider
      search={{}}
      singleEnvironment={activeSettingsPath === '/settings/providers'}
      onChange={() => {}}
    >
      <SidebarProvider defaultOpen className="h-screen w-screen flex flex-row overflow-hidden bg-background text-foreground select-none">
        {/* Left Sidebar */}
        <Sidebar
          side="left"
          collapsible="offcanvas"
          data-app-sidebar=""
          role="navigation"
          aria-label={isSettings ? 'Settings' : 'Usage'}
          className="border-r border-border bg-sidebar shrink-0 flex flex-col"
        >
          <SidebarChromeHeader isElectron={false} />

          {isSettings ? (
            <>
              <SidebarContent className="p-0 overflow-y-auto">
                <SettingsSidebarNav
                  pathname={activeSettingsPath}
                />
              </SidebarContent>
              <SidebarFooter className="border-t border-border/50 p-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => navigate({ to: '/usage' })}
                      className="gap-2 font-medium text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <ArrowLeftIcon className="size-3.5" />
                      <span>Back to App</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarFooter>
            </>
          ) : (
            <>
              <SidebarContent className="p-2 overflow-y-auto">
                <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Workspace
                </div>
                <div className="p-2 text-xs text-muted-foreground">
                  T3 Code Active Session
                </div>
              </SidebarContent>
              <SidebarFooter className="border-t border-border/50 p-2">
                <SidebarUtilityMenu />
              </SidebarFooter>
            </>
          )}

          <SidebarRail />
        </Sidebar>

        {/* Main Content Area */}
        <SidebarInset className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
          {isSettings ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground overflow-hidden">
              <WorkspacePageHeader electron={false}>
                <SettingsBreadcrumb pathname={activeSettingsPath} />
              </WorkspacePageHeader>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {renderSettingsPanel()}
              </div>
            </div>
          ) : (
            <UsagePage />
          )}
        </SidebarInset>
      </SidebarProvider>
    </SettingsScopeProvider>
  );
}

export default App;
