/**
 * Hook pour ecouter les changements de statut utilisateur en temps reel via Socket.IO
 * + tick local (60s) pour recalculer les transitions VERT→ORANGE→GRIS
 * + heartbeat periodique (90s) pour maintenir la presence dans Redis (TTL 120s)
 */

'use client';

import { useEffect } from 'react';
import { getSocketIOService } from '@/services/meeshy-socketio.service';
import { useUserStore } from '@/stores/user-store';
import type { UserStatusEvent } from '@/types';

const STATUS_TICK_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 90_000;

export function useUserStatusRealtime() {
  const socketService = getSocketIOService();
  const updateUserStatus = useUserStore(state => state.updateUserStatus);
  const triggerStatusTick = useUserStore(state => state.triggerStatusTick);

  useEffect(() => {
    const unsubscribe = socketService.onUserStatus((event: UserStatusEvent) => {
      updateUserStatus(event.userId, {
        isOnline: event.isOnline,
        lastActiveAt: event.lastActiveAt ? new Date(event.lastActiveAt) : undefined,
        username: event.username
      });
    });

    const tickInterval = setInterval(() => {
      triggerStatusTick();
    }, STATUS_TICK_INTERVAL_MS);

    const heartbeatInterval = setInterval(() => {
      const socket = socketService.getSocket();
      if (socket?.connected) {
        (socket as any).emit('heartbeat');
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(tickInterval);
      clearInterval(heartbeatInterval);
    };
  }, [updateUserStatus, triggerStatusTick, socketService]);
}
