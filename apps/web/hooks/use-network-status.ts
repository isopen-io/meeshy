'use client';

import { useConnectionStatus } from './use-connection-status';

/**
 * @deprecated Préférer `useConnectionStatus()` pour disposer aussi de l'état
 * du Socket.IO. Cette fonction reste exportée pour compatibilité.
 */
export function useNetworkStatus(): boolean {
  return useConnectionStatus().isOnline;
}
