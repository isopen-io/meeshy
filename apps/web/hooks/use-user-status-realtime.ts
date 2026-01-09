/**
 * Hook pour écouter les changements de statut utilisateur en temps réel via Socket.IO
 * AUCUN POLLING - 100% événementiel
 */

'use client';

import { useEffect } from 'react';
import { getSocketIOService } from '@/services/meeshy-socketio.service';
import { useUserStore } from '@/stores/user-store';
import type { UserStatusEvent } from '@/types';

/**
 * Hook pour écouter les changements de statut utilisateur en temps réel
 * via Socket.IO - PAS DE POLLING
 *
 * Ce hook s'abonne à l'événement USER_STATUS de Socket.IO et met à jour
 * automatiquement le store global des utilisateurs.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useUserStatusRealtime(); // Active les listeners temps réel
 *   // Le store useUserStore se met à jour automatiquement
 * }
 * ```
 */
export function useUserStatusRealtime() {
  const socketService = getSocketIOService();
  const updateUserStatus = useUserStore(state => state.updateUserStatus);

  useEffect(() => {

    // S'abonner aux événements USER_STATUS
    const unsubscribe = socketService.onUserStatus((event: UserStatusEvent) => {

      // Mettre à jour le store global
      // IMPORTANT: Ne jamais mettre lastActiveAt à undefined, toujours garder la valeur reçue
      updateUserStatus(event.userId, {
        isOnline: event.isOnline,
        lastActiveAt: event.lastActiveAt ? new Date(event.lastActiveAt) : undefined
      });
    });

    return () => {
      unsubscribe();
    };
  }, [updateUserStatus]);
}
