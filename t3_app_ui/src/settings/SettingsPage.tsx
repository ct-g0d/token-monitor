import React, { useRef, useState } from 'react';
import { ScrollArea } from '~/components/ui/scroll-area';
import { PageHeader } from '../components/shell/PageHeader';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { WindowSettings } from './WindowSettings';
import { CollectionSettings } from './CollectionSettings';
import { LimitsSettings } from './LimitsSettings';
import { useTokenMonitorSettings } from './useSettings';

const SETTINGS_SECTIONS = [
  ['general', 'General'],
  ['appearance', 'Appearance'],
  ['window', 'Window'],
  ['collection', 'Collection'],
  ['accounts', 'Accounts'],
] as const;

export function SettingsPage() {
  const { settings, updateSettings, refreshSettings, refreshCurrencyRates } = useTokenMonitorSettings();
  const [activeSection, setActiveSection] = useState<(typeof SETTINGS_SECTIONS)[number][0]>('general');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const jumpTo = (id: (typeof SETTINGS_SECTIONS)[number][0]) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-44 shrink-0 border-r border-border px-3 py-4 sm:block">
          <nav aria-label="Settings sections" className="sticky top-0 flex flex-col gap-1">
            {SETTINGS_SECTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => jumpTo(id)}
                className={`rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  activeSection === id
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex max-w-[720px] flex-col gap-10 px-6 pt-2 pb-12 sm:px-10 select-text">
            <section ref={(node) => { sectionRefs.current.general = node; }}>
              <GeneralSettings settings={settings} updateSettings={updateSettings} refreshCurrencyRates={refreshCurrencyRates} />
            </section>
            <section ref={(node) => { sectionRefs.current.appearance = node; }}>
              <AppearanceSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section ref={(node) => { sectionRefs.current.window = node; }}>
              <WindowSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section ref={(node) => { sectionRefs.current.collection = node; }}>
              <CollectionSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section ref={(node) => { sectionRefs.current.accounts = node; }} className="flex flex-col gap-3">
              <div className="px-1">
                <h2 className="tm-label !text-foreground">Accounts</h2>
                <p className="text-xs text-muted-foreground">Sign in to show live limits.</p>
              </div>
              <LimitsSettings settings={settings} updateSettings={updateSettings} refreshSettings={refreshSettings} />
            </section>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
