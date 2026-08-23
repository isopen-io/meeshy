/**
 * Hook de réactions utilisant React Query avec sync Socket.IO
 *
 * Avantages:
 * - Cache React Query centralisé
 * - Mutations avec optimistic updates
 * - Sync automatique via WebSocket
 */

'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { isValidObjectId } from '@/utils/object-id';
import type {
  ReactionAggregation,
  ReactionSync,
  ReactionUpdateEvent
} from '@meeshy/shared/types/reaction';
import {
  CLIENT_EVENTS,
  RATE_LIMIT_REFUSAL_MESSAGE,
  REACTION_SYNC_BUDGET,
} from '@meeshy/shared/types/socketio-events';

// Étendre les query keys pour les réactions
const reactionKeys = {
  all: ['reactions'] as const,
  message: (messageId: string) => [...reactionKeys.all, messageId] as const,
};

export interface UseReactionsQueryOptions {
  messageId: string;
  currentUserId?: string;
  isAnonymous?: boolean;
  enabled?: boolean;
  /** Données initiales provenant du message (reactionSummary dénormalisé) */
  initialReactionSummary?: Record<string, number>;
  /** Réactions de l'utilisateur connecté (pour affichage instantané sans sync) */
  initialCurrentUserReactions?: string[];
}

interface ReactionState {
  reactions: ReactionAggregation[];
  userReactions: string[];
}

/**
 * Un socket absent n'est PAS une réponse. Distinguée des autres échecs parce
 * qu'elle ne se réessaie pas : tant que la connexion n'est pas revenue, la
 * n-ième tentative échouera exactement comme la première. C'est le retour de la
 * connexion — pas un compteur — qui relance la demande (cf. l'effet de
 * réconciliation dans `useReactionsQuery`).
 */
class ReactionSocketUnavailableError extends Error {
  constructor() {
    super('Socket not connected');
    this.name = 'ReactionSocketUnavailableError';
  }
}

/**
 * Un budget épuisé n'est PAS une panne : le serveur a répondu « pas
 * maintenant ». Distinguée pour la même raison que la classe ci-dessus, et avec
 * la même conséquence — pas de réessai. La fenêtre du serveur n'a pas bougé
 * entre deux tentatives immédiates : la seconde est refusée comme la première,
 * et elle a coûté une demande de plus dans une fenêtre déjà pleine. C'est le
 * TOUR d'émission (ci-dessous) qui traverse l'épuisement, pas un compteur de
 * réessais.
 */
class ReactionSyncRateLimitedError extends Error {
  constructor() {
    super(RATE_LIMIT_REFUSAL_MESSAGE);
    this.name = 'ReactionSyncRateLimitedError';
  }
}

const isSocketReachable = (): boolean => Boolean(meeshySocketIOService.getSocket()?.connected);

/**
 * L'écart minimal entre deux demandes de réconciliation, dérivé du budget que
 * le SERVEUR publie — jamais choisi ici.
 *
 * `REACTION_SYNC_BUDGET` autorise `maxRequests` demandes par `windowMs` et par
 * utilisateur ; une demande toutes les `windowMs / maxRequests` millisecondes
 * est donc, par construction, le débit le plus rapide qui ne peut pas épuiser
 * la fenêtre.
 */
export const RECONCILE_SPACING_MS =
  REACTION_SYNC_BUDGET.windowMs / REACTION_SYNC_BUDGET.maxRequests;

/**
 * Le tour d'émission d'UNE rafale de réconciliation.
 *
 * La réconciliation est posée par BULLE : un fil monté en compte autant que de
 * bulles rendues, et le franchissement injoignable → joignable les réveille
 * toutes dans le même tick. Chacune ignore combien de voisines partagent son
 * budget, donc aucune ne peut décider seule d'attendre — d'où ce compteur
 * partagé, qui n'existe que le temps de la rafale.
 *
 * Le compteur se remet à zéro en microtâche : tous les abonnés d'un même
 * franchissement sont notifiés SYNCHRONEMENT par `emitStatusChange`, donc ils
 * ont tous pris leur créneau quand la microtâche s'exécute. Le franchissement
 * suivant repart de zéro, et une bulle seule à l'écran part toujours
 * immédiatement.
 */
let burstSlot = 0;
let burstResetScheduled = false;

function nextBurstDelayMs(): number {
  const delay = burstSlot * RECONCILE_SPACING_MS;
  burstSlot += 1;
  if (!burstResetScheduled) {
    burstResetScheduled = true;
    queueMicrotask(() => {
      burstSlot = 0;
      burstResetScheduled = false;
    });
  }
  return delay;
}

// Fonction pour récupérer les réactions via Socket.IO
async function fetchReactions(messageId: string): Promise<ReactionState> {
  return new Promise((resolve, reject) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) {
      // Surtout PAS `resolve({ reactions: [], userReactions: [] })`. Cette
      // requête tourne en `staleTime: Infinity` : un état vide résolu est
      // mémorisé comme une vérité fraîche et plus rien ne le relit. Le montage
      // d'un fil précède couramment la poignée de main du socket — la bulle
      // restait alors sans réaction pour toute la vie du composant, sans qu'un
      // seul `reaction:request-sync` soit jamais parti. Une absence de canal se
      // signale comme un échec ; elle ne se raconte pas comme une absence de
      // réaction.
      reject(new ReactionSocketUnavailableError());
      return;
    }

    /* istanbul ignore next -- 5s timeout is an infrastructure-level safety net, not unit-testable without fake timers */
    const timeout = setTimeout(() => {
      reject(new Error('Timeout fetching reactions'));
    }, 5000);

    socket.emit(
      CLIENT_EVENTS.REACTION_REQUEST_SYNC,
      messageId,
      (response: any) => {
        clearTimeout(timeout);
        if (response.success && response.data) {
          const syncData = response.data as ReactionSync;
          resolve({
            reactions: syncData.reactions as ReactionAggregation[],
            userReactions: syncData.userReactions as string[],
          });
        } else if (response.error === RATE_LIMIT_REFUSAL_MESSAGE) {
          reject(new ReactionSyncRateLimitedError());
        } else {
          reject(new Error(response.error || 'Failed to fetch reactions'));
        }
      }
    );
  });
}

const EMPTY_REACTION_STATE: ReactionState = { reactions: [], userReactions: [] };

/**
 * Résout l'agrégat d'une DIFFUSION pour le lecteur qui la reçoit.
 *
 * `ReactionBroadcastAggregation` ne porte aucune réponse par-lecteur, et c'est
 * délibéré : le même objet part vers toute la room, donc `hasCurrentUser` n'y
 * aurait de valeur juste pour personne (cf. `packages/shared/types/reaction.ts`).
 * La seule vérité du lecteur est `userReactions`, tenue ici et alimentée par le
 * `userId` de l'acteur — c'est d'elle que le drapeau se dérive.
 *
 * Le recopier depuis l'agrégat reçu attribuait au lecteur la réaction de
 * l'ACTEUR : allumé sur l'ajout d'un tiers, éteint sur le retrait d'un tiers.
 * C'est le défaut que la jumelle COMMENTAIRE a déjà produit en production, où
 * iOS le contourne dans deux ViewModels.
 */
function resolveAggregationForReader(
  aggregation: ReactionUpdateEvent['aggregation'],
  userReactions: readonly string[],
): ReactionAggregation {
  return { ...aggregation, hasCurrentUser: userReactions.includes(aggregation.emoji) };
}

/**
 * W4: Update reactionSummary on the message object inside messages.infinite cache.
 * Scans all cached infinite message queries to find the message by ID.
 */
function updateReactionSummaryInMessageCache(
  qc: QueryClient,
  messageId: string,
  emoji: string,
  aggregation: ReactionUpdateEvent['aggregation'],
) {
  const allQueries = qc.getQueriesData<{
    pages: { messages: Array<{ id: string; reactionSummary?: Record<string, number> }> }[];
  }>({ queryKey: queryKeys.messages.all });

  for (const [queryKey, data] of allQueries) {
    if (!data?.pages) continue;

    let found = false;
    const updated = {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((msg) => {
          if (msg.id !== messageId) return msg;
          found = true;
          const summary = { ...(msg.reactionSummary || {}) };
          if (aggregation.count === 0) {
            delete summary[emoji];
          } else {
            summary[emoji] = aggregation.count;
          }
          return { ...msg, reactionSummary: summary };
        }),
      })),
    };

    if (found) {
      qc.setQueryData(queryKey, updated);
    }
  }
}

export function useReactionsQuery({
  messageId,
  currentUserId,
  isAnonymous = false,
  enabled = true,
  initialReactionSummary,
  initialCurrentUserReactions,
}: UseReactionsQueryOptions) {
  const queryClient = useQueryClient();

  // Restaure EXACTEMENT l'état d'avant la mise à jour optimiste, y compris
  // l'absence d'état. `setQueryData(key, undefined)` ne suffit pas : React Query
  // interprète `undefined` comme « ne rien changer » et laisserait en place ce
  // que `onMutate` a fabriqué sur un cache vide. Le retrait de l'entrée est la
  // seule façon de revenir à « pas de donnée », et laisse les observateurs
  // montés re-demander la vérité au serveur.
  const restoreReactionSnapshot = useCallback((previousData: ReactionState | undefined) => {
    if (previousData === undefined) {
      queryClient.removeQueries({ queryKey: reactionKeys.message(messageId), exact: true });
      return;
    }
    queryClient.setQueryData(reactionKeys.message(messageId), previousData);
  }, [queryClient, messageId]);

  // An optimistic (not-yet-persisted) message carries a client id (`cid_<uuid>`,
  // see optimistic-message.ts) until the server ACK/broadcast replaces it with a
  // Mongo ObjectId. The gateway rejects any non-ObjectId messageId ("Prisma
  // ObjectID error"), so the query/mutations below must stay disabled until
  // messageId is a real, persisted ObjectId — reachable in practice via the
  // always-interactive quick-reaction button on a still-"sending" bubble.
  const isPersisted = isValidObjectId(messageId);

  // Convertir reactionSummary + currentUserReactions en données initiales pour React Query
  // Permet un affichage instantané sans attendre Socket.IO
  const initialData = useMemo((): ReactionState | undefined => {
    // Si pas de données initiales, pas d'état initial
    const hasReactionSummary = initialReactionSummary && Object.keys(initialReactionSummary).length > 0;
    const hasUserReactions = initialCurrentUserReactions && initialCurrentUserReactions.length > 0;

    if (!hasReactionSummary && !hasUserReactions) {
      return undefined;
    }

    // Set des réactions de l'utilisateur pour vérification rapide
    const userReactionsSet = new Set(initialCurrentUserReactions || []);

    // Convertir { "❤️": 5, "👍": 3 } en ReactionAggregation[]
    const reactions: ReactionAggregation[] = Object.entries(initialReactionSummary || {}).map(
      ([emoji, count]) => ({
        emoji,
        count,
        participantIds: [] as readonly string[],
        hasCurrentUser: userReactionsSet.has(emoji),
      })
    );

    return {
      reactions,
      userReactions: initialCurrentUserReactions || [],
    };
  }, [initialReactionSummary, initialCurrentUserReactions]);

  // Query pour récupérer les réactions
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: reactionKeys.message(messageId),
    queryFn: () => fetchReactions(messageId),
    enabled: enabled && !!messageId && isPersisted,
    staleTime: Infinity, // Socket.IO gère les mises à jour
    // Les deux refus que rien ne rend réessayables : un canal absent et un
    // budget épuisé. Dans les deux cas la n-ième tentative immédiate échoue
    // exactement comme la première — et pour le budget elle CREUSE l'échec, en
    // dépensant une demande de plus dans la fenêtre qui vient de le refuser.
    retry: (failureCount, error) =>
      error instanceof ReactionSocketUnavailableError ||
      error instanceof ReactionSyncRateLimitedError
        ? false
        : failureCount < 1,
    initialData, // Utiliser reactionSummary pour affichage instantané
  });

  const reactions = data?.reactions ?? [];
  const userReactions = data?.userReactions ?? [];

  // La réconciliation que le gateway ANNONCE, et que personne ne faisait.
  //
  // `ReactionHandler` documente cinq fois son rattrapage par la même phrase —
  // « peers reconcile on the next reaction:sync » : diffusion best-effort qui
  // échoue, agrégation dégradée, retrait non annoncé. L'argument de cohérence
  // du serveur repose donc entièrement sur un sync CLIENT ultérieur.
  //
  // Il n'y en avait aucun. `reaction:request-sync` ne partait qu'au montage de
  // la requête, qui tourne en `staleTime: Infinity` : pour un fil resté ouvert,
  // « le prochain sync » n'arrivait jamais. Tout ce que la coupure a manqué —
  // les `reaction:added`/`reaction:removed` émis pendant l'absence, qui ne sont
  // pas rejoués — restait absent de la bulle indéfiniment.
  //
  // On s'abonne donc au retour de la connexion, et à lui seul : un changement
  // d'état qui ne franchit pas la frontière injoignable → joignable ne
  // redemande rien. Le volume est celui, déjà admis, du montage du fil — une
  // demande par bulle montée, sous la même limite `REACTION_SYNC` du gateway.
  //
  // La demande ne part pas dans le tick du franchissement, mais dans le CRÉNEAU
  // que `nextBurstDelayMs` lui attribue : le réveil est collectif, le budget
  // aussi, et une rafale de N bulles émise d'un seul coup épuise exactement le
  // plafond dont la réconciliation dépend — elle se ferait refuser pour avoir
  // été trop pressée. Une bulle seule garde le créneau 0, donc part tout de
  // suite. Le minuteur meurt avec le composant : une bulle sortie de l'écran ne
  // dépense pas un budget pour un observateur qui n'est plus là.
  useEffect(() => {
    if (!enabled || !messageId || !isPersisted) return;

    let wasReachable = isSocketReachable();
    let burstTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = meeshySocketIOService.onStatusChange(() => {
      const reachable = isSocketReachable();
      if (reachable === wasReachable) return;
      wasReachable = reachable;
      if (!reachable) return;

      const delay = nextBurstDelayMs();
      if (delay === 0) {
        refetch();
        return;
      }
      if (burstTimer) clearTimeout(burstTimer);
      burstTimer = setTimeout(() => {
        burstTimer = null;
        refetch();
      }, delay);
    });

    return () => {
      if (burstTimer) clearTimeout(burstTimer);
      unsubscribe();
    };
  }, [enabled, messageId, isPersisted, refetch]);

  // Mutation pour ajouter une réaction
  const addMutation = useMutation({
    mutationFn: async (emoji: string) => {
      return new Promise<boolean>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          CLIENT_EVENTS.REACTION_ADD,
          { messageId, emoji },
          (response: any) => {
            if (response.success) {
              resolve(true);
            } else {
              reject(new Error(response.error || 'Failed to add reaction'));
            }
          }
        );
      });
    },
    onMutate: async (emoji) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: reactionKeys.message(messageId) });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<ReactionState>(reactionKeys.message(messageId));

      // Optimistic update
      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [], userReactions: [emoji] };

        const existing = old.reactions.find(r => r.emoji === emoji);
        let newReactions: ReactionAggregation[];

        if (existing) {
          newReactions = old.reactions.map(r =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, hasCurrentUser: true }
              : r
          );
        } else {
          newReactions = [
            ...old.reactions,
            {
              emoji,
              count: 1,
              participantIds: currentUserId ? [currentUserId] : [],
              hasCurrentUser: true,
            },
          ];
        }

        return {
          reactions: newReactions,
          userReactions: old.userReactions.includes(emoji)
            ? old.userReactions
            : [...old.userReactions, emoji],
        };
      });

      return { previousData };
    },
    onError: (err, _emoji, context) => {
      // Rollback INCONDITIONNEL. Gardé sur `context.previousData`, il refusait
      // de défaire le cas où `onMutate` a FABRIQUÉ l'état à partir d'un cache
      // vide : `previousData` vaut alors `undefined`, et la réaction fantôme
      // survivait au refus du serveur.
      restoreReactionSnapshot(context?.previousData);

      // Erreur serveur VERBATIM. Le remap qui traduisait « Maximum N different
      // reactions » visait une erreur que PLUS AUCUN service de réaction
      // n'émet : message, pièce jointe, post et commentaire sont tous additifs
      // depuis le 2026-08-18. Le garder ne pouvait plus que présenter une
      // erreur voisine comme une limite inexistante.
      const errorMessage = err instanceof Error ? err.message : 'Failed to add reaction';
      toast.error(errorMessage);
    },
  });

  // Mutation pour retirer une réaction
  const removeMutation = useMutation({
    mutationFn: async (emoji: string) => {
      return new Promise<boolean>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          CLIENT_EVENTS.REACTION_REMOVE,
          { messageId, emoji },
          (response: any) => {
            if (response.success) {
              resolve(true);
            } else {
              reject(new Error(response.error || 'Failed to remove reaction'));
            }
          }
        );
      });
    },
    onMutate: async (emoji) => {
      await queryClient.cancelQueries({ queryKey: reactionKeys.message(messageId) });

      const previousData = queryClient.getQueryData<ReactionState>(reactionKeys.message(messageId));

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [], userReactions: [] };

        const existing = old.reactions.find(r => r.emoji === emoji);
        if (!existing) return old;

        let newReactions: ReactionAggregation[];
        if (existing.count <= 1) {
          newReactions = old.reactions.filter(r => r.emoji !== emoji);
        } else {
          newReactions = old.reactions.map(r =>
            r.emoji === emoji
              ? { ...r, count: r.count - 1, hasCurrentUser: false }
              : r
          );
        }

        return {
          reactions: newReactions,
          userReactions: old.userReactions.filter(e => e !== emoji),
        };
      });

      return { previousData };
    },
    onError: (_err, _emoji, context) => {
      // Rollback inconditionnel, même raison qu'à l'ajout : sur cache vide,
      // `onMutate` matérialise un état que le garde `if (previousData)`
      // laissait ensuite en place.
      restoreReactionSnapshot(context?.previousData);
      toast.error('Failed to remove reaction');
    },
  });

  // Actions
  const addReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (!enabled || !messageId || !isPersisted) return false;

    // Vérifier si déjà réagi
    if (userReactions.includes(emoji)) return true;

    // Multi-réactions (2026-08-18) : aucun cap client — parité messages/
    // pièces jointes/posts, le serveur accepte tout emoji distinct.
    try {
      await addMutation.mutateAsync(emoji);
      return true;
    } catch {
      return false;
    }
  }, [enabled, messageId, isPersisted, userReactions, addMutation]);

  const removeReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (!enabled || !messageId || !isPersisted) return false;

    try {
      await removeMutation.mutateAsync(emoji);
      return true;
    } catch {
      return false;
    }
  }, [enabled, messageId, isPersisted, removeMutation]);

  const toggleReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (userReactions.includes(emoji)) {
      return removeReaction(emoji);
    } else {
      return addReaction(emoji);
    }
  }, [userReactions, addReaction, removeReaction]);

  const hasReacted = useCallback((emoji: string): boolean => {
    return userReactions.includes(emoji);
  }, [userReactions]);

  const getReactionCount = useCallback((emoji: string): number => {
    const reaction = reactions.find(r => r.emoji === emoji);
    return reaction?.count || 0;
  }, [reactions]);

  const totalCount = useMemo(() => {
    return reactions.reduce((sum, r) => sum + r.count, 0);
  }, [reactions]);

  // Écouter les événements Socket.IO pour mettre à jour le cache
  useEffect(() => {
    if (!enabled || !messageId) return;

    const handleReactionAdded = (event: ReactionUpdateEvent) => {
      if (event.messageId !== messageId) return;

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        const previous = old ?? EMPTY_REACTION_STATE;

        // L'ORDRE compte : `userReactions` est la vérité du LECTEUR, et c'est
        // d'elle que `hasCurrentUser` se dérive — jamais de l'agrégat reçu, qui
        // décrit l'ACTEUR. On la calcule donc en premier.
        //
        // On compare le User.id du réacteur (`event.userId`), PAS
        // `event.participantId` : ce dernier est un Participant.id scopé
        // conversation, jamais égal à un User.id (ObjectIds de collections
        // distinctes). Comparer participantId à currentUserId (un User.id)
        // échouait toujours — sur un 2e appareil du même utilisateur la réaction
        // n'était pas surlignée et un tap la ré-ajoutait au lieu de la retirer.
        // Aligné sur le chemin réaction de post (use-post-socket-cache-sync).
        let newUserReactions = previous.userReactions;
        if (event.userId && event.userId === currentUserId) {
          if (!previous.userReactions.includes(event.emoji)) {
            newUserReactions = [...previous.userReactions, event.emoji];
          }
        }

        const aggregation = resolveAggregationForReader(event.aggregation, newUserReactions);
        const existing = previous.reactions.find(r => r.emoji === event.emoji);
        const newReactions: ReactionAggregation[] = existing
          ? previous.reactions.map(r => (r.emoji === event.emoji ? aggregation : r))
          : [...previous.reactions, aggregation];

        return { reactions: newReactions, userReactions: newUserReactions };
      });

      // Aucune invalidation de la liste de conversations, et c'est délibéré :
      // une réaction ne change rien de ce qu'une ligne de liste porte (aperçu,
      // non-lus, horodatage). Il y avait ici une `invalidateQueries` sur la
      // forme PLATE, désormais supprimée du dépôt — elle ne matchait donc
      // aucun cache. Ne pas la « réparer » vers `conversations.infinite()` :
      // ça relirait toutes les pages chargées à chaque réaction. Le seul cache
      // concerné est celui du message, juste en dessous.

      // W4: Update reactionSummary on the message object in messages.infinite cache
      updateReactionSummaryInMessageCache(queryClient, event.messageId, event.emoji, event.aggregation);
    };

    const handleReactionRemoved = (event: ReactionUpdateEvent) => {
      if (event.messageId !== messageId) return;

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        const previous = old ?? EMPTY_REACTION_STATE;

        // Même ordre qu'à l'ajout, et pour la même raison. Un retrait émis par un
        // TIERS ne dit rien de MA réaction : `userReactions` ne bouge que si
        // l'acteur est moi, et `hasCurrentUser` suit `userReactions`. Recopier
        // l'agrégat éteignait le drapeau du lecteur sur le retrait de n'importe
        // qui.
        let newUserReactions = previous.userReactions;
        if (event.userId && event.userId === currentUserId) {
          newUserReactions = previous.userReactions.filter(e => e !== event.emoji);
        }

        const newReactions: ReactionAggregation[] = event.aggregation.count === 0
          ? previous.reactions.filter(r => r.emoji !== event.emoji)
          : previous.reactions.map(r =>
              r.emoji === event.emoji
                ? resolveAggregationForReader(event.aggregation, newUserReactions)
                : r
            );

        return { reactions: newReactions, userReactions: newUserReactions };
      });

      // Pas d'invalidation de la liste de conversations — même raison qu'à
      // l'ajout (cf. `handleReactionAdded`).

      // W4: Update reactionSummary on the message object in messages.infinite cache
      updateReactionSummaryInMessageCache(queryClient, event.messageId, event.emoji, event.aggregation);
    };

    const unsubAdded = meeshySocketIOService.onReactionAdded(handleReactionAdded);
    const unsubRemoved = meeshySocketIOService.onReactionRemoved(handleReactionRemoved);

    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [enabled, messageId, currentUserId, isAnonymous, queryClient]);

  return {
    // État
    reactions,
    isLoading,
    error: error?.message ?? null,
    totalCount,
    userReactions,

    // Actions
    addReaction,
    removeReaction,
    toggleReaction,

    // Utilitaires
    hasReacted,
    getReactionCount,
    refreshReactions: refetch,
  };
}
