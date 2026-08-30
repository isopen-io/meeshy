/**
 * Hook de messages utilisant React Query avec pagination infinie
 * Drop-in replacement pour useConversationMessages
 *
 * Utilise les services existants:
 * - conversationsService.getMessages() pour les utilisateurs authentifiés
 * - AnonymousChatService.loadMessages() pour les utilisateurs anonymes (via linkId)
 */

'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useQueryClient, useInfiniteQuery, focusManager } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { conversationsService } from '@/services/conversations.service';
import { apiService } from '@/services/api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { AnonymousChatService } from '@/services/anonymous-chat.service';
import { useConversationUIStore } from '@/stores/conversation-ui-store';
import { messagesService } from '@/services/conversations/messages.service';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
import type { Message, User } from '@meeshy/shared/types';
import type { OptimisticMessage } from '@/utils/optimistic-message';
export type { OptimisticMessage } from '@/utils/optimistic-message';

function isOptimisticMessage(m: Message): m is OptimisticMessage {
  return '_tempId' in m;
}

export interface ConversationMessagesRQOptions {
  limit?: number;
  enabled?: boolean;
  threshold?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  scrollDirection?: 'up' | 'down';
  disableAutoFill?: boolean;
  linkId?: string; // Pour les utilisateurs anonymes via liens partagés
}

export interface ConversationMessagesRQReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Message) => boolean;
  updateMessage: (messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => void;
  removeMessage: (messageId: string) => void;
  addOptimisticMessage: (message: Message & { _localStatus: string; _tempId: string }) => void;
  replaceOptimisticMessage: (tempId: string, serverMessage: Message) => void;
  markMessageFailed: (tempId: string) => void;
  removeOptimisticMessage: (tempId: string) => void;
}

const CATCH_UP_PAGE_LIMIT = 50;
const CATCH_UP_MAX_PAGES = 5;
// The server reads `after` as a STRICT `createdAt >` filter. Two messages can
// land in the same millisecond, so anchoring exactly on the newest cached
// timestamp would make a twin unreachable by every future catch-up. Reaching
// back one millisecond turns the window inclusive; the id-based dedup already
// discards the boundary message when it comes back.
const WATERMARK_INCLUSIVE_MARGIN_MS = 1;
const FOCUS_CATCH_UP_DEBOUNCE_MS = 1_000;

// Instance du service anonyme (créée à la demande)
let anonymousChatServiceInstance: AnonymousChatService | null = null;

function getAnonymousChatService(linkId: string): AnonymousChatService {
  if (!anonymousChatServiceInstance) {
    anonymousChatServiceInstance = new AnonymousChatService();
  }
  anonymousChatServiceInstance.initialize(linkId);
  return anonymousChatServiceInstance;
}

/**
 * Fonction pour récupérer les messages via les services existants
 */
export async function fetchMessagesFromService(
  conversationId: string,
  pageParam: number | string,
  limit: number,
  linkId?: string,
  signal?: AbortSignal
): Promise<{ messages: Message[]; hasMore: boolean; total: number; nextCursor?: string | null }> {
  if (linkId) {
    // Utilisateur anonyme via lien partagé - utiliser AnonymousChatService
    const service = getAnonymousChatService(linkId);
    const page = typeof pageParam === 'number' ? pageParam : 1;
    const offset = (page - 1) * limit;
    const result = await service.loadMessages(limit, offset);

    return {
      messages: result.messages || [],
      hasMore: result.hasMore || false,
      total: result.total || 0,
    };
  } else {
    // Utilisateur authentifié - utiliser conversationsService
    const cursor = typeof pageParam === 'string' ? pageParam : null;
    const page = typeof pageParam === 'number' ? pageParam : 1;
    const result = await conversationsService.getMessages(conversationId, page, limit, cursor, signal);

    return {
      messages: result.messages || [],
      hasMore: result.hasMore || false,
      total: result.total || 0,
      nextCursor: result.cursorPagination?.nextCursor,
    };
  }
}

type MessagesPage = { messages: Message[]; hasMore: boolean; total: number; nextCursor?: string | null };
type InfiniteMessagesData = { pages: MessagesPage[]; pageParams: unknown[] };

function clientMessageIdOf(message: Message): string | null {
  const asRecord = message as Message & { clientMessageId?: string; _tempId?: string };
  return asRecord.clientMessageId ?? asRecord._tempId ?? null;
}

/**
 * Re-reading the newest page REPLACES it in the infinite cache. Two classes of
 * locally-known messages are not (yet) in that server page and must survive:
 * messages delivered by Socket.IO that the REST read cannot see yet (replica
 * lag / read-after-write), and optimistic messages still in flight. Anything
 * older than the server page is authoritative server state and is dropped as
 * usual, so deletions still propagate.
 */
export function mergePendingLocalMessages(
  serverMessages: Message[],
  cached: InfiniteMessagesData | undefined
): Message[] {
  if (!cached) return serverMessages;

  const serverIds = new Set(serverMessages.map((m) => m.id));
  const serverClientIds = new Set(
    serverMessages.map(clientMessageIdOf).filter((id): id is string => !!id)
  );
  const newestServerMs = serverMessages.reduce((max, m) => {
    const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  const preserved = cached.pages.flatMap((page) => page.messages).filter((m) => {
    if (serverIds.has(m.id)) return false;
    const clientId = clientMessageIdOf(m);
    if (clientId && serverClientIds.has(clientId)) return false;
    if (isOptimisticMessage(m)) return true;
    const createdMs = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    return createdMs > newestServerMs;
  });

  return preserved.length > 0 ? [...preserved, ...serverMessages] : serverMessages;
}

/** Un identifiant de conversation RÉSOLU — 24 hex. Un slug (« meeshy ») n'en est pas un. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export function useConversationMessagesRQ(
  conversationId: string | null,
  currentUser: User | null,
  options: ConversationMessagesRQOptions = {}
): ConversationMessagesRQReturn {
  const {
    limit = 20,
    enabled = true,
    threshold = 100,
    containerRef,
    scrollDirection = 'up',
    disableAutoFill = false,
    linkId,
  } = options;

  const queryClient = useQueryClient();
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const initialScrollDoneRef = useRef<boolean>(false);

  // Query key unique selon le mode (authentifié ou via lien)
  const queryKey = useMemo(() => {
    if (linkId) {
      return [...queryKeys.messages.infinite(conversationId ?? ''), 'link', linkId];
    }
    return queryKeys.messages.infinite(conversationId ?? '');
  }, [conversationId, linkId]);

  // Utiliser useInfiniteQuery avec les services
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1, signal }) => {
      const page = await fetchMessagesFromService(conversationId!, pageParam, limit, linkId, signal);
      // Only the newest page (initial page param) can be contradicted by
      // locally-known messages; older pages are pure history.
      if (pageParam !== 1) return page;
      const cached = queryClient.getQueryData<InfiniteMessagesData>(queryKey);
      return { ...page, messages: mergePendingLocalMessages(page.messages, cached) };
    },
    initialPageParam: 1 as number | string,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      // Chemin anonyme (lien partagé) : AnonymousChatService.loadMessages(limit, offset)
      // pagine par offset numérique et ne renvoie jamais de cursor. On avance donc par
      // index de page. Renvoyer un ID de message (string) ici le ferait retomber sur la
      // page 1 (offset 0) dans fetchMessagesFromService (`typeof pageParam === 'number' ? … : 1`),
      // re-chargeant la première page en boucle — doublons + historique ancien inaccessible.
      // Ce rang est POSITIONNEL : il ne regarde pas le contenu des pages. C'est
      // pourquoi `addMessage` refuse de semer une page locale sur ce chemin —
      // elle prendrait le rang 1 et ferait sauter la vraie première page.
      if (linkId) return allPages.length + 1;
      // Chemin authentifié : préférer le cursor renvoyé par le serveur…
      if (lastPage.nextCursor) return lastPage.nextCursor;
      // …sinon dériver un cursor "before" depuis le dernier message (le plus ancien, tri DESC).
      // Le gateway accepte un message ID comme paramètre "before".
      const lastMessage = lastPage.messages[lastPage.messages.length - 1];
      if (lastMessage?.id) return lastMessage.id;
      return undefined;
    },
    enabled: enabled && !!conversationId,
    // Ouvrir une conversation relit TOUJOURS la dernière page côté serveur.
    // Le client global tourne en `staleTime: Infinity` + `refetchOnMount: false`
    // (Socket.IO est la source temps réel) ; sans cette dérogation, une page
    // servie par le cache pouvait rester affichée indéfiniment et un message
    // manquant ne réapparaissait jamais, même après plusieurs F5.
    // Le refetch n'est plus destructeur : `queryFn` refusionne les messages
    // locaux que la lecture REST ne voit pas encore (socket + optimistes).
    refetchOnMount: 'always',
    // Focus / reconnexion restent servis par le catch-up incrémental
    // (`syncNewerMessages`), moins coûteux qu'un refetch complet des pages.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      messages: data.pages.flatMap((page) => page.messages),
    }),
  });

  // Extraire les messages depuis les pages et les trier
  const messages = useMemo(() => {
    if (!data?.messages) return [];

    // Tri DESC par createdAt (plus récent en premier)
    // Le composant MessagesDisplay inverse l'ordre pour l'affichage.
    // Départage déterministe par id quand deux messages partagent le même
    // timestamp (même milliseconde) : sans cela l'ordre relatif est instable
    // entre deux rendus et React réconcilie/permute des cellules pour rien.
    return data.messages
      .map((message) => ({ message, timestamp: new Date(message.createdAt).getTime() }))
      .sort((a, b) => {
        if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
        return a.message.id < b.message.id ? 1 : a.message.id > b.message.id ? -1 : 0;
      })
      .map(({ message }) => message);
  }, [data?.messages]);

  // Front montant de la reconnexion socket, compté UNE fois pour les deux
  // rattrapages qui en dépendent : les MESSAGES manqués (« Trigger 1 » plus bas)
  // et les ACCUSÉS manqués (le lot REST juste en dessous). Chacun détectait —
  // ou, pour les accusés, ne détectait PAS — ce front pour son compte.
  const { isSocketConnected } = useConnectionStatus();
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const prevSocketConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    const prev = prevSocketConnectedRef.current;
    prevSocketConnectedRef.current = isSocketConnected;
    // Front false → true seulement : pas au montage initial.
    if (prev === false && isSocketConnected === true) {
      setReconnectEpoch((epoch) => epoch + 1);
    }
  }, [isSocketConnected]);

  // Track latest own message + batch fetch read statuses for own messages
  const batchFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !currentUser?.id || messages.length === 0) return;

    const ownMessages = messages.filter(msg => {
      const senderId = getSenderUserId(msg.sender as Record<string, unknown>) ?? (msg.sender as any)?.id;
      return senderId === currentUser.id;
    });

    if (ownMessages.length === 0) return;

    // Messages sorted DESC — first own message is the latest
    const store = useConversationUIStore.getState();
    store.setLatestOwnMessageId(conversationId, ownMessages[0].id);

    // Batch fetch read statuses for own messages (once per conversation load)
    // Use ObjectId from loaded messages, not the raw identifier/slug
    //
    // `reconnectEpoch` fait partie de la clé : sans lui, le lot ne se relance
    // que lorsque le DERNIER message à soi change, c'est-à-dire quand on ENVOIE.
    // Or ces compteurs sont MONOTONES depuis le cycle 85 (`isStaleReceipt`) —
    // un `read-status:updated` manqué pendant une coupure n'est pas une valeur
    // en retard qu'un événement suivant corrigerait, c'est un GEL PERMANENT :
    // l'expéditeur garde une coche « remis » sur un message déjà lu, jusqu'à ce
    // qu'il en envoie un autre. La reconnexion est le seul instant qui sache
    // qu'un trou a pu se produire ; le lot s'y rejoue, comme le catch-up des
    // messages.
    const resolvedConvId = ownMessages[0]?.conversationId ?? conversationId;
    const fetchKey = `${resolvedConvId}:${ownMessages[0].id}:${reconnectEpoch}`;
    if (batchFetchedRef.current === fetchKey) return;
    if (!/^[a-f\d]{24}$/i.test(resolvedConvId)) return;
    batchFetchedRef.current = fetchKey;

    // Filter out optimistic/temporary IDs (e.g. cid_*) — the gateway
    // schema only accepts 24-char hex MongoDB ObjectIds and rejects the
    // whole request otherwise.
    const ownMessageIds = ownMessages
      .map(m => m.id)
      .filter(id => /^[a-f\d]{24}$/i.test(id))
      .slice(0, 50);
    if (ownMessageIds.length === 0) return;
    messagesService.getReadStatuses(resolvedConvId, ownMessageIds)
      .then(statusMap => {
        const batch: Record<string, { totalMembers: number; deliveredCount: number; readCount: number }> = {};
        for (const [msgId, status] of Object.entries(statusMap)) {
          batch[msgId] = {
            totalMembers: status.totalMembers,
            deliveredCount: status.receivedCount,
            readCount: status.readCount,
          };
        }
        if (Object.keys(batch).length > 0) {
          useConversationUIStore.getState().updateMessageReadStatusBatch(batch);
        }
      })
      .catch(() => {});
  }, [conversationId, currentUser?.id, messages, reconnectEpoch]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Refresh function
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Clear messages - invalider le cache
  const clearMessages = useCallback(() => {
    if (conversationId) {
      queryClient.removeQueries({
        queryKey: queryKeys.messages.infinite(conversationId),
      });
    }
    initialScrollDoneRef.current = false;
  }, [queryClient, conversationId]);

  // Add message to cache
  //
  // UN CACHE ABSENT N'EST PAS UN CACHE À JOUR.
  //
  // `addMessage` est l'UNIQUE écrivain socket des écrans servis par
  // `BubbleStreamPage` (`/`, `/chat/:linkId`). Il sortait sur `if (!old) return
  // old;` — c'est-à-dire qu'un `message:new` arrivé PENDANT la lecture initiale
  // (requête REST en vol, cache encore vide) était jeté, silencieusement et pour
  // toute la session : la couche socket a déjà marqué l'id « vu » pendant 5
  // minutes, donc aucune re-livraison ne répare le trou, et `staleTime: Infinity`
  // n'ira jamais relire le serveur de lui-même.
  //
  // POURQUOI SEMER (option a) PLUTÔT QUE SEULEMENT REVALIDER (option b) —
  // la question a été tranchée par ce que le serveur SAIT, pas par le confort :
  // à l'instant où ce message arrive par socket, la lecture REST en vol ne le
  // contient pas (c'est précisément pourquoi il est arrivé par socket ; le
  // read-after-write d'un réplica ne le rend pas non plus). Revalider, c'est
  // redemander au serveur une chose qu'il ne peut pas encore rendre : la requête
  // repart, revient sans le message, et le message est perdu exactement comme
  // avant. Seule une écriture LOCALE le préserve.
  //
  // POURQUOI LA PAGE SEMÉE NE CREUSE PAS DE TROU DANS L'HISTORIQUE — le risque
  // de l'option (a) est de fabriquer une page que la pagination croirait
  // COMPLÈTE. La page semée porte donc `hasMore: true` : elle ne prétend rien.
  // Et quand la lecture initiale réussit, `mergePendingLocalMessages` — écrit
  // dans ce fichier pour EXACTEMENT cette classe de message (« delivered by
  // Socket.IO that the REST read cannot see yet ») — préserve le message semé
  // au moment où la page serveur remplace la graine.
  //
  // CE QUI PRÉCÈDE NE VAUT QUE SUR LE CHEMIN AUTHENTIFIÉ, et le dire vaguement
  // a coûté un trou d'historique. `getNextPageParam` a DEUX branches, pas une :
  //   • authentifié — pagination par CURSEUR : le rang suivant se dérive du
  //     DERNIER message de la page (« before <id> »). Une page semée d'un seul
  //     message rend le curseur `<id du message semé>` ; le serveur sert alors
  //     tout ce qui le précède. Rien n'est sauté, et c'est ce qui rend la
  //     graine sûre ici.
  //   • anonyme (`/chat/:linkId`) — pagination par NUMÉRO de page
  //     (`AnonymousChatService.loadMessages(limit, offset)`) : le rang suivant
  //     est `allPages.length + 1`, une POSITION, qui ignore le contenu des
  //     pages. Une graine y occuperait le rang 1 et la suite partirait à
  //     l'offset `limit` : la vraie première page du serveur ne serait JAMAIS
  //     demandée. On ne sème donc pas sur ce chemin — voir la garde dans
  //     `addMessage`.
  //
  // L'option (b) reste, en second rideau et bornée : si AUCUNE lecture n'est en
  // vol (la lecture initiale a échoué, ou s'est terminée sans jamais peupler le
  // cache), on redemande l'historique au serveur, faute de quoi la graine
  // resterait seule à l'écran. Quand une lecture EST en vol, on ne la dérange
  // pas : elle va atterrir et fusionner la graine.
  //
  // Sur le chemin anonyme, (b) n'est pas un second rideau : c'est le SEUL. Rien
  // n'y étant semé, la relecture — lancée tout de suite au repos, notée en
  // DETTE et soldée à l'atterrissage quand une lecture est en vol — est ce qui
  // rattrape le message. Elle repart vers un serveur qui a persisté le message
  // AVANT de le diffuser : c'est ce qui la rend suffisante ici, là où sur le
  // chemin authentifié seule l'écriture locale l'était.
  /** Une relecture DUE, notée pendant qu'une lecture était en vol. */
  const relectureDueRef = useRef(false);

  useEffect(() => {
    if (isFetching || !relectureDueRef.current) return;
    relectureDueRef.current = false;
    void queryClient.invalidateQueries({ queryKey });
  }, [isFetching, queryClient, queryKey]);

  const addMessage = useCallback((message: Message): boolean => {
    if (!conversationId) return false;

    let wasAdded = false;
    let wasSeeded = false;
    let besoinDeRevalider = false;

    queryClient.setQueryData<InfiniteMessagesData>(
      queryKey,
      (old) => {
        if (!old) {
          // PAGINATION PAR NUMÉRO : semer y COÛTE UN RANG DE PAGE.
          //
          // Sur le chemin anonyme, `getNextPageParam` rend `allPages.length + 1`
          // — une POSITION, pas un curseur. La graine prendrait le rang 1 alors
          // qu'elle ne porte qu'un message venu du socket, et la lecture
          // suivante partirait à l'offset `limit` : les `limit` premières lignes
          // du serveur deviendraient inatteignables (`staleTime: Infinity` ne
          // les redemande jamais de lui-même).
          //
          // « Semer sans consommer de rang » n'existe pas ici : la seule façon
          // de ne pas sauter la première page serait de la REdemander à
          // l'offset 0 — et le message semé y apparaîtrait alors DEUX fois,
          // rien ne dédupliquant entre pages (`select` fait un `flatMap` nu).
          // Un rang de page est positionnel ; une graine n'a pas de position.
          //
          // Faute de curseur, on ne sème pas — on REVALIDE, exactement comme
          // sur un écran clé-é par slug juste en dessous. Le message est alors
          // rattrapé par la relecture, qui interroge un serveur ayant, lui,
          // déjà persisté le message avant de le diffuser.
          if (linkId) {
            besoinDeRevalider = true;
            return old;
          }

          // ATTRIBUTION VÉRIFIABLE, ou pas de graine.
          //
          // La graine ne peut être filtrée par PERSONNE en aval : le seul filtre
          // du produit (`bubble-stream-page`, « different conversation ») est
          // gardé par `currentConversationObjectId`, encore null tant que la
          // lecture initiale n'a pas atterri — c'est EXACTEMENT la fenêtre que
          // la graine vise. Semer sans vérifier afficherait sur l'accueil le
          // message d'une AUTRE conversation.
          //
          // Une clé d'écran peut être un SLUG (`/` est monté sur « meeshy »)
          // tandis que le fil porte des ObjectId : sur un cache vide il n'y a
          // aucun message d'où tirer la résolution (le motif l'est déjà plus
          // haut, « Use ObjectId from loaded messages, not the raw slug »).
          // Faute de pouvoir attribuer, on ne sème pas — on REVALIDE une fois
          // la lecture en vol retombée : elle repart alors vers un serveur qui
          // a, lui, déjà persisté le message.
          const attribuable =
            OBJECT_ID_RE.test(conversationId) && message.conversationId === conversationId;
          if (!attribuable) {
            besoinDeRevalider = true;
            return old;
          }
          wasAdded = true;
          wasSeeded = true;
          return {
            pages: [{ messages: [message], hasMore: true, total: 0 }],
            pageParams: [1],
          };
        }

        // ID-only dedup — no content-based matching
        for (const page of old.pages) {
          for (const m of page.messages) {
            if (m.id === message.id) return old;
          }
        }

        wasAdded = true;

        return {
          ...old,
          pages: old.pages.map((page, index) =>
            index === 0
              ? { ...page, messages: [message, ...page.messages] }
              : page
          ),
        };
      }
    );

    // Une lecture EN VOL n'est pas dérangée : au repos on relance tout de suite,
    // sinon on note la DETTE et l'effet ci-dessous la solde dès que la lecture
    // retombe. Sans ce report, un message non attribuable arrivé pendant la
    // lecture initiale — le cas le plus fréquent, puisque c'est justement
    // pourquoi il est arrivé par socket — n'était JAMAIS rattrapé : la garde
    // seule aurait été une perte sèche.
    if (wasSeeded || besoinDeRevalider) {
      if (queryClient.getQueryState(queryKey)?.fetchStatus === 'idle') {
        queryClient.invalidateQueries({ queryKey });
      } else {
        relectureDueRef.current = true;
      }
    }

    return wasAdded;
  }, [queryClient, conversationId, queryKey, linkId]);

  // Update message in cache
  const updateMessage = useCallback((
    messageId: string,
    updates: Partial<Message> | ((prev: Message) => Message)
  ) => {
    if (!conversationId) return;

    queryClient.setQueryData(
      queryKey,
      (old: typeof data) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            messages: page.messages.map(msg => {
              if (msg.id === messageId) {
                return typeof updates === 'function'
                  ? updates(msg)
                  : { ...msg, ...updates };
              }
              return msg;
            }),
          })),
        };
      }
    );
  }, [queryClient, conversationId, queryKey]);

  // Remove message from cache
  const removeMessage = useCallback((messageId: string) => {
    if (!conversationId) return;

    queryClient.setQueryData(
      queryKey,
      (old: typeof data) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            messages: page.messages.filter(msg => msg.id !== messageId),
          })),
        };
      }
    );
  }, [queryClient, conversationId, queryKey]);

  // Gestion du scroll infini
  useEffect(() => {
    if (!enabled || !containerRef?.current) return;

    const container = containerRef.current;

    const handleScroll = () => {
      if (isFetchingNextPage || !hasNextPage) return;

      // Ne pas charger avant que le scroll initial ne soit effectué
      if (!initialScrollDoneRef.current && scrollDirection === 'up') return;

      const { scrollTop, scrollHeight, clientHeight } = container;

      // Vérifier qu'il y a eu un mouvement significatif
      const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
      if (scrollDelta < 10) return;

      lastScrollTopRef.current = scrollTop;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        if (clientHeight >= scrollHeight || scrollHeight <= clientHeight + threshold) {
          return;
        }

        let shouldLoadMore = false;

        if (scrollDirection === 'up') {
          shouldLoadMore = scrollTop <= threshold;
        } else {
          const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
          shouldLoadMore = distanceFromBottom <= threshold;
        }

        if (shouldLoadMore) {
          loadMore();
        }
      }, 30);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, containerRef, isFetchingNextPage, hasNextPage, threshold, scrollDirection, loadMore]);

  // Reset scroll flag on conversation change
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  // Mark scroll as done after initial load
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      const timer = setTimeout(() => {
        initialScrollDoneRef.current = true;
      }, scrollDirection === 'up' ? 500 : 0);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isLoading, scrollDirection]);

  // Fetch initial read status summary when conversation messages load
  // Calls mark-as-received to trigger a socket event with the real summary counts
  const hasLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !currentUser || isLoading || messages.length === 0) return;
    // Resolve real ObjectId from loaded messages (conversationId param may be an identifier/slug)
    const resolvedId = messages[0]?.conversationId ?? conversationId;
    if (hasLoadedRef.current === resolvedId) return;
    if (!/^[a-f\d]{24}$/i.test(resolvedId)) return;
    hasLoadedRef.current = resolvedId;

    // Mark-as-received triggers a read-status:updated socket event with summary
    apiService.post(API_ENDPOINTS.conversations.byConversationIdMarkAsReceived(resolvedId))
      .catch(() => {}); // Non-critical
  }, [conversationId, currentUser, isLoading, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill if container not full enough
  useEffect(() => {
    if (disableAutoFill || isLoading || isFetchingNextPage || !hasNextPage || !containerRef?.current) {
      return;
    }

    const checkAndLoadMore = () => {
      if (!containerRef.current || isFetchingNextPage || !hasNextPage) return;

      const { scrollHeight, clientHeight } = containerRef.current;
      if (scrollHeight <= clientHeight + 50 && hasNextPage) {
        loadMore();
      }
    };

    const timeoutId = setTimeout(checkAndLoadMore, 500);
    return () => clearTimeout(timeoutId);
  }, [disableAutoFill, messages.length, isLoading, isFetchingNextPage, hasNextPage, loadMore, containerRef]);

  // Optimistic message support
  const addOptimisticMessage = useCallback((message: Message & { _localStatus: string; _tempId: string }) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page, index) =>
          index === 0 ? { ...page, messages: [message, ...page.messages] } : page
        ),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  const replaceOptimisticMessage = useCallback((tempId: string, serverMessage: Message) => {
    if (!conversationId) return;
    // Own-message invariant: server response must preserve senderId consistency
    if (currentUser && serverMessage.senderId !== currentUser.id) {
      console.warn('[replaceOptimisticMessage] senderId mismatch — server:', serverMessage.senderId, 'user:', currentUser.id);
    }
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.map(m =>
            isOptimisticMessage(m) && m._tempId === tempId ? serverMessage : m
          ),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey, currentUser]);

  const markMessageFailed = useCallback((tempId: string) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.map(m =>
            isOptimisticMessage(m) && m._tempId === tempId ? { ...m, _localStatus: 'failed' as const } : m
          ),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  const removeOptimisticMessage = useCallback((tempId: string) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.filter(m => !(isOptimisticMessage(m) && m._tempId === tempId)),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  // Non-destructive catch-up: fetch only messages newer than the newest cached
  // entry (`after` watermark) and prepend the genuinely-new ones. A full refetch()
  // REPLACES the cached pages and can drop socket-added messages (see the
  // refetchOnWindowFocus: false comment above) — this path never does that,
  // except as a last-resort fallback when the gap exceeds CATCH_UP_MAX_PAGES pages.
  const syncInFlightRef = useRef(false);

  const syncNewerMessages = useCallback(async () => {
    if (!conversationId || linkId || syncInFlightRef.current) return;

    const cached = queryClient.getQueryData<typeof data>(queryKey);
    if (!cached) return;

    const newestCreatedAtMs = (messages: Message[]): number =>
      messages.reduce((max, m) => {
        const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);

    // The watermark is a SERVER clock reading. An optimistic message is stamped
    // with the local clock at compose time, so including it would ask for
    // messages newer than "now on this device" and silently skip everything
    // peers sent during the gap — and composing while disconnected is exactly
    // what puts an optimistic message in the cache when the catch-up runs.
    const serverConfirmed = (messages: Message[]): Message[] =>
      messages.filter(m => !isOptimisticMessage(m));

    let watermarkMs = newestCreatedAtMs(serverConfirmed(cached.pages.flatMap(p => p.messages)));

    if (watermarkMs === 0) {
      // Nothing server-confirmed to read forward from (a conversation whose only
      // content was composed offline). The full read is the sole catch-up left,
      // and `mergePendingLocalMessages` keeps the pending sends alive through it.
      syncInFlightRef.current = true;
      try {
        await refetch();
      } catch {
        // Silent — socket events will carry new messages going forward
      } finally {
        syncInFlightRef.current = false;
      }
      return;
    }

    syncInFlightRef.current = true;
    try {
      for (let iteration = 0; iteration < CATCH_UP_MAX_PAGES; iteration++) {
        const after = new Date(watermarkMs - WATERMARK_INCLUSIVE_MARGIN_MS).toISOString();
        const result = await conversationsService.getMessages(
          conversationId, 1, CATCH_UP_PAGE_LIMIT, null, undefined, after
        );
        const missed = result.messages ?? [];
        if (missed.length === 0) return;

        const current = queryClient.getQueryData<typeof data>(queryKey);
        if (!current) return;

        const cachedIds = new Set(current.pages.flatMap(p => p.messages.map(m => m.id)));
        const genuinelyNew = missed.filter(m => !cachedIds.has(m.id));

        // A dropped send ACK is precisely what a disconnection loses. The server
        // copy carries the `clientMessageId` we generated, so it must REPLACE the
        // still-pending optimistic entry instead of sitting next to it — otherwise
        // the sender sees their own message twice until the next cold load.
        const confirmedClientIds = new Set(
          missed.map(clientMessageIdOf).filter((id): id is string => !!id)
        );
        const reconcilesPending = current.pages.some(page =>
          page.messages.some(m => isOptimisticMessage(m) && confirmedClientIds.has(m._tempId))
        );

        if (genuinelyNew.length > 0 || reconcilesPending) {
          queryClient.setQueryData(queryKey, (old: typeof data) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page, i) => {
                const kept = reconcilesPending
                  ? page.messages.filter(
                      m => !(isOptimisticMessage(m) && confirmedClientIds.has(m._tempId))
                    )
                  : page.messages;
                const untouched = kept.length === page.messages.length;
                if (i !== 0) return untouched ? page : { ...page, messages: kept };
                if (untouched && genuinelyNew.length === 0) return page;
                return { ...page, messages: [...genuinelyNew, ...kept] };
              }),
            };
          });
        }

        // Le serveur fait autorité, et lui seul. Le mode `after` lit une ligne
        // SONDE (`limit + 1`) et rend un `hasMore` MESURÉ : une page pleine qui
        // clôt la fenêtre annonce `false`. Le `|| missed.length === LIMIT` qui
        // doublait cette réponse était une seconde ESTIMATION, reproduisant
        // côté client le défaut « page pleine = forcément tronquée » corrigé
        // côté serveur — un aller-retour HTTP par rattrapage tombant pile sur
        // la frontière de page, à chaque reconnexion socket et chaque retour de
        // focus. Sûr dans les deux sens pendant un déploiement : un gateway
        // antérieur annonce `true` sur cette même page, donc la boucle se
        // comporte au pire comme avant.
        if (result.hasMore !== true) return;

        const newestFetchedMs = newestCreatedAtMs(missed);
        if (newestFetchedMs <= watermarkMs) break;
        watermarkMs = newestFetchedMs;
      }
      await refetch();
    } catch {
      // Silent — socket events will carry new messages going forward
    } finally {
      syncInFlightRef.current = false;
    }
  }, [conversationId, linkId, queryClient, queryKey, refetch]);

  // Trigger 1 — socket reconnect: catch up on messages missed during the
  // disconnection gap. Le front false → true est compté une seule fois, en tête
  // du hook (`reconnectEpoch`), et partagé avec le rattrapage des ACCUSÉS —
  // deux dettes distinctes d'un même instant. `epoch === 0` = aucun front
  // survenu depuis le montage.
  useEffect(() => {
    if (reconnectEpoch === 0) return;
    void syncNewerMessages();
  }, [reconnectEpoch, syncNewerMessages]);

  // Trigger 3 — OUVERTURE d'une conversation.
  //
  // Une note vivait ici, disant qu'il n'y avait « volontairement PAS de
  // catch-up au montage : ouvrir une conversation relit désormais la dernière
  // page côté serveur (`refetchOnMount: 'always'`) ». Son raisonnement était
  // juste ; sa PRÉMISSE est fausse chez son hôte, et c'est ce qui a coûté des
  // messages manquants à l'ouverture d'une conversation.
  //
  // `refetchOnMount` n'est lu qu'à la SOUSCRIPTION de l'observateur. Or
  // `ConversationLayout` ne se démonte JAMAIS entre deux conversations : la
  // route est un catch-all et la sélection se fait par état local avec
  // `window.history.replaceState`. Changer de conversation n'est donc qu'un
  // changement de `queryKey`, qui passe par `shouldFetchOptionally` → `isStale`
  // → `isStaleByTime(Infinity)` = FAUX. Rien n'est relu. Le fil servait le
  // cache tel quel pendant que la liste, elle, était réparée par le delta sur
  // reconnexion et focus — d'où « la liste a le dernier message, le fil ne l'a
  // pas ».
  //
  // La seconde objection de la note — « les deux lectures se concurrenceraient »
  // — est désamorcée PAR CONSTRUCTION : `syncNewerMessages` sort si le cache
  // est absent, et c'est exactement le seul cas où le refetch de souscription
  // part. Les deux gardes sont disjointes.
  //
  // On saute le PREMIER passage, et ce n'est pas une optimisation : au tout
  // premier montage l'observateur SE SOUSCRIT, donc `refetchOnMount: 'always'`
  // lit déjà le serveur. Y ajouter un rattrapage ferait deux lectures pour un
  // seul geste. Ce que la souscription ne couvre PAS — et qui est le défaut
  // rapporté — c'est le CHANGEMENT de conversation à hôte monté : là, aucune
  // souscription neuve, donc aucune lecture.
  //
  // DÉPENDANCES : `conversationId` SEUL, jamais `messages` ni `data`. Le
  // rattrapage ÉCRIT dans le cache : l'y faire dépendre boucle sans fin.
  const conversationPrecedenteRef = useRef<string | null>(null);
  useEffect(() => {
    const precedente = conversationPrecedenteRef.current;
    conversationPrecedenteRef.current = conversationId;
    if (precedente === null || precedente === conversationId) return;
    if (!enabled || !conversationId || linkId) return;
    void syncNewerMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, enabled, linkId]);

  // Trigger 2 — window focus: safety net replacing the destructive
  // refetchOnWindowFocus (disabled above). Debounced so rapid tab switches
  // coalesce into one catch-up.
  useEffect(() => {
    if (!enabled || !conversationId || linkId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = focusManager.subscribe((focused) => {
      if (!focused) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void syncNewerMessages();
      }, FOCUS_CATCH_UP_DEBOUNCE_MS);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [enabled, conversationId, linkId, syncNewerMessages]);

  return {
    messages,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error?.message ?? null,
    loadMore,
    refresh,
    clearMessages,
    addMessage,
    updateMessage,
    removeMessage,
    addOptimisticMessage,
    replaceOptimisticMessage,
    markMessageFailed,
    removeOptimisticMessage,
  };
}
