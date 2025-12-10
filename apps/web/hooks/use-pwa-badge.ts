/**
 * Hook React pour synchroniser le badge PWA avec les notifications
 * Auto-sync avec notification-store-v2
 */

import { useEffect, useRef } from 'react';
import { pwaBadge } from '@/utils/pwa-badge';
import { useUnreadCountV2 } from '@/stores/notification-store-v2';

interface UsePWABadgeOptions {
  /**
   * Activer la synchronisation automatique avec le store
   * @default true
   */
  autoSync?: boolean;

  /**
   * Activer le debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Callback quand le badge est mis à jour
   */
  onBadgeUpdate?: (count: number) => void;
}

/**
 * Hook pour gérer le badge PWA
 * Synchronise automatiquement avec le unreadCount du store
 */
export function usePWABadge(options: UsePWABadgeOptions = {}) {
  const {
    autoSync = true,
    debug = false,
    onBadgeUpdate
  } = options;

  const unreadCount = useUnreadCountV2();
  const previousCountRef = useRef<number>(0);

  // Vérifier le support au montage
  useEffect(() => {
    const isSupported = pwaBadge.isSupported();

    if (debug) {
      console.log('[usePWABadge] Badge API supported:', isSupported);
    }

    // Clear badge au montage pour partir d'un état propre
    if (isSupported) {
      pwaBadge.clear();
    }

    // Cleanup au démontage
    return () => {
      if (isSupported) {
        pwaBadge.clear();
      }
    };
  }, [debug]);

  // Synchroniser avec le unreadCount
  useEffect(() => {
    if (!autoSync) return;

    const syncBadge = async () => {
      // Éviter les updates inutiles
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

/**
 * Hook simplifié pour juste activer le badge automatique
 * Usage: usePWABadgeSync() dans le layout principal
 */
export function usePWABadgeSync() {
  usePWABadge({ autoSync: true });
}
