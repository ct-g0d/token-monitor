import React, { useState } from 'react';
import type { ProviderAccounts } from '../../adapters/accountsState';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '~/components/ui/collapsible';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Switch } from '~/components/ui/switch';
import { ChevronRightIcon, Trash2Icon, KeyRoundIcon, UserIcon, ShieldAlertIcon } from 'lucide-react';
import { SignInPendingState } from './SignInPendingState';
import { CredentialDialog } from './CredentialDialog';
import { cn } from '~/lib/utils';
import { AntigravityIcon, ClaudeAI, OpenAI } from '~/components/Icons';

export interface ProviderAccountRowProps {
  provider: ProviderAccounts;
}

function getProviderIcon(providerId: string) {
  switch (providerId) {
    case 'codex':
      return <OpenAI className="size-4 text-black dark:text-white" />;
    case 'claude':
      return <ClaudeAI className="size-4 text-[#d97757]" />;
    case 'antigravity':
      return <AntigravityIcon className="size-4 text-[#5b87bf]" />;
    default:
      return <UserIcon className="size-4 text-muted-foreground" />;
  }
}

export function ProviderAccountRow({ provider }: ProviderAccountRowProps) {
  const [open, setOpen] = useState(false);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);

  const {
    providerId,
    label,
    authKind,
    status,
    accounts,
    pendingDetail,
    actions,
  } = provider;

  const isPending = status === 'pending' || Boolean(pendingDetail);
  const isConnected = status === 'connected';
  const hasAccounts = accounts.length > 0;

  // Render status badge
  const renderStatusBadge = () => {
    if (isPending) {
      return (
        <Badge variant="warning" size="sm">
          Pending
        </Badge>
      );
    }
    if (status === 'error') {
      return (
        <Badge variant="error" size="sm">
          Error
        </Badge>
      );
    }
    if (isConnected || hasAccounts) {
      return (
        <Badge variant="success" size="sm">
          Connected
        </Badge>
      );
    }
    return (
      <Badge variant="outline" size="sm">
        Not configured
      </Badge>
    );
  };

  // ONE primary action button based on authKind and status
  const renderPrimaryAction = () => {
    if (isPending) {
      return (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            actions.cancel?.();
          }}
        >
          Cancel
        </Button>
      );
    }

    if (authKind === 'oauth' || authKind === 'deviceCode') {
      if (isConnected || hasAccounts) {
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              if (actions.addAccount) {
                actions.addAccount();
              } else if (actions.signIn) {
                actions.signIn();
              }
            }}
          >
            Add account
          </Button>
        );
      }
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            actions.signIn?.();
          }}
        >
          Sign in
        </Button>
      );
    }

    // apiKey, cookie, token
    const isProfileProvider =
      providerId === 'opencode' ||
      providerId === 'openrouter' ||
      providerId === 'thirdparty';

    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          setCredentialDialogOpen(true);
        }}
      >
        {isProfileProvider ? 'Add profile' : isConnected ? 'Configure' : 'Configure'}
      </Button>
    );
  };

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="rounded-lg border border-border/60 bg-card/40 transition-colors hover:border-border/80"
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2">
          <CollapsibleTrigger className="flex flex-1 min-w-0 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
            <ChevronRightIcon
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
                open && 'rotate-90'
              )}
            />
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60">
              {getProviderIcon(providerId)}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {label}
              </span>
              {hasAccounts && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({accounts.length})
                </span>
              )}
            </div>
            <div className="shrink-0">{renderStatusBadge()}</div>
          </CollapsibleTrigger>

          <div className="flex shrink-0 items-center gap-2">
            {renderPrimaryAction()}
          </div>
        </div>

        <CollapsiblePanel>
          <div className="border-t border-border/40 bg-muted/10 px-4 py-3 space-y-2.5">
            {isPending && (
              <SignInPendingState
                message={pendingDetail?.message}
                deviceCode={pendingDetail?.deviceCode}
                onCancel={actions.cancel}
              />
            )}

            {hasAccounts ? (
              <div className="divide-y divide-border/30 rounded-md border border-border/40 bg-background/50">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {acc.isActive ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-xs"
                          title="Active account"
                        />
                      ) : (
                        <span className="size-2 shrink-0" />
                      )}
                      <span className="truncate text-xs font-medium text-foreground">
                        {acc.label}
                      </span>
                      {acc.realm && (
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="tm-label text-[10px]"
                        >
                          {acc.realm}
                        </Badge>
                      )}
                      {acc.detail && (
                        <span className="text-xs text-muted-foreground">
                          {acc.detail}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      {actions.setEnabled && (
                        <Switch
                          size="sm"
                          checked={acc.enabled}
                          onCheckedChange={(checked) =>
                            actions.setEnabled?.(acc.id, checked)
                          }
                          aria-label={`Enable or disable ${acc.label}`}
                        />
                      )}
                      {actions.remove && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => actions.remove?.(acc.id)}
                          aria-label={`Remove ${acc.label}`}
                          title="Remove account"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : !isPending ? (
              <div className="flex items-center justify-between py-1 text-xs text-muted-foreground">
                <span>No accounts connected yet.</span>
                {authKind !== 'oauth' && authKind !== 'deviceCode' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={() => setCredentialDialogOpen(true)}
                  >
                    <KeyRoundIcon className="size-3" />
                    Enter credentials
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </CollapsiblePanel>
      </Collapsible>

      <CredentialDialog
        open={credentialDialogOpen}
        provider={provider}
        onClose={() => setCredentialDialogOpen(false)}
      />
    </>
  );
}
