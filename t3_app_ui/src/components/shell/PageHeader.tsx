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
    <header className="flex min-h-[80px] shrink-0 items-center justify-between gap-x-6 px-8 xl:px-10 py-4 [-webkit-app-region:drag]">
      <div className="flex min-w-0 shrink items-baseline gap-3">
        <h1 className="tm-display shrink-0 text-[34px] leading-none font-bold uppercase text-foreground">{title}</h1>
        {subtitle && (
          <div
            className="tm-label truncate whitespace-nowrap"
            title={typeof subtitle === 'string' ? subtitle : undefined}
          >
            {subtitle}
          </div>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">{children}</div>
      )}
    </header>
  );
}
