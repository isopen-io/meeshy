'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { FriendRequest, FriendRequestsData } from '@/types/contacts';

export interface UseFriendRequestsV2Options {
  enabled?: boolean;
  currentUserId?: string;
}

export interface FriendRequestsStats {
  connected: number;
  pending: number;
  refused: number;
}

export interface UseFriendRequestsV2Return {
  received: FriendRequest[];
  sent: FriendRequest[];
  connected: FriendRequest[];
  pending: FriendRequest[];
  refused: FriendRequest[];
  allRequests: FriendRequest[];
  stats: FriendRequestsStats;
  isLoading: boolean;
  error: string | null;
  sendRequest: (receiverId: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  getPendingRequestWithUser: (userId: string) => FriendRequest | undefined;
  refresh: () => Promise<void>;
}

function extractRequests(response: unknown): FriendRequest[] {
  if (!response || typeof response !== 'object') return [];
  const outer = (response as Record<string, unknown>).data;
  if (!outer || typeof outer !== 'object') return [];
  const inner = (outer as Record<string, unknown>).data;
  return Array.isArray(inner) ? inner : [];
}

function extractPagination(response: unknown): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const outer = (response as Record<string, unknown>).data;
  if (!outer || typeof outer !== 'object') return undefined;
  const pagination = (outer as Record<string, unknown>).pagination;
  return pagination && typeof pagination === 'object'
    ? (pagination as Record<string, unknown>)
    : undefined;
}

function extractHasMore(response: unknown): boolean | undefined {
  const hasMore = extractPagination(response)?.hasMore;
  return typeof hasMore === 'boolean' ? hasMore : undefined;
}

/**
 * Le curseur de la page SUIVANTE — l'`createdAt` de la dernière ligne servie.
 *
 * Il remplace `offset`, et ce n'est pas un changement d'orthographe : la route
 * à décalage repayait un `count()` COMPLET à chaque page pour rendre un `total`
 * que ce hook n'a jamais lu, et une insertion pendant la pagination décalait
 * toutes les pages suivantes — une relation acceptée pouvait être sautée. La
 * borne par horodatage est stable sous insertion et sert l'index de tri.
 */
function extractNextCursor(response: unknown): string | undefined {
  const cursor = extractPagination(response)?.nextCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}

/** L'adresse CANONIQUE des trois listings et du fantôme (#4162, #4254). */
const FRIEND_REQUESTS_ENDPOINT = '/directory/friend-requests';

/** Le gateway plafonne `limit` à 100 — même valeur côté iOS. */
const ACCEPTED_PAGE_SIZE = 100;
/**
 * Borne de sécurité : au-delà, on cesse de paginer plutôt que de suivre
 * indéfiniment un `hasMore` qui ne retomberait jamais. Même borne côté iOS
 * (`ForwardPickerViewModel.friendsFetchCap`).
 */
const ACCEPTED_FETCH_CAP = 500;

/**
 * La forme SERVIE par `/directory/friend-requests` : pagination par CURSEUR.
 *
 * Il n'y a plus de `total` — ce n'est pas un oubli, c'est le `count()` qu'on ne
 * paie plus. Aucun consommateur de ce hook ne le lisait : les trois compteurs
 * de l'écran contacts se dérivent de `.length` des listes servies.
 */
type FriendRequestsPage = {
  success: boolean;
  data: FriendRequest[];
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
};

export function useFriendRequestsV2(
  options: UseFriendRequestsV2Options = {}
): UseFriendRequestsV2Return {
  const { enabled = true, currentUserId } = options;
  const queryClient = useQueryClient();

  const receivedQueryKey = queryKeys.friendRequests.received();
  const sentQueryKey = queryKeys.friendRequests.sent();

  const {
    data: receivedData,
    isLoading: isLoadingReceived,
    error: receivedError,
  } = useQuery({
    queryKey: receivedQueryKey,
    queryFn: async () => {
      // `direction=received&status=pending` reproduit EXACTEMENT ce que
      // `/friend-requests/received` filtrait en dur côté serveur. Le `status`
      // n'est pas une addition : l'omettre ferait remonter ici les relations
      // acceptées et refusées, que `refused`/`pending` reclasseraient — un
      // changement de contenu d'onglet qui n'appartient pas à cette bascule.
      const response = await apiService.get<FriendRequestsPage>(FRIEND_REQUESTS_ENDPOINT, {
        direction: 'received',
        status: 'pending',
        limit: String(ACCEPTED_PAGE_SIZE),
      });
      return extractRequests(response);
    },
    enabled,
  });

  const {
    data: sentData,
    isLoading: isLoadingSent,
    error: sentError,
  } = useQuery({
    queryKey: sentQueryKey,
    queryFn: async () => {
      // Sans `status` : `/friend-requests/sent` rendait TOUS les statuts (son
      // propre contrat le disait), et c'est la seule source de l'onglet
      // « refusées ». Le restreindre le viderait.
      const response = await apiService.get<FriendRequestsPage>(FRIEND_REQUESTS_ENDPOINT, {
        direction: 'sent',
        limit: String(ACCEPTED_PAGE_SIZE),
      });
      return extractRequests(response);
    },
    enabled,
  });

  // `direction=received|sent` ne rend qu'un SENS : une relation acceptée dont
  // l'utilisateur est le receveur ne remonte pas par `sent`, et `received` est
  // filtré `pending`. `connected` vient donc de `direction=any&status=accepted`,
  // qui rend les deux sens quel que soit celui qui a initié.
  const acceptedQueryKey = queryKeys.friendRequests.accepted();

  // Paginé JUSQU'À ÉPUISEMENT, par CURSEUR — et la boucle reste, à dessein.
  //
  // Le critère 3 de #4254 la voulait remplacée par le `?q=` serveur. Mesuré :
  // les CINQ consommateurs de ce hook veulent la liste COMPLÈTE — l'annuaire de
  // contacts (`useContactsV2` trie et filtre localement), le sélecteur de
  // transfert, la fiche profil, la recherche, la page contacts. Aucun ne porte
  // de requête à passer, et un `?q=` non alimenté ne rendrait que la première
  // page : ce serait troquer un drain coûteux contre une liste TRONQUÉE.
  //
  // Ce que la bascule gagne quand même, et c'est mesurable : la route à
  // décalage repayait un `count()` complet à CHAQUE page pour un `total` que
  // personne ne lisait, et son `offset` sautait des lignes dès qu'une relation
  // était acceptée pendant la pagination.
  //
  // Jumeau iOS : `ForwardPickerViewModel.fetchFriendContactTargets`.
  const { data: acceptedData } = useQuery({
    queryKey: acceptedQueryKey,
    queryFn: async () => {
      const collected: FriendRequest[] = [];
      let cursor: string | undefined;
      while (collected.length < ACCEPTED_FETCH_CAP) {
        const response = await apiService.get<FriendRequestsPage>(FRIEND_REQUESTS_ENDPOINT, {
          direction: 'any',
          status: 'accepted',
          limit: String(ACCEPTED_PAGE_SIZE),
          // `undefined` est filtré par `apiService.get` : la PREMIÈRE page part
          // sans curseur, les suivantes avec celui que la précédente a rendu.
          cursor,
        });
        const page = extractRequests(response);
        collected.push(...page);
        const hasMore = extractHasMore(response) ?? page.length === ACCEPTED_PAGE_SIZE;
        cursor = extractNextCursor(response);
        // Sans curseur, redemander la même page tournerait en rond jusqu'au
        // plafond en collectant des doublons : on s'arrête, c'est la fin de la
        // liste que le serveur vient de déclarer.
        if (!hasMore || page.length === 0 || !cursor) break;
      }
      return collected;
    },
    enabled,
  });

  const received = useMemo(() => receivedData ?? [], [receivedData]);
  const sent = useMemo(() => sentData ?? [], [sentData]);
  const allRequests = useMemo(() => [...received, ...sent], [received, sent]);

  const { connected, pending, refused } = useMemo<FriendRequestsData>(() => {
    const pendingArr: FriendRequest[] = [];
    const refusedArr: FriendRequest[] = [];

    for (const req of allRequests) {
      switch (req.status) {
        case 'pending':
          pendingArr.push(req);
          break;
        case 'rejected':
          refusedArr.push(req);
          break;
      }
    }

    return { received, sent, connected: acceptedData ?? [], pending: pendingArr, refused: refusedArr };
  }, [allRequests, received, sent, acceptedData]);

  const stats = useMemo<FriendRequestsStats>(
    () => ({ connected: connected.length, pending: pending.length, refused: refused.length }),
    [connected, pending, refused]
  );

  const invalidateAll = useCallback(async () => {
    // `connected` now lives on its own query (acceptedQueryKey) — without this,
    // accepting/rejecting a request would settle received/sent but leave the
    // accepted-relations list stale until an unrelated remount.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: receivedQueryKey }),
      queryClient.invalidateQueries({ queryKey: sentQueryKey }),
      queryClient.invalidateQueries({ queryKey: acceptedQueryKey }),
    ]);
  }, [queryClient, receivedQueryKey, sentQueryKey, acceptedQueryKey]);

  // Invalidate on friend_request notifications (replaces refetchInterval polling)
  useEffect(() => {
    if (!enabled) return;
    return notificationSocketIO.onNotification((notification) => {
      if (notification.type === 'friend_request' || notification.type === 'contact_request') {
        invalidateAll();
      }
    });
  }, [enabled, invalidateAll]);

  // Invalidate when the OTHER party cancels/removes a pending request — this
  // path never creates a persisted notification, so it needs its own signal
  // (otherwise the counterpart's list stays stale until their next full reload).
  useEffect(() => {
    if (!enabled) return;
    return meeshySocketIOService.onFriendRequestCancelled(() => {
      invalidateAll();
    });
  }, [enabled, invalidateAll]);

  // Typed counterparts of NOTIFICATION_NEW(type=friend_request/friend_accepted)
  // and the reject system notification. The `onNotification` listener above
  // only re-invalidates on `friend_request`/`contact_request` — the sender's
  // `sent` list previously had NO live signal when the receiver accepted or
  // rejected, staying stale until the next full reload. These typed events
  // close that gap (dual-emitted alongside the legacy notifications).
  useEffect(() => {
    if (!enabled) return;
    return meeshySocketIOService.onFriendRequestNew(() => {
      invalidateAll();
    });
  }, [enabled, invalidateAll]);

  useEffect(() => {
    if (!enabled) return;
    return meeshySocketIOService.onFriendRequestAccepted(() => {
      invalidateAll();
    });
  }, [enabled, invalidateAll]);

  useEffect(() => {
    if (!enabled) return;
    return meeshySocketIOService.onFriendRequestRejected(() => {
      invalidateAll();
    });
  }, [enabled, invalidateAll]);

  const sendMutation = useMutation({
    mutationFn: async ({ receiverId, message }: { receiverId: string; message?: string }) => {
      // `/directory/friend-requests` (#4162) : l'unique chemin d'envoi. Celui
      // qu'appelait ce site était le plus FAIBLE des deux qui coexistaient —
      // ni garde d'auto-envoi, ni contrôle de désactivation, ni contrôle de
      // blocage. L'adresse canonique porte les trois.
      await apiService.post('/directory/friend-requests', { receiverId, ...(message && { message }) });
    },
    onMutate: async ({ receiverId }) => {
      if (!currentUserId) return {};
      await queryClient.cancelQueries({ queryKey: sentQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(sentQueryKey);
      const now = new Date().toISOString();
      const optimistic: FriendRequest = {
        id: `optimistic-${Date.now()}`,
        senderId: currentUserId,
        receiverId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<FriendRequest[]>(sentQueryKey, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(sentQueryKey, context.previous);
    },
    onSettled: () => invalidateAll(),
  });

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) => {
      // Un geste, un VERBE (#4162) : le corps porte une action, et la réponse
      // d'une acceptation porte enfin `conversation` — le serveur la greffait
      // déjà, mais son schéma ne la déclarant pas, elle était supprimée à la
      // sérialisation et le client devait la rechercher.
      await apiService.patch(`/directory/friend-requests/${requestId}`, { action: 'accept' });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      await queryClient.cancelQueries({ queryKey: acceptedQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      const previousAccepted = queryClient.getQueryData<FriendRequest[]>(acceptedQueryKey);
      const accepting = (previous ?? []).find((r) => r.id === requestId);
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).map((r) => (r.id === requestId ? { ...r, status: 'accepted' as const } : r))
      );
      if (accepting) {
        queryClient.setQueryData<FriendRequest[]>(acceptedQueryKey, (old) => [
          ...(old ?? []),
          { ...accepting, status: 'accepted' as const },
        ]);
      }
      return { previous, previousAccepted };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(receivedQueryKey, context.previous);
      if (context?.previousAccepted) queryClient.setQueryData(acceptedQueryKey, context.previousAccepted);
    },
    onSettled: () => invalidateAll(),
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiService.patch(`/directory/friend-requests/${requestId}`, { action: 'reject' });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).map((r) => (r.id === requestId ? { ...r, status: 'rejected' as const } : r))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(receivedQueryKey, context.previous);
    },
    onSettled: () => invalidateAll(),
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      // `dismiss`, et non un `DELETE` à part : `cancel` est le geste de
      // l'ÉMETTEUR, `dismiss` celui de l'une ou l'autre partie — ce que
      // l'ancienne route acceptait sans distinguer.
      await apiService.patch(`/directory/friend-requests/${requestId}`, { action: 'dismiss' });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: sentQueryKey });
      const previousSent = queryClient.getQueryData<FriendRequest[]>(sentQueryKey);
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      const previousReceived = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      await queryClient.cancelQueries({ queryKey: acceptedQueryKey });
      const previousAccepted = queryClient.getQueryData<FriendRequest[]>(acceptedQueryKey);
      queryClient.setQueryData<FriendRequest[]>(sentQueryKey, (old) =>
        (old ?? []).filter((r) => r.id !== requestId)
      );
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).filter((r) => r.id !== requestId)
      );
      queryClient.setQueryData<FriendRequest[]>(acceptedQueryKey, (old) =>
        (old ?? []).filter((r) => r.id !== requestId)
      );
      return { previousSent, previousReceived, previousAccepted };
    },
    onError: (_err, _id, context) => {
      if (context?.previousSent) queryClient.setQueryData(sentQueryKey, context.previousSent);
      if (context?.previousReceived) queryClient.setQueryData(receivedQueryKey, context.previousReceived);
      if (context?.previousAccepted) queryClient.setQueryData(acceptedQueryKey, context.previousAccepted);
    },
    onSettled: () => invalidateAll(),
  });

  const sendRequest = useCallback(
    async (receiverId: string, message?: string) => {
      await sendMutation.mutateAsync({ receiverId, message });
    },
    [sendMutation]
  );

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await acceptMutation.mutateAsync(requestId);
    },
    [acceptMutation]
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      await rejectMutation.mutateAsync(requestId);
    },
    [rejectMutation]
  );

  const cancelRequest = useCallback(
    async (requestId: string) => {
      await cancelMutation.mutateAsync(requestId);
    },
    [cancelMutation]
  );

  const getPendingRequestWithUser = useCallback(
    (userId: string): FriendRequest | undefined => {
      return pending.find(
        (req) =>
          (req.senderId === userId || req.receiverId === userId) &&
          (currentUserId
            ? req.senderId === currentUserId || req.receiverId === currentUserId
            : true)
      );
    },
    [pending, currentUserId]
  );

  return {
    received,
    sent,
    connected,
    pending,
    refused,
    allRequests,
    stats,
    isLoading: isLoadingReceived || isLoadingSent,
    error: receivedError?.message ?? sentError?.message ?? null,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    getPendingRequestWithUser,
    refresh: invalidateAll,
  };
}
