import { useEffect, useRef } from 'react';
import { pwaBadge } from '@/utils/pwa-badge';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

interface UsePWABadgeOptions {
  autoSync?: boolean;
  debug?: boolean;
  onBadgeUpdate?: (count: number) => void;
}

export function usePWABadge(options: UsePWABadgeOptions = {}) {
  const {
    autoSync = true,
    debug = false,
    onBadgeUpdate
  } = options;

  const { unreadCount } = useNotificationsManagerRQ();
  const previousCountRef = useRef<number>(0);

  useEffect(() => {
    const isSupported = pwaBadge.isSupported();

    if (debug) {
      console.log('[usePWABadge] Badge API supported:', isSupported);
    }

    if (isSupported) {
      pwaBadge.clear();
    }

    return () => {
      if (isSupported) {
        pwaBadge.clear();
      }
    };
  }, [debug]);

  useEffect(() => {
    if (!autoSync) return;

    const syncBadge = async () => {
      if (unreadCount === previousCountRef.current) {
        return;
      }

      if (debug) {
        console.log('[usePWABadge] Syncing badge:', unreadCount);
      }

      const success = await pwaBadge.setCount(unreadCount);

      if (success) {
        previousCountRef.current = unreadCount;
        onBadgeUpdate?.(unreadCount);
      }
    };

    syncBadge();
  }, [unreadCount, autoSync, debug, onBadgeUpdate]);

  return {
    isSupported: pwaBadge.isSupported(),
    currentCount: unreadCount,
    setBadgeCount: pwaBadge.setCount,
    clearBadge: pwaBadge.clear,
    incrementBadge: pwaBadge.increment,
    decrementBadge: pwaBadge.decrement
  };
}

export function usePWABadgeSync() {
  usePWABadge({ autoSync: true });
}
