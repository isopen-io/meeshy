/**
 * Hook pour écouter les changements de statut utilisateur en temps réel via Socket.IO
 * + tick local (60s) pour recalculer les transitions VERT→ORANGE→GRIS basées sur le temps.
 *
 * Aucun appel réseau supplémentaire — le tick force juste un re-render
 * pour que getUserStatus() recalcule avec Date.now() courant.
 */

'use client';

import { useEffect } from 'react';
import { getSocketIOService } from '@/services/meeshy-socketio.service';
import { useUserStore } from '@/stores/user-store';
import type { UserStatusEvent } from '@/types';

// Intervalle du tick local pour recalculer les statuts temporels (60s)
const STATUS_TICK_INTERVAL_MS = 60_000;

export function useUserStatusRealtime() {
  const socketService = getSocketIOService();
  const updateUserStatus = useUserStore(state => state.updateUserStatus);
  const triggerStatusTick = useUserStore(state => state.triggerStatusTick);

  useEffect(() => {
    // S'abonner aux événements USER_STATUS (Socket.IO)
    const unsubscribe = socketService.onUserStatus((event: UserStatusEvent) => {
      updateUserStatus(event.userId, {
        isOnline: event.isOnline,
        lastActiveAt: event.lastActiveAt ? new Date(event.lastActiveAt) : undefined
      });
    });

    // Tick local : forcer un re-render toutes les 60s pour les transitions temporelles
    const tickInterval = setInterval(() => {
      triggerStatusTick();
    }, STATUS_TICK_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(tickInterval);
    };
  }, [updateUserStatus, triggerStatusTick]);
}
