import React, { useState } from 'react';
import { Spinner } from '~/components/ui/spinner';
import { Button } from '~/components/ui/button';
import { CopyIcon, CheckIcon, ExternalLinkIcon } from 'lucide-react';

export interface SignInPendingStateProps {
  message?: string | null | undefined;
  deviceCode?: {
    userCode?: string | undefined;
    verificationUri?: string | undefined;
  } | null | undefined;
  onCancel?: (() => void | Promise<any>) | undefined;
}

export function SignInPendingState({
  message,
  deviceCode,
  onCancel,
}: SignInPendingStateProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!deviceCode?.userCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const handleOpenBrowser = () => {
    const uri = deviceCode?.verificationUri;
    if (!uri) return;
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (tm?.openExternal) {
      tm.openExternal(uri);
    } else {
      window.open(uri, '_blank');
    }
  };

  if (deviceCode?.userCode) {
    return (
      <div className="flex flex-col gap-2.5 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Spinner size="xs" className="text-primary" />
            <span className="font-medium text-foreground">Device Authorization</span>
          </div>
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Enter code{' '}
          <code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
            {deviceCode.userCode}
          </code>{' '}
          in your browser to authorize access.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={handleCopyCode}
          >
            {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>

          {deviceCode.verificationUri && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={handleOpenBrowser}
            >
              <ExternalLinkIcon className="size-3.5" />
              Open browser
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner size="xs" className="text-primary" />
        <span>{message || 'Waiting for authentication...'}</span>
      </div>
      {onCancel && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
