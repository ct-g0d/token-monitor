import React from 'react';

// Page title with an optional subtitle; page controls sit on the right, on the title's baseline
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-[80px] shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-8 xl:px-10 py-4 [-webkit-app-region:drag]">
      <div className="flex shrink-0 items-baseline gap-3">
        <h1 className="tm-display text-[34px] leading-none font-bold uppercase text-foreground">{title}</h1>
        {subtitle && <div className="tm-label whitespace-nowrap">{subtitle}</div>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 [-webkit-app-region:no-drag]">{children}</div>
      )}
    </header>
  );
}
