/**
 * Hook pour ecouter les changements de statut utilisateur en temps reel via Socket.IO
 *
 * Responsabilites :
 * - Souscrit a USER_STATUS (event ponctuel par user) -> updateUserStatus
 * - Souscrit a PRESENCE_SNAPSHOT (seed initial a l'auth socket) -> mergeParticipants
 * - Tick local (60s) pour recalculer les transitions VERT -> ORANGE -> GRIS
 * - Resync REST (`GET /directory/presence`) au retour de focus tab et au retour online,
 *   debounce 1s pour eviter les rafales d'appels.
 *
 * Ce hook n'emet AUCUN heartbeat applicatif. Il en a emis un (90s), sur la
 * justification « maintenir la presence dans Redis (TTL 120s) » : cette charge
 * appartient desormais au serveur, pour TOUS les clients a la fois.
 *
 * Le gateway rafraichit la presence sur le pong ENGINE (`handleEnginePong`,
 * `MeeshySocketIOManager` : `socket.conn.on('packet')`), que Socket.IO echange
 * toutes les 25s (`pingInterval: 25000`) avec chaque client, sans qu'aucun code
 * applicatif ait a le demander. Les deux chemins appellent exactement la meme
 * methode — `StatusService.noteHeartbeat`, etranglee a 60s — donc un battement
 * de 90s ne pouvait RIEN produire que le pong n'ait deja produit 3,6x plus
 * souvent, et la cle Redis restait rafraichie toutes les 60s, bien en deca de
 * son TTL de 120s.
 *
 * Ce battement etait de surcroit muet : le canal applicatif n'offre qu'une
 * chose de plus que le pong — un `heartbeat:ack` porteur du RTT — et il
 * s'obtient en envoyant `clientTime`. Le battement web partait NU, donc le
 * gateway ne calculait aucun `latencyHintMs`, et l'ack repartait vers un client
 * qui ne l'ecoutait pas. Une trame toutes les 90s par onglet, une trame de
 * retour, pour un effet deja acquis.
 *
 * iOS garde le canal applicatif (`MessageSocketManager`, 30s AVEC `clientTime`)
 * et c'est lui qui justifie que `CLIENT_EVENTS.HEARTBEAT` existe encore.
 */

'use client';

import { useEffect, useRef } from 'react';
import { getSocketIOService } from '@/services/meeshy-socketio.service';
import { useUserStore } from '@/stores/user-store';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { getAuthToken } from '@/utils/token-utils';
import type { User, UserStatusEvent } from '@/types';

const STATUS_TICK_INTERVAL_MS = 60_000;
const RESYNC_DEBOUNCE_MS = 1_000;
const RESYNC_MAX_IDS = 200;

type PresenceSnapshotUser = {
  readonly userId: string;
  readonly username: string;
  readonly isOnline: boolean;
  readonly lastActiveAt?: Date | string | null;
};

type PresenceSnapshotPayload = {
  readonly users: ReadonlyArray<PresenceSnapshotUser>;
};

type PresenceRestEntry = {
  readonly userId: string;
  readonly isOnline: boolean;
  readonly lastActiveAt?: string | null;
};

type PresenceRestResponse = {
  readonly success?: boolean;
  readonly data?: {
    readonly users?: ReadonlyArray<PresenceRestEntry>;
  };
};

const toMinimalUser = (entry: PresenceSnapshotUser): User => {
  // A missing lastActiveAt must stay absent — never fabricate Date.now(), which
  // would make getUserStatus decay to 'online' and paint an orange pulsing dot
  // for an offline contact whose "last seen" is hidden (gateway nulls it in
  // MeeshySocketIOManager._applyPresencePrefs). Mirrors the onUserStatus / REST
  // resync paths, which already pass `undefined` when the timestamp is absent.
  const lastActiveAt =
    entry.lastActiveAt instanceof Date
      ? entry.lastActiveAt
      : entry.lastActiveAt
        ? new Date(entry.lastActiveAt)
        : undefined;

  return {
    id: entry.userId,
    username: entry.username || '',
    displayName: entry.username || '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    role: 'USER' as const,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    isOnline: entry.isOnline,
    lastActiveAt,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;
};

export function useUserStatusRealtime() {
  const socketService = getSocketIOService();
  const updateUserStatus = useUserStore(state => state.updateUserStatus);
  const mergeParticipants = useUserStore(state => state.mergeParticipants);
  const triggerStatusTick = useUserStore(state => state.triggerStatusTick);

  const lastResyncAtRef = useRef<number>(0);
  const resyncInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubscribeStatus = socketService.onUserStatus((event: UserStatusEvent) => {
      updateUserStatus(event.userId, {
        isOnline: event.isOnline,
        lastActiveAt: event.lastActiveAt ? new Date(event.lastActiveAt) : undefined,
        username: event.username
      });
    });

    const unsubscribeSnapshot = socketService.onPresenceSnapshot((event: PresenceSnapshotPayload) => {
      if (!event?.users?.length) return;
      const minimalUsers = event.users.map(toMinimalUser);
      mergeParticipants(minimalUsers);
    });

    const tickInterval = setInterval(() => {
      triggerStatusTick();
    }, STATUS_TICK_INTERVAL_MS);

    return () => {
      unsubscribeStatus();
      unsubscribeSnapshot();
      clearInterval(tickInterval);
    };
  }, [updateUserStatus, mergeParticipants, triggerStatusTick, socketService]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resync = async (): Promise<void> => {
      const now = Date.now();
      if (now - lastResyncAtRef.current < RESYNC_DEBOUNCE_MS) return;
      if (resyncInFlightRef.current) return;

      const usersMap = useUserStore.getState().usersMap;
      if (usersMap.size === 0) return;

      const tokenInfo = getAuthToken();
      if (!tokenInfo) return;

      const allIds = Array.from(usersMap.keys());
      const ids = allIds.length > RESYNC_MAX_IDS ? allIds.slice(0, RESYNC_MAX_IDS) : allIds;
      if (ids.length === 0) return;

      lastResyncAtRef.current = now;
      resyncInFlightRef.current = true;

      try {
        // `/directory/presence` (#4164) — la même charge, sous une garde
        // FAIL-CLOSED : l'ancienne adresse servait la présence runtime BRUTE
        // pour tout id absent de la carte de visibilité, l'inverse exact de la
        // règle du 2026-08-25.
        const presenceEndpoint = `${API_ENDPOINTS.directory.presence}?ids=${encodeURIComponent(ids.join(','))}`;
        const url = buildApiUrl(presenceEndpoint);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            [tokenInfo.header.name]: tokenInfo.header.value,
          },
        });

        if (!response.ok) return;

        const payload = (await response.json()) as PresenceRestResponse;
        const entries = payload?.data?.users;
        if (!entries?.length) return;

        for (const entry of entries) {
          if (!entry?.userId) continue;
          updateUserStatus(entry.userId, {
            isOnline: entry.isOnline,
            lastActiveAt: entry.lastActiveAt ? new Date(entry.lastActiveAt) : undefined,
          });
        }
      } catch {
        // Resync best-effort : silent failure (network glitch, server down, etc.)
      } finally {
        resyncInFlightRef.current = false;
      }
    };

    const handleFocus = (): void => {
      void resync();
    };

    const handleOnline = (): void => {
      void resync();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [updateUserStatus]);
}
