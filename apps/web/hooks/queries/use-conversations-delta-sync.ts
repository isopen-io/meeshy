'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { conversationsService } from '@/services/conversations.service';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useNotificationStore } from '@/stores/notification-store';
import {
  conversationDeltaWatermark,
  mergeConversationDelta,
} from '@/lib/conversations/delta-sync';
import {
  rebuildInfiniteConversationPages,
  type InfiniteConversationData,
} from '@/lib/conversations/infinite-cache';

/**
 * Rattrapage de la liste de conversations après une coupure SOCKET.
 *
 * ## La fenêtre aveugle que ce hook ferme
 *
 * Le QueryClient global tourne en `staleTime: Infinity` — Socket.IO EST la
 * source de vérité temps réel. Ce qui n'arrive pas par socket n'est rattrapé
 * par rien tant que l'écran reste monté.
 *
 * `refetchOnReconnect: 'always'` ressemble à la couverture manquante mais ne
 * l'est pas : il écoute le `onlineManager` de React Query, c'est-à-dire la
 * transition réseau du NAVIGATEUR. Un redémarrage gateway, un drop de load
 * balancer ou un échec d'upgrade de transport tuent la socket sans bouger
 * `navigator.onLine` — rien ne se déclenche, et la liste garde ses compteurs de
 * non-lus, ses aperçus de dernier message et son effectif d'avant la coupure.
 *
 * C'est le pendant, pour la liste, du « Trigger 1 » de
 * `use-conversation-messages-rq.ts` (front `false → true` de `isSocketConnected`),
 * et le miroir web de `ConversationSyncEngine.syncSinceLastCheckpoint` sur iOS.
 *
 * ## Delta, pas `refetch()`
 *
 * `refetch()` rejouerait TOUTES les pages chargées d'une route lourde
 * (participants, dernier message avec ses traductions et sa pièce jointe,
 * compteurs de non-lus par curseur). Le rattrapage est UNE requête bornée par ce
 * qui a réellement bougé — voir `lib/conversations/delta-sync.ts` pour la
 * démonstration que le watermark déduit du cache ne peut rien rater.
 */

/**
 * Plafond serveur de `GET /conversations` (`Math.min(limit, 100)` dans
 * `routes/conversations/core.ts`) — demander plus ne rend pas plus.
 *
 * La troncature n'est pas récupérable en avançant le watermark : la route trie
 * par `lastMessageAt` décroissant, PAS par `updatedAt`, donc les lignes coupées
 * ne sont pas « les plus anciennes » et le prochain `updatedSince` — calculé sur
 * ce qui a été fusionné — passerait par-dessus. Une page PLEINE est donc traitée
 * comme une preuve d'incomplétude, et non comme un delta de confiance.
 */
const DELTA_PAGE_LIMIT = 100;

/**
 * Anti-rafale sur les flaps de reconnexion. Sauter une exécution est sans
 * conséquence : le watermark est DÉDUIT du cache, jamais avancé par une
 * exécution sautée — la suivante couvre exactement la même fenêtre.
 */
const DELTA_COOLDOWN_MS = 5_000;

type DeltaGuard = { inFlight: boolean; lastRunAt: number };

/**
 * Le garde protège un cache, il appartient donc à son propriétaire plutôt qu'au
 * module : plusieurs consommateurs de `useInfiniteConversationsQuery` montés en
 * même temps partagent un QueryClient et ne doivent tirer qu'une fois.
 */
const guards = new WeakMap<QueryClient, DeltaGuard>();

function guardFor(queryClient: QueryClient): DeltaGuard {
  const existing = guards.get(queryClient);
  if (existing) return existing;
  const created: DeltaGuard = { inFlight: false, lastRunAt: 0 };
  guards.set(queryClient, created);
  return created;
}

export function useConversationsDeltaSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  const { isSocketConnected } = useConnectionStatus();
  const prevSocketConnectedRef = useRef<boolean | null>(null);

  const runDelta = useCallback(async () => {
    const guard = guardFor(queryClient);
    if (guard.inFlight) return;
    const now = Date.now();
    if (now - guard.lastRunAt < DELTA_COOLDOWN_MS) return;

    const cached = queryClient.getQueryData<InfiniteConversationData>(
      queryKeys.conversations.infinite()
    );
    const watermark = conversationDeltaWatermark(
      cached?.pages.flatMap((page) => page.conversations) ?? []
    );
    // Cache vide (démarrage à froid) : rien à quoi comparer, et le montage lit
    // déjà le serveur en entier. Un repli sur l'horloge locale n'aurait ici
    // aucune vérité derrière lui.
    if (!watermark) return;

    guard.inFlight = true;
    guard.lastRunAt = now;
    try {
      const { conversations } = await conversationsService.getConversations({
        limit: DELTA_PAGE_LIMIT,
        offset: 0,
        updatedSince: watermark.toISOString(),
      });
      if (conversations.length === 0) return;

      // Accumulateur local du seul résultat de la fusion qui intéresse un AUTRE
      // cache. `setQueryData` appelle son updater synchronement et une seule
      // fois : la valeur est lisible juste après, et l'updater reste une
      // fonction pure de `old`.
      let removedIds: string[] = [];
      // Lue ICI, au moment de la fusion : la requête a pu courir plusieurs
      // centaines de millisecondes, pendant lesquelles l'utilisateur a pu ouvrir
      // ou fermer une conversation.
      const openConversationId = useNotificationStore.getState().activeConversationId;
      queryClient.setQueryData(
        queryKeys.conversations.infinite(),
        (old: InfiniteConversationData | undefined) => {
          if (!old) return old;
          // Le cache est relu ICI, pas avant l'await : un event socket arrivé
          // pendant la requête doit survivre à la fusion.
          const existing = old.pages.flatMap((page) => page.conversations);
          const merge = mergeConversationDelta(existing, conversations, {
            openConversationId,
          });
          removedIds = merge.removedIds;
          return rebuildInfiniteConversationPages(old, merge.merged);
        }
      );

      for (const removedId of removedIds) {
        queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(removedId) });
        // Miroir de `cache.messages.invalidate(for:)` sur iOS : une conversation
        // retirée de la liste ne doit pas laisser derrière elle un fil de
        // messages que `staleTime: Infinity` ne relira jamais, et qu'un retour
        // sur l'URL afficherait tel quel.
        queryClient.removeQueries({ queryKey: queryKeys.messages.infinite(removedId) });
      }

      // Page pleine ⇒ le delta ne PROUVE plus qu'il a tout vu. On garde la
      // fusion (correction immédiate de ce qu'on tient) et on escalade vers la
      // relecture complète, seule à pouvoir combler le reste. Ce chemin coûteux
      // n'existe que pour une coupure ayant touché 100 conversations ou plus,
      // c'est-à-dire précisément le cas où une resync entière est justifiée.
      if (conversations.length >= DELTA_PAGE_LIMIT) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.infinite() });
      }
    } catch {
      // Silencieux : la socket porte la suite, et le prochain reconnect
      // repartira du MÊME watermark — un échec ne consomme pas la fenêtre.
    } finally {
      guard.inFlight = false;
    }
  }, [queryClient]);

  useEffect(() => {
    const prev = prevSocketConnectedRef.current;
    prevSocketConnectedRef.current = isSocketConnected;

    if (!enabled) return;
    // Seul un RE-connect prouve une fenêtre aveugle. Au premier `connect`, la
    // liste vient d'être lue côté serveur par `refetchOnMount: 'always'`.
    if (!(prev === false && isSocketConnected === true)) return;

    void runDelta();
  }, [enabled, isSocketConnected, runDelta]);
}
