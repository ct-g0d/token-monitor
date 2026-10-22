import React, { useEffect, useState } from 'react';
import { MinusIcon, SquareIcon, CopyIcon, XIcon } from 'lucide-react';

export function WindowControls() {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    const checkState = async () => {
      try {
        const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
        if (tm?.isMaximized) {
          const max = await tm.isMaximized();
          setIsMax(Boolean(max));
        } else if (tm?.dashboard?.isMaximized) {
          const max = await tm.dashboard.isMaximized();
          setIsMax(Boolean(max));
        }
      } catch {
        // ignore
      }
    };

    checkState();

    // Listen to maximize events if available
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    let unsub: (() => void) | undefined;
    if (tm?.onMaximizeChange) {
      unsub = tm.onMaximizeChange((max: boolean) => {
        setIsMax(max);
      });
    }

    const handleWindowResize = () => {
      checkState();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (unsub) unsub();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  const handleMinimize = () => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (tm?.minimize) {
      tm.minimize();
    } else if (tm?.dashboard?.minimize) {
      tm.dashboard.minimize();
    }
  };

  const handleMaximize = () => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (tm?.toggleMaximize) {
      tm.toggleMaximize();
    } else if (tm?.dashboard?.toggleMaximize) {
      tm.dashboard.toggleMaximize();
    }
  };

  const handleClose = () => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (tm?.close) {
      tm.close();
    } else if (tm?.dashboard?.close) {
      tm.dashboard.close();
    }
  };

  return (
    <div className="flex items-center shrink-0 [-webkit-app-region:no-drag]">
      {/* Minimize */}
      <button
        type="button"
        title="Minimize"
        aria-label="Minimize"
        data-control="minimize"
        onClick={handleMinimize}
        className="inline-flex h-10 w-9 items-center justify-center text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer shrink-0 [-webkit-app-region:no-drag]"
      >
        <MinusIcon className="size-3.5" />
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        title={isMax ? 'Restore' : 'Maximize'}
        aria-label={isMax ? 'Restore' : 'Maximize'}
        data-control="maximize"
        onClick={handleMaximize}
        className="inline-flex h-10 w-9 items-center justify-center text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer shrink-0 [-webkit-app-region:no-drag]"
      >
        {isMax ? <CopyIcon className="size-3" /> : <SquareIcon className="size-3" />}
      </button>

      {/* Close */}
      <button
        type="button"
        title="Close"
        aria-label="Close"
        data-control="close"
        onClick={handleClose}
        className="inline-flex h-10 w-9 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer shrink-0 [-webkit-app-region:no-drag]"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
