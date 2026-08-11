'use client';

/**
 * Rattrapage de la LISTE de conversations au reconnect SOCKET.
 *
 * Pendant qu'une socket est coupée, la liste garde ses compteurs de non-lus, ses
 * aperçus de dernier message et son effectif d'avant la coupure. Rien ne l'en
 * sort : le QueryClient global tourne en `staleTime: Infinity` (Socket.IO EST la
 * source de vérité temps réel) et son `refetchOnReconnect: 'always'` écoute le
 * `onlineManager` — la connectivité RÉSEAU du navigateur, que ne bouge ni un
 * redémarrage gateway, ni un drop du load balancer, ni un échec d'upgrade de
 * transport.
 *
 * Le déclencheur est le front `false → true` de `isSocketConnected`, exactement
 * comme le « Trigger 1 » de `use-conversation-messages-rq` — un seul motif de
 * reconnect côté web, pas deux. Le rattrapage est un DELTA `?updatedSince=`
 * (jumeau de `deltaSyncCore` iOS) et non un `refetch()` : un refetch REMPLACE les
 * pages en cache et perd ce que le socket y a écrit.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { conversationsService } from '@/services/conversations.service';
import {
  readInfiniteConversationCache,
  updateInfiniteConversationCache,
} from '@/lib/conversations/infinite-cache';
import {
  conversationDeltaWatermark,
  mergeConversationDeltas,
} from '@/lib/sync/conversation-list-delta';

/**
 * Fenêtre pendant laquelle un second déclencheur est absorbé (miroir du
 * `deltaSyncCooldown` iOS). Une socket qui bat de l'aile enchaîne les fronts
 * `false → true`, et la liste est montée par plusieurs surfaces à la fois
 * (layout v1, sidebar v2) : sans elle, un même reconnect part en N requêtes.
 */
export const CONVERSATION_DELTA_SYNC_COOLDOWN_MS = 3000;

/**
 * Le garde-fou vit dans le QueryClient et non dans un module : il doit être
 * partagé par toutes les surfaces qui montent la liste, tout en repartant à zéro
 * avec chaque client (un test, un logout). Personne ne s'y abonne — l'écrire ne
 * re-rend rien.
 */
const DELTA_SYNC_GUARD_KEY = ['conversations', 'delta-sync-guard'] as const;

type DeltaSyncGuard = {
  readonly inFlight: boolean;
  readonly lastRunAtMs: number;
};

function claimDeltaSync(queryClient: QueryClient, nowMs: number): boolean {
  const guard = queryClient.getQueryData<DeltaSyncGuard>(DELTA_SYNC_GUARD_KEY);
  if (guard?.inFlight) return false;
  if (guard && nowMs - guard.lastRunAtMs < CONVERSATION_DELTA_SYNC_COOLDOWN_MS) return false;

  queryClient.setQueryData<DeltaSyncGuard>(DELTA_SYNC_GUARD_KEY, {
    inFlight: true,
    lastRunAtMs: nowMs,
  });
  return true;
}

function releaseDeltaSync(queryClient: QueryClient): void {
  queryClient.setQueryData<DeltaSyncGuard>(DELTA_SYNC_GUARD_KEY, {
    inFlight: false,
    lastRunAtMs: Date.now(),
  });
}

type UseConversationListDeltaSyncOptions = {
  readonly enabled: boolean;
  readonly limit: number;
};

export function useConversationListDeltaSync({
  enabled,
  limit,
}: UseConversationListDeltaSyncOptions): void {
  const queryClient = useQueryClient();
  const { isSocketConnected } = useConnectionStatus();
  const prevSocketConnectedRef = useRef<boolean | null>(null);

  const syncUpdatedConversations = useCallback(async () => {
    const cached = readInfiniteConversationCache(queryClient);
    if (!cached) return;

    // Sans borne lisible, il n'y a pas de « depuis quand » à demander — et une
    // liste vide est déjà relue intégralement au montage
    // (`refetchOnMount: 'always'`).
    const updatedSince = conversationDeltaWatermark(cached.conversations);
    if (!updatedSince) return;

    if (!claimDeltaSync(queryClient, Date.now())) return;

    try {
      // `limit` est celui de la liste : le delta d'une coupure ordinaire tient
      // très largement dedans, et le plafond serveur (100) borne le reste. Ce qui
      // dépasserait est rattrapé au reconnect suivant, la borne n'ayant avancé
      // que jusqu'au plus récent `updatedAt` réellement fusionné.
      const { conversations: deltas } = await conversationsService.getConversations({
        limit,
        updatedSince,
      });
      if (deltas.length === 0) return;

      // Relecture du cache APRÈS la requête : le socket a pu écrire entre-temps.
      const fresh = readInfiniteConversationCache(queryClient);
      if (!fresh) return;

      updateInfiniteConversationCache(queryClient, (existing) =>
        mergeConversationDeltas({ existing, deltas, hasMore: fresh.hasMore })
      );
    } catch {
      // Silencieux : le socket reprend la main sur les events suivants, et le
      // prochain reconnect relancera un rattrapage depuis la même borne.
    } finally {
      releaseDeltaSync(queryClient);
    }
  }, [queryClient, limit]);

  useEffect(() => {
    // Le front est suivi même hors service : la déconnexion peut tomber pendant
    // que la liste est désactivée, et c'est bien un RE-connect qu'on verra en
    // revenant.
    const prev = prevSocketConnectedRef.current;
    prevSocketConnectedRef.current = isSocketConnected;

    if (!enabled) return;

    // Le PREMIER `connect` ne prouve aucune fenêtre aveugle : la liste monte
    // déjà en `refetchOnMount: 'always'`. Seul un RE-connect en prouve une.
    if (prev !== false || !isSocketConnected) return;

    void syncUpdatedConversations();
  }, [enabled, isSocketConnected, syncUpdatedConversations]);
}
