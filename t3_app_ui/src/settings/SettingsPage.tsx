import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '~/components/ui/scroll-area';
import { PageHeader } from '../components/shell/PageHeader';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { WindowSettings } from './WindowSettings';
import { HoverBarSettings } from './HoverBarSettings';
import { CollectionSettings } from './CollectionSettings';
import { LimitsSettings } from './LimitsSettings';
import { useTokenMonitorSettings, t } from './useSettings';

const SETTINGS_SECTIONS = [
  ['general', 'General', 'settings.general.title'],
  ['appearance', 'Appearance', 'settings.appearance.title'],
  ['window', 'Window', 'settings.window.title'],
  ['hover-bar', 'Hover Bar', 'settings.display.edgeDock'],
  ['collection', 'Collection', 'settings.collection.title'],
  ['accounts', 'Accounts', 'settings.accounts.title'],
] as const;

type SectionId = (typeof SETTINGS_SECTIONS)[number][0];

interface SettingsPageProps {
  initialSection?: SectionId | string | null;
  initialDetail?: any;
  onClearInitialSection?: () => void;
}

export function SettingsPage({ initialSection, initialDetail, onClearInitialSection }: SettingsPageProps = {}) {
  const { settings, updateSettings, refreshSettings, refreshCurrencyRates } = useTokenMonitorSettings();
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [, setLanguageSeq] = useState(0);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isJumpingRef = useRef(false);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onLangChange = () => setLanguageSeq((s) => s + 1);
    window.addEventListener('tokenmonitor:languagechange', onLangChange);
    return () => window.removeEventListener('tokenmonitor:languagechange', onLangChange);
  }, []);

  const getViewport = useCallback((): HTMLElement | null => {
    return (
      contentRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
      contentRef.current?.parentElement ??
      null
    );
  }, []);

  const jumpTo = useCallback((id: SectionId) => {
    setActiveSection(id);
    isJumpingRef.current = true;
    if (jumpTimerRef.current) {
      clearTimeout(jumpTimerRef.current);
    }
    jumpTimerRef.current = setTimeout(() => {
      isJumpingRef.current = false;
    }, 800);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (initialSection) {
      let sec = initialSection;
      if (sec === 'edge-dock' || sec === 'hoverbar' || sec === 'hover_bar') {
        sec = 'hover-bar';
      } else if (sec === 'limits') {
        sec = 'accounts';
      }
      if (SETTINGS_SECTIONS.some(([id]) => id === sec)) {
        const timer = setTimeout(() => {
          jumpTo(sec as SectionId);
          if (initialDetail) {
            window.dispatchEvent(new CustomEvent('tm-open-settings', { detail: initialDetail }));
          }
          onClearInitialSection?.();
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [initialSection, initialDetail, jumpTo, onClearInitialSection]);

  useEffect(() => {
    const handleOpenSection = (e: any) => {
      let section = e?.detail?.section;
      if (section === 'edge-dock' || section === 'hoverbar' || section === 'hover_bar') {
        section = 'hover-bar';
      } else if (section === 'limits') {
        section = 'accounts';
      }
      if (section && SETTINGS_SECTIONS.some(([id]) => id === section)) {
        jumpTo(section as SectionId);
      }
    };
    window.addEventListener('tm-open-settings', handleOpenSection);
    return () => window.removeEventListener('tm-open-settings', handleOpenSection);
  }, [jumpTo]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const updateActiveSection = () => {
      if (isJumpingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = viewport;

      // Bottom boundary: reached the end of the scroll container
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setActiveSection(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1][0]);
        return;
      }

      // Top boundary: near the top of the scroll container
      if (scrollTop <= 20) {
        setActiveSection(SETTINGS_SECTIONS[0][0]);
        return;
      }

      // Find section currently occupying the top region of viewport
      const viewportRect = viewport.getBoundingClientRect();
      const offsetTop = viewportRect.top;

      let current: SectionId = SETTINGS_SECTIONS[0][0];
      for (const [id] of SETTINGS_SECTIONS) {
        const el = sectionRefs.current[id];
        if (el) {
          const rect = el.getBoundingClientRect();
          // Offset by ~80px to account for header/padding
          if (rect.top - offsetTop <= 80) {
            current = id;
          }
        }
      }
      setActiveSection(current);
    };

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActiveSection();
      });
    };

    const handleUserInteraction = () => {
      // Cancel programmatic jump lock when user initiates manual wheel/touch
      if (isJumpingRef.current) {
        isJumpingRef.current = false;
        if (jumpTimerRef.current) {
          clearTimeout(jumpTimerRef.current);
          jumpTimerRef.current = null;
        }
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    viewport.addEventListener('wheel', handleUserInteraction, { passive: true });
    viewport.addEventListener('touchmove', handleUserInteraction, { passive: true });
    window.addEventListener('resize', handleScroll);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && contentRef.current) {
      observer = new ResizeObserver(() => {
        handleScroll();
      });
      observer.observe(contentRef.current);
    }

    // Initial check
    updateActiveSection();

    return () => {
      if (observer) {
        observer.disconnect();
      }
      viewport.removeEventListener('scroll', handleScroll);
      viewport.removeEventListener('wheel', handleUserInteraction);
      viewport.removeEventListener('touchmove', handleUserInteraction);
      window.removeEventListener('resize', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
    };
  }, [getViewport]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('settings.title') || 'Settings'} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-44 shrink-0 border-r border-border px-3 py-4 sm:block">
          <nav aria-label="Settings sections" className="sticky top-0 flex flex-col gap-1">
            {SETTINGS_SECTIONS.map(([id, defaultLabel, i18nKey]) => (
              <button
                key={id}
                type="button"
                onClick={() => jumpTo(id)}
                aria-current={activeSection === id ? 'true' : undefined}
                className={`rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  activeSection === id
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                {(i18nKey ? t(i18nKey) : null) || defaultLabel}
              </button>
            ))}
          </nav>
        </aside>
        <ScrollArea className="min-h-0 flex-1">
          <div ref={contentRef} className="flex max-w-[720px] flex-col gap-10 px-4 sm:px-6 md:px-8 xl:px-10 pt-2 pb-12 select-text">
            <section
              id="settings-section-general"
              data-section="general"
              ref={(node) => { sectionRefs.current.general = node; }}
            >
              <GeneralSettings settings={settings} updateSettings={updateSettings} refreshCurrencyRates={refreshCurrencyRates} />
            </section>
            <section
              id="settings-section-appearance"
              data-section="appearance"
              ref={(node) => { sectionRefs.current.appearance = node; }}
            >
              <AppearanceSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section
              id="settings-section-window"
              data-section="window"
              ref={(node) => { sectionRefs.current.window = node; }}
            >
              <WindowSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section
              id="settings-section-hover-bar"
              data-section="hover-bar"
              ref={(node) => { sectionRefs.current['hover-bar'] = node; }}
            >
              <HoverBarSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section
              id="settings-section-collection"
              data-section="collection"
              ref={(node) => { sectionRefs.current.collection = node; }}
            >
              <CollectionSettings settings={settings} updateSettings={updateSettings} />
            </section>
            <section
              id="settings-section-accounts"
              data-section="accounts"
              ref={(node) => { sectionRefs.current.accounts = node; }}
              className="flex flex-col gap-3"
            >
              <div className="px-1">
                <h2 className="tm-label !text-foreground">{t('settings.accounts.title') || 'Accounts'}</h2>
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
