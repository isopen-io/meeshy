'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

export interface UnifiedConnectionStatus {
  isOnline: boolean;
  isSocketConnected: boolean;
  hasSocket: boolean;
  isReady: boolean;
}

function getInitialOnline(): boolean {
  /* istanbul ignore next -- SSR false-arm unreachable: navigator is always defined in browser/jsdom */
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getInitialStatus(): UnifiedConnectionStatus {
  const isOnline = getInitialOnline();
  /* istanbul ignore next -- SSR false-arm unreachable: window is always defined in browser/jsdom */
  const diag =
    typeof window !== 'undefined'
      ? meeshySocketIOService.getConnectionDiagnostics()
      : { isConnected: false, hasSocket: false };
  return {
    isOnline,
    isSocketConnected: !!diag.isConnected,
    hasSocket: !!diag.hasSocket,
    isReady: isOnline && !!diag.isConnected,
  };
}

/**
 * Source unique de vérité pour l'état de connexion.
 * Combine la connectivité physique du navigateur (navigator.onLine)
 * et l'état du Socket.IO, en mode event-driven (pas de polling).
 */
export function useConnectionStatus(): UnifiedConnectionStatus {
  const [status, setStatus] = useState<UnifiedConnectionStatus>(getInitialStatus);

  useEffect(() => {
    /* istanbul ignore next -- SSR false-arm unreachable: window is always defined in browser/jsdom */
    if (typeof window === 'undefined') return;

    const apply = (
      next: Partial<Omit<UnifiedConnectionStatus, 'isReady'>>
    ) => {
      setStatus((prev) => {
        const merged = { ...prev, ...next };
        const isReady = merged.isOnline && merged.isSocketConnected;
        if (
          prev.isOnline === merged.isOnline &&
          prev.isSocketConnected === merged.isSocketConnected &&
          prev.hasSocket === merged.hasSocket &&
          prev.isReady === isReady
        ) {
          return prev;
        }
        return { ...merged, isReady };
      });
    };

    const handleOnline = () => apply({ isOnline: true });
    const handleOffline = () =>
      apply({ isOnline: false, isSocketConnected: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubSocket = meeshySocketIOService.onStatusChange((diag) => {
      apply({
        isSocketConnected: !!diag.isConnected,
        hasSocket: !!diag.hasSocket,
      });
    });

    // Resynchronisation initiale (au cas où un événement aurait été manqué
    // entre le calcul de l'état initial et la pose des listeners).
    const diag = meeshySocketIOService.getConnectionDiagnostics();
    apply({
      isOnline: navigator.onLine,
      isSocketConnected: !!diag.isConnected,
      hasSocket: !!diag.hasSocket,
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubSocket();
    };
  }, []);

  return status;
}

/** Sucre syntaxique : `true` si le réseau navigateur est actif. */
export function useIsOnline(): boolean {
  return useConnectionStatus().isOnline;
}
