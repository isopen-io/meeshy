'use client';

/**
 * Rattrapage de la LISTE de conversations après une coupure SOCKET.
 *
 * Le QueryClient global tourne en `staleTime: Infinity` — Socket.IO EST la
 * source de vérité temps réel. `refetchOnReconnect: 'always'` semble couvrir la
 * reconnexion, mais il écoute l'`onlineManager` de React Query, c'est-à-dire la
 * transition réseau du NAVIGATEUR : un redémarrage gateway, un drop de load
 * balancer ou un échec d'upgrade de transport ne bougent pas `navigator.onLine`.
 * Pendant cette fenêtre la liste garde ses compteurs de non-lus, ses aperçus de
 * dernier message et son effectif d'avant la coupure, et ne se corrige qu'au
 * prochain focus de fenêtre ou remontage.
 *
 * Jumeau de `ConversationSyncEngine.deltaSyncCore`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`) ;
 * les règles de fusion, de tri et de curseur vivent dans
 * `@/lib/conversations/delta-merge`, valeur pure partagée par les deux témoins.
 *
 * Le pendant côté messages est `syncNewerMessages`
 * (`use-conversation-messages-rq.ts`, « Trigger 1 »), et côté notifications
 * `onSyncDesync('reconnect')` (`use-notifications-manager-rq.ts`).
 */

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { conversationsService } from '@/services/conversations.service';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useNotificationStore } from '@/stores/notification-store';
import { updateInfiniteConversationCache } from '@/lib/conversations/infinite-cache';
import {
  conversationDeltaWatermark,
  mergeDeltaConversations,
  sortConversationsByRecency,
} from '@/lib/conversations/delta-merge';
import type { Conversation } from '@meeshy/shared/types';

/** Plafond de `limit` du gateway (`GET /conversations`). */
const DELTA_PAGE_LIMIT = 100;

/**
 * Nombre maximal de pages parcourues avant de rendre les armes. Au-delà de
 * `DELTA_MAX_PAGES × DELTA_PAGE_LIMIT` conversations touchées, le delta n'est
 * plus le chemin bon marché qu'il prétend être : la relecture complète est le
 * seul rattrapage honnête. Exporté pour que le témoin nomme la même borne.
 */
export const DELTA_MAX_PAGES = 5;

/**
 * Fenêtre pendant laquelle un delta qui vient de courir suffit. La liste est
 * montée par plusieurs écrans à la fois et une socket qui bat la chamade
 * enchaîne les fronts de reconnexion — sans ce garde PARTAGÉ (niveau module,
 * pas par hook), chaque montage et chaque battement produirait sa requête.
 * iOS a corrigé exactement ce défaut (`deltaSyncCooldown = 3`).
 */
const DELTA_SYNC_COOLDOWN_MS = 3_000;

let lastDeltaSyncAt = 0;
let deltaSyncInFlight = false;

type InfiniteConversationCache = {
  pages: { conversations: Conversation[] }[];
};

/**
 * Lit le delta `GET /conversations?updatedSince=` et le fusionne dans le cache
 * infinite SANS le remplacer.
 *
 * Pourquoi pas `refetch()` : sur une infinite query il relit TOUTES les pages
 * et REMPLACE le cache — il perd donc les écritures que les handlers socket y
 * ont faites (aperçus, effectifs, pastilles), et coûte N requêtes là où le
 * delta en coûte une. C'est la même raison qui a fait écrire `syncNewerMessages`
 * plutôt qu'un refetch côté messages.
 *
 * Ne rejette jamais : hors ligne ou gateway en vrac, on garde le cache intact
 * (local-first) et le prochain front de reconnexion retentera.
 */
export async function syncConversationsDelta(queryClient: QueryClient): Promise<void> {
  if (deltaSyncInFlight) return;

  const cached = queryClient.getQueryData<InfiniteConversationCache>(
    queryKeys.conversations.infinite()
  );
  if (!cached) return;

  const existing = cached.pages.flatMap((page) => page.conversations);
  const updatedSince = conversationDeltaWatermark(existing, new Date());
  if (!updatedSince) return;

  const now = Date.now();
  if (now - lastDeltaSyncAt < DELTA_SYNC_COOLDOWN_MS) return;
  lastDeltaSyncAt = now;
  deltaSyncInFlight = true;

  try {
    let offset = 0;
    for (let attempt = 0; attempt < DELTA_MAX_PAGES; attempt++) {
      const result = await conversationsService.getConversations({
        limit: DELTA_PAGE_LIMIT,
        offset,
        updatedSince,
      });

      const deltas = result.conversations ?? [];
      if (deltas.length > 0) {
        applyConversationDeltas(queryClient, deltas);
        offset += deltas.length;
      }

      // Une page vide, ou un serveur qui annonce la fin : le rattrapage est
      // complet. Une page vide AVEC `hasMore` ne peut pas faire avancer
      // l'offset — sortir est le seul moyen de ne pas boucler sur place.
      if (deltas.length === 0 || !result.pagination.hasMore) return;
    }

    // Le trou dépasse ce que la marche peut couvrir : la relecture complète
    // reprend la main. `invalidate` plutôt que `refetch` pour laisser React
    // Query n'agir que sur les observateurs montés.
    await queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.infinite(),
    });
  } catch {
    // Silence volontaire — le cache reste tel quel et les events socket
    // reprennent le relais dès que la connexion tient.
  } finally {
    deltaSyncInFlight = false;
  }
}

function applyConversationDeltas(
  queryClient: QueryClient,
  deltas: readonly Conversation[]
): void {
  // Lu au moment de la fusion, jamais capturé plus tôt : le rattrapage peut
  // courir plusieurs centaines de millisecondes, pendant lesquelles
  // l'utilisateur a pu ouvrir ou fermer une conversation.
  const openConversationId = useNotificationStore.getState().activeConversationId;
  let removedIds: readonly string[] = [];

  updateInfiniteConversationCache(queryClient, (conversations) => {
    const merged = mergeDeltaConversations(conversations, deltas, { openConversationId });
    removedIds = merged.removedIds;
    return sortConversationsByRecency(merged.merged);
  });

  // Miroir de `cache.messages.invalidate(for:)` sur iOS. Défensif sur cet
  // endpoint — `GET /conversations` filtre déjà `isActive: true` — mais la
  // règle doit rester la même des deux côtés.
  for (const removedId of removedIds) {
    queryClient.removeQueries({ queryKey: queryKeys.messages.infinite(removedId) });
  }
}

type UseConversationsDeltaSyncOptions = {
  enabled?: boolean;
};

/**
 * Déclenche le delta sur le front `false → true` de la socket, et sur lui seul.
 *
 * Pas de rattrapage au montage, délibérément : `useInfiniteConversationsQuery`
 * monte déjà en `refetchOnMount: 'always'`, ce qui couvre strictement plus que
 * le delta. Les deux lectures se seraient concurrencées.
 *
 * Pas de rattrapage sur la PREMIÈRE connexion non plus : seule une RE-connexion
 * prouve qu'il y a eu une fenêtre aveugle.
 */
export function useConversationsDeltaSync(
  options: UseConversationsDeltaSyncOptions = {}
): void {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const { isSocketConnected } = useConnectionStatus();
  const prevSocketConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const prev = prevSocketConnectedRef.current;
    prevSocketConnectedRef.current = isSocketConnected;

    if (prev !== false || isSocketConnected !== true) return;

    void syncConversationsDelta(queryClient);
  }, [enabled, isSocketConnected, queryClient]);
}
