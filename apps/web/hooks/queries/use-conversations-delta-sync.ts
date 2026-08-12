'use client';

import { useCallback, useEffect, useRef } from 'react';
import { focusManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import type { Conversation } from '@meeshy/shared/types';

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
 * ## Trigger 2 — le retour de focus, et ce qu'il remplace
 *
 * `refetchOnWindowFocus: 'always'` (QueryClient global) couvrait le retour
 * d'onglet, mais au prix fort. Sur une `useInfiniteQuery`, ce refetch rejoue
 * TOUTES les pages chargées et REMPLACE le cache :
 *
 * 1. dix pages de scroll = dix requêtes sur une route lourde (participants,
 *    dernier message avec traductions et pièce jointe, compteurs par curseur),
 *    à chaque retour d'onglet ;
 * 2. tout ce que la socket écrit pendant la séquence est écrasé ;
 * 3. la route pagine par OFFSET sur un tri `lastMessageAt` décroissant
 *    (`orderBy: { lastMessageAt: 'desc' }`, `routes/conversations/core.ts`) :
 *    un message arrivé entre la page k et la page k+1 promeut sa conversation
 *    en tête et décale toutes les pages suivantes d'un cran — une ligne
 *    dupliquée à la frontière, une autre disparue.
 *
 * Le focus reste donc un signal, mais il tire le MÊME delta borné que le
 * reconnect : une requête, une fusion non destructrice. Exactement le geste que
 * `use-conversation-messages-rq.ts` a fait pour les messages d'une conversation.
 *
 * ## Ce que le refetch de focus faisait et que le delta ne fait pas
 *
 * Le delta est upsert-only : une conversation HARD-supprimée côté serveur ne
 * revient dans AUCUNE réponse `updatedSince`. Le refetch de focus la purgeait
 * par remplacement ; sa suppression laisserait la ligne fantôme à vie. D'où la
 * réconciliation complète BORNÉE ci-dessous — pendant web de
 * `fullReconcileInterval` sur iOS (24 h).
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
 * La route trie désormais une page DELTA par `updatedAt` croissant (elle triait
 * par `lastMessageAt` décroissant, sans rapport avec le filtre), donc les lignes
 * coupées sont exactement celles d'`updatedAt` supérieur à la dernière rendue :
 * le watermark pointe dessus et l'exécution suivante les rend.
 *
 * L'escalade reste, pour le seul cas que l'ordre ne rattrape pas : plus de 100
 * conversations portant la MÊME milliseconde d'`updatedAt` (écriture en masse)
 * débordent d'une page que la borne stricte `gt` ne peut pas reprendre.
 *
 * Ce qui déclenche l'escalade n'est PAS « la page est pleine » mais le
 * `pagination.hasMore` du serveur, qui est autoritaire ici : une page delta part
 * toujours d'`offset=0`, ce qui fait compter au serveur toutes les lignes de la
 * MÊME clause `updatedAt > since` (`routes/conversations/core.ts`) — `hasMore` y
 * vaut `N < total`. Une fenêtre de très exactement 100 conversations ne relit
 * donc plus toute la liste pour rien. Quand la réponse omet le bloc pagination,
 * `getConversations` retombe déjà sur `length >= limit`, conservateur.
 *
 * JUMEAU iOS : `ConversationSyncEngine.deltaSyncCore` lit le même `hasMore` et
 * escalade vers `fullSync()`.
 */
const DELTA_PAGE_LIMIT = 100;

/**
 * Anti-rafale sur les flaps de reconnexion. Sauter une exécution est sans
 * conséquence : le watermark est DÉDUIT du cache, jamais avancé par une
 * exécution sautée — la suivante couvre exactement la même fenêtre.
 */
const DELTA_COOLDOWN_MS = 5_000;

/**
 * Coalesce les allers-retours d'onglet rapides. Même valeur que
 * `FOCUS_CATCH_UP_DEBOUNCE_MS` dans `use-conversation-messages-rq.ts` — les deux
 * rattrapages répondent au même geste utilisateur et doivent se déclencher
 * ensemble plutôt qu'en escalier.
 */
const FOCUS_DEBOUNCE_MS = 1_000;

/**
 * Borne « on ne rapatrie jamais la liste entière pour rien » : au plus UNE
 * relecture complète par fenêtre. Jumeau de `fullReconcileInterval` (86 400 s)
 * dans `ConversationSyncEngine` — toute évolution touche les DEUX plateformes.
 */
const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Pendant de la clé `UserDefaults` iOS `me.meeshy.lastFullReconcileAt`. */
const FULL_RECONCILE_STORAGE_KEY = 'meeshy_conversations_last_full_reconcile_at';

type DeltaGuard = {
  inFlight: boolean;
  lastRunAt: number;
  /** `null` = pas encore hydraté depuis le stockage. */
  lastFullReconcileAt: number | null;
};

/**
 * Le garde protège un cache, il appartient donc à son propriétaire plutôt qu'au
 * module : plusieurs consommateurs de `useInfiniteConversationsQuery` montés en
 * même temps partagent un QueryClient et ne doivent tirer qu'une fois.
 */
const guards = new WeakMap<QueryClient, DeltaGuard>();

function guardFor(queryClient: QueryClient): DeltaGuard {
  const existing = guards.get(queryClient);
  if (existing) return existing;
  const created: DeltaGuard = { inFlight: false, lastRunAt: 0, lastFullReconcileAt: null };
  guards.set(queryClient, created);
  return created;
}

function readStoredReconcileAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FULL_RECONCILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Le garde tient la valeur AUTORITAIRE, le stockage n'en est que la persistance.
 * En navigation privée — ou sur quota plein — `localStorage` jette : la borne
 * dégrade alors en « une fois par session », jamais en « à chaque focus ».
 */
function stampFullReconcile(guard: DeltaGuard, at: number): void {
  guard.lastFullReconcileAt = at;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FULL_RECONCILE_STORAGE_KEY, String(at));
  } catch {
    // Volontairement muet — voir ci-dessus.
  }
}

/**
 * Rend la borne de la fenêtre courante, en la posant si elle manque.
 *
 * Un navigateur sans horodatage n'a jamais réconcilié, mais il vient tout juste
 * de LIRE le serveur en entier : `refetchOnMount: 'always'` sur
 * `useInfiniteConversationsQuery` a rempli le cache au montage. Réconcilier
 * immédiatement doublerait cette lecture pour rien — la fenêtre de 24 h démarre
 * donc ici, elle ne court pas depuis l'époque zéro. (iOS part de `.distantPast`
 * et réconcilie au premier lancement, faute d'une lecture de montage équivalente.)
 *
 * Une borne dans le FUTUR — horloge système reculée, stockage bricolé — gèlerait
 * la réconciliation à vie : elle est ramenée à maintenant.
 */
function reconcileWindowStart(guard: DeltaGuard, now: number): number {
  if (guard.lastFullReconcileAt !== null && guard.lastFullReconcileAt <= now) {
    return guard.lastFullReconcileAt;
  }
  const stored = guard.lastFullReconcileAt === null ? readStoredReconcileAt() : null;
  if (stored !== null && stored <= now) {
    guard.lastFullReconcileAt = stored;
    return stored;
  }
  stampFullReconcile(guard, now);
  return now;
}

function isFullReconcileDue(guard: DeltaGuard, now: number): boolean {
  return now - reconcileWindowStart(guard, now) >= FULL_RECONCILE_INTERVAL_MS;
}

/**
 * Fusionne un lot de delta dans le cache infini et purge les caches dérivés des
 * conversations que le lot déclare parties.
 */
function mergeDeltaIntoCache(
  queryClient: QueryClient,
  conversations: readonly Conversation[]
): void {
  // Accumulateur local du seul résultat de la fusion qui intéresse un AUTRE
  // cache. `setQueryData` appelle son updater synchronement et une seule fois :
  // la valeur est lisible juste après, et l'updater reste une fonction pure de
  // `old`.
  let removedIds: string[] = [];
  // Lue ICI, au moment de la fusion : la requête a pu courir plusieurs centaines
  // de millisecondes, pendant lesquelles l'utilisateur a pu ouvrir ou fermer une
  // conversation.
  const openConversationId = useNotificationStore.getState().activeConversationId;
  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      // Le cache est relu ICI, pas avant l'await : un event socket arrivé
      // pendant la requête doit survivre à la fusion.
      const existing = old.pages.flatMap((page) => page.conversations);
      // `hasMore` de la DERNIÈRE page : tant qu'il en reste, une inconnue plus
      // ancienne que la fenêtre chargée appartient à une page non lue et
      // entrerait en double au `fetchNextPage` suivant.
      const hasMore = Boolean(old.pages[old.pages.length - 1]?.pagination?.hasMore);
      const merge = mergeConversationDelta(existing, conversations, {
        hasMore,
        openConversationId,
      });
      removedIds = merge.removedIds;
      return rebuildInfiniteConversationPages(old, merge.merged);
    }
  );

  for (const removedId of removedIds) {
    queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(removedId) });
    // Miroir de `cache.messages.invalidate(for:)` sur iOS : une conversation
    // retirée de la liste ne doit pas laisser derrière elle un fil de messages
    // que `staleTime: Infinity` ne relira jamais, et qu'un retour sur l'URL
    // afficherait tel quel.
    queryClient.removeQueries({ queryKey: queryKeys.messages.infinite(removedId) });
  }
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
      const { conversations, pagination } = await conversationsService.getConversations({
        limit: DELTA_PAGE_LIMIT,
        offset: 0,
        updatedSince: watermark.toISOString(),
      });
      if (conversations.length > 0) {
        mergeDeltaIntoCache(queryClient, conversations);
      }

      // Réconciliation complète, chaînée APRÈS un delta RÉUSSI. Deux raisons de
      // la déclencher, une seule action :
      //
      // - le serveur annonce du RESTE ⇒ le delta ne PROUVE plus qu'il a tout vu.
      //   On garde la fusion (correction immédiate de ce qu'on tient) et on
      //   escalade, seule voie pour combler le reste. Ce chemin n'existe que
      //   pour une coupure ayant touché 100 conversations ou plus, c'est-à-dire
      //   précisément le cas où une resync entière est justifiée ;
      // - fenêtre de 24 h échue ⇒ purge des lignes fantômes, que le delta
      //   upsert-only ne peut pas voir. Testé MÊME sur un delta vide : une
      //   conversation hard-supprimée ne produit AUCUNE ligne de delta, donc
      //   exiger `conversations.length > 0` ici rendrait la purge inatteignable
      //   sur un compte calme — précisément celui qui garde son fantôme.
      //
      // Sur delta ÉCHOUÉ : rien. Offline ou panne gateway, on garde le cache
      // intact (local-first) et on retentera au prochain déclenchement.
      const reconcile = pagination.hasMore || isFullReconcileDue(guard, now);
      if (reconcile) {
        stampFullReconcile(guard, now);
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

  // Trigger 2 — retour de focus. Remplace le `refetchOnWindowFocus: 'always'`
  // destructeur que `useInfiniteConversationsQuery` désactive explicitement ;
  // voir l'en-tête du module pour ce que ce refetch coûtait.
  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = focusManager.subscribe((focused) => {
      if (!focused) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void runDelta();
      }, FOCUS_DEBOUNCE_MS);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [enabled, runDelta]);
}
