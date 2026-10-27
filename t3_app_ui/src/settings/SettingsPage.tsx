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

export function SettingsPage() {
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
    const handleOpenSection = (e: any) => {
      let section = e?.detail?.section;
      if (section === 'edge-dock' || section === 'hoverbar' || section === 'hover_bar') {
        section = 'hover-bar';
      }
      if (section && SETTINGS_SECTIONS.some(([id]) => id === section)) {
        jumpTo(section);
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

      const viewportRect = viewport.getBoundingClientRect();
      const triggerOffset = 120; // px threshold from viewport top
      let matchedSection: SectionId = SETTINGS_SECTIONS[0][0];

      for (const [id] of SETTINGS_SECTIONS) {
        const el = sectionRefs.current[id];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top - viewportRect.top <= triggerOffset) {
            matchedSection = id;
          }
        }
      }

      setActiveSection((prev) => (prev === matchedSection ? prev : matchedSection));
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
      if (isJumpingRef.current) {
        isJumpingRef.current = false;
        if (jumpTimerRef.current) {
          clearTimeout(jumpTimerRef.current);
          jumpTimerRef.current = null;
        }
      }
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        () => {
          handleScroll();
        },
        {
          root: viewport,
          rootMargin: '0px 0px -60% 0px',
          threshold: [0, 0.25, 0.5, 0.75, 1],
        }
      );

      for (const [id] of SETTINGS_SECTIONS) {
        const el = sectionRefs.current[id];
        if (el) {
          observer.observe(el);
        }
      }
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    viewport.addEventListener('wheel', handleUserInteraction, { passive: true });
    viewport.addEventListener('touchmove', handleUserInteraction, { passive: true });
    window.addEventListener('resize', handleScroll);

    // Initial check on mount
    handleScroll();

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
