import React, { useState } from 'react';
import type { ProviderAccounts } from '../../adapters/accountsState';
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { SearchIcon } from 'lucide-react';
import { getProviderIcon } from './ProviderAccountRow';

export interface AddProviderDialogProps {
  open: boolean;
  availableProviders: ProviderAccounts[];
  onClose: () => void;
  onSelectProvider: (provider: ProviderAccounts) => void;
}

export function AddProviderDialog({
  open,
  availableProviders,
  onClose,
  onSelectProvider,
}: AddProviderDialogProps) {
  const [search, setSearch] = useState('');

  const filtered = availableProviders.filter((p) =>
    p.label.toLowerCase().includes(search.toLowerCase()) ||
    p.providerId.toLowerCase().includes(search.toLowerCase())
  );

  const getAuthBadge = (authKind: string) => {
    switch (authKind) {
      case 'oauth':
        return <Badge variant="secondary" size="sm">OAuth</Badge>;
      case 'deviceCode':
        return <Badge variant="secondary" size="sm">Device Code</Badge>;
      case 'cookie':
        return <Badge variant="outline" size="sm">Web Cookie</Badge>;
      case 'apiKey':
        return <Badge variant="outline" size="sm">API Key</Badge>;
      case 'token':
        return <Badge variant="outline" size="sm">Token</Badge>;
      case 'local':
        return <Badge variant="secondary" size="sm">Local / Auto</Badge>;
      default:
        return <Badge variant="outline" size="sm">Credentials</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setSearch(''); onClose(); } }}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Add Provider
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select an AI provider to connect and monitor quota and rate limits.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3 pt-1">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs"
              autoFocus
            />
          </div>

          <div className="max-h-72 divide-y divide-border/30 overflow-y-auto rounded-md border border-border/40 bg-background/50">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No matching providers found
              </div>
            ) : (
              filtered.map((provider) => (
                <div
                  key={provider.providerId}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60">
                      {getProviderIcon(provider.providerId)}
                    </div>
                    <span className="truncate text-xs font-medium text-foreground">
                      {provider.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {getAuthBadge(provider.authKind)}
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        onSelectProvider(provider);
                      }}
                    >
                      {provider.authKind === 'oauth' || provider.authKind === 'deviceCode'
                        ? 'Sign in'
                        : 'Connect'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
