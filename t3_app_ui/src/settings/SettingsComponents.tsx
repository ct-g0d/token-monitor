import React, { type ReactNode } from 'react';
import { SettingsGroup } from '~/components/settings/SettingsGroup';
import { cn } from '~/lib/utils';

export interface SettingRowProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SettingRow({
  id,
  title,
  description,
  status,
  control,
  children,
  className,
}: SettingRowProps) {
  return (
    <div
      id={id}
      data-slot="settings-row"
      className={cn(
        '@container/settings-row rounded-xl px-3 sm:px-4',
        children ? 'pt-3 pb-2' : 'py-3',
        className
      )}
    >
      <div className="flex flex-col gap-3 @min-[32rem]/settings-row:grid @min-[32rem]/settings-row:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] @min-[32rem]/settings-row:items-center @min-[32rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
          </div>
          {description && (
            <p className="max-w-xl text-xs leading-normal text-muted-foreground/80">
              {description}
            </p>
          )}
          {status && (
            <div className="pt-0.5 text-xs text-muted-foreground">{status}</div>
          )}
        </div>
        {control && (
          <div className="flex w-full min-w-0 shrink-0 items-center gap-2 @min-[32rem]/settings-row:w-auto @min-[32rem]/settings-row:justify-end">
            {control}
          </div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export interface SettingSectionProps {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingSection({
  id,
  title,
  description,
  headerAction,
  children,
  className,
}: SettingSectionProps) {
  return (
    <section id={id} className={cn('space-y-2', className)}>
      {(title || description || headerAction) && (
        <div className="flex items-center justify-between gap-4 px-1 pb-1">
          <div className="space-y-0.5">
            {title && <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <SettingsGroup variant="grouped" divided>
        {children}
      </SettingsGroup>
    </section>
  );
}
