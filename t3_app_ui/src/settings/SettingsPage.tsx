import React from 'react';
import { ScrollArea } from '~/components/ui/scroll-area';
import { PageHeader } from '../components/shell/PageHeader';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { WindowSettings } from './WindowSettings';
import { CollectionSettings } from './CollectionSettings';
import { SubscriptionsSettings } from './SubscriptionsSettings';
import { SyncSettings } from './SyncSettings';
import { LimitsSettings } from './LimitsSettings';
import { useTokenMonitorSettings } from './useSettings';

export function SettingsPage() {
  const { settings, updateSettings, refreshSettings } = useTokenMonitorSettings();

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[720px] flex-col gap-10 px-10 pt-2 pb-12 select-text">
          <GeneralSettings settings={settings} updateSettings={updateSettings} />
          <AppearanceSettings settings={settings} updateSettings={updateSettings} />
          <WindowSettings settings={settings} updateSettings={updateSettings} />
          <CollectionSettings settings={settings} updateSettings={updateSettings} />
          <SubscriptionsSettings settings={settings} updateSettings={updateSettings} refreshSettings={refreshSettings} />
          <SyncSettings settings={settings} updateSettings={updateSettings} refreshSettings={refreshSettings} />
          <div className="flex flex-col gap-3">
            <div className="px-1">
              <h2 className="tm-label !text-foreground">Accounts</h2>
              <p className="text-xs text-muted-foreground">Sign in to show live limits.</p>
            </div>
            <LimitsSettings settings={settings} updateSettings={updateSettings} refreshSettings={refreshSettings} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
