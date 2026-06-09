'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useI18n } from '@/hooks/use-i18n';

interface ConnectionStatusIndicatorProps {
  className?: string;
}

export function ConnectionStatusIndicator({
  className
}: ConnectionStatusIndicatorProps) {
  const { isOnline, isSocketConnected, hasSocket } = useConnectionStatus();
  const [manualReconnecting, setManualReconnecting] = useState(false);
  const { t } = useI18n('conversations');

  const isReconnecting =
    manualReconnecting || (isOnline && hasSocket && !isSocketConnected);

  const handleReconnect = () => {
    setManualReconnecting(true);
    meeshySocketIOService.reconnect();
    setTimeout(() => setManualReconnecting(false), 3000);
  };

  if (isOnline && isSocketConnected) {
    return null;
  }

  const label = isReconnecting ? t('reconnecting') : t('clickToReconnect');

  return (
    <button
      onClick={handleReconnect}
      aria-label={label}
      aria-live="polite"
      aria-busy={isReconnecting}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-[color,background-color,border-color,opacity] cursor-pointer hover:opacity-80",
        isReconnecting
          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
          : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30",
        className
      )}
      title={label}
    >
      {isReconnecting ? (
        <>
          <span className="animate-spin" aria-hidden="true">🟡</span>
          <span>{t('bubbleStream.reconnecting')}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">🔴</span>
          <span>{t('bubbleStream.reconnect')}</span>
        </>
      )}
    </button>
  );
}
