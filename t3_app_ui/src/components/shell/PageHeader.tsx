import React from 'react';

// Page title with an optional subtitle; page controls sit on the right, on the title's baseline.
// When the window shrinks, controls stay stable on the intended row and subtitle truncates cleanly without colliding with native window controls.
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-tab], [data-control]')) {
      return;
    }
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    (tm?.toggleMaximize || tm?.dashboard?.toggleMaximize)?.();
  };

  return (
    <header
      className="flex min-h-[64px] sm:min-h-[72px] md:min-h-[80px] shrink-0 items-center justify-between gap-x-4 sm:gap-x-6 pl-4 sm:pl-6 md:pl-8 xl:pl-10 pr-36 xl:pr-40 py-2.5 sm:py-3.5 md:py-4 [-webkit-app-region:drag]"
      onDoubleClick={handleHeaderDoubleClick}
    >
      <div className="flex min-w-0 shrink items-baseline gap-2 sm:gap-3">
        <h1 className="tm-display shrink-0 text-[26px] sm:text-[30px] md:text-[34px] leading-none font-bold uppercase text-foreground">{title}</h1>
        {subtitle && (
          <div
            className="tm-label min-w-0 truncate whitespace-nowrap"
            title={typeof subtitle === 'string' ? subtitle : undefined}
          >
            {subtitle}
          </div>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 [-webkit-app-region:no-drag]">{children}</div>
      )}
    </header>
  );
}
