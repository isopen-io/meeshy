import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { conversationStore } from '@/lib/conversation-store';
import { performSend, retrySend, type Draft } from '@/lib/send/perform-send';
import { outboxStore } from '@/lib/send/outbox-store';
import type { RowActionId } from '@/lib/view/row-actions';

import { ApiError } from './client';
import { performRowAction } from './conversation-actions';
import { conversationQuery, conversationsQuery, refreshConversations } from './conversations';
import { apiDeps } from './deps';
import { FEED_QUERY_KEY, feedQuery, refreshFeed } from './feed';
import { performPostGesture, type PostGestureResult } from './feed-gestures';
import type { FeedAuthor, FeedInfiniteData } from './feed-pages';
import { recordPostShare } from './feed-share';
import { commentsInfiniteOptions, performComment, type CommentResult } from './publication-comments';
import { postQueryOptions } from './publication-detail';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { paginationStateOf } from '@/lib/lens/pagination';
import type { Conversation, Message, Participant } from './types';
import { messagesQuery } from './messages';
import { appQueryClient } from './query-client';
import { performReaction, type PerformReactionResult } from './reactions';
import {
  STORIES_QUERY_PREFIX,
  STORY_TRAY_QUERY_KEY,
  markStoryViewed,
  statusMoodsQueryOptions,
  storyFeedQueryOptions,
  storyPostQueryOptions,
  storyTrayQueryOptions,
} from './stories';
import { performStoryReaction, viewerReactedToStory, type StoryReactionResult } from './story-reactions';
import { storyViewedStore } from './story-viewed-store';

/**
 * `useConversations` (#6195) — `useInfiniteQuery` : la Lentille défile
 * au-delà de la première page serveur (§0 de la spécification). `.data` est
 * APLATI par `select` (`flattenConversationPages`) ; `.hasNextPage` /
 * `.isFetchingNextPage` / `.isFetchNextPageError` alimentent
 * `paginationStateOf` (`lib/lens/pagination.ts`) côté écran.
 */
export function useConversations() {
  return useInfiniteQuery(conversationsQuery(apiDeps));
}

/**
 * `useConversationsSnapshot` — LA LISTE POUR UN AUTRE ÉCRAN (#5650,
 * revue-correction) : la MÊME fabrique, le MÊME cache, la MÊME clé — mais
 * `enabled: false`, donc JAMAIS de requête. Un écran qui n'est pas la liste
 * (le fil et son compteur « non lus ailleurs ») en OBSERVE le contenu et se
 * re-rend quand il change, au lieu d'en prendre un instantané figé par
 * `queryClient.getQueryData()` au premier rendu — un instantané pris sur un
 * cache encore vide (lien direct vers `/c/:id`) ne se remplissait jamais, et
 * une conversation marquée lue ailleurs gardait son compte pour toujours.
 */
export function useConversationsSnapshot(): readonly Conversation[] | undefined {
  return useInfiniteQuery({ ...conversationsQuery(apiDeps), enabled: false }).data;
}

/**
 * `refreshListAction` (#6195) — RÉFÉRENCE DE MODULE STABLE (motif
 * `rowAction` ci-dessous) : le tirer-pour-rafraîchir de la Lentille. Les
 * conversations (page 1 seule, `refreshConversations`) ET les stories/humeurs
 * (`STORIES_QUERY_PREFIX`, une invalidation qui couvre les DEUX clés) partent
 * EN PARALLÈLE — miroir des quatre travaux `async let` d'iOS (`:1638-1642`),
 * réduits à ce que la v3.1 sert réellement (Q9/Q10, § 1.8 de la
 * spécification). Un échec des conversations PROPAGE (c'est
 * `usePullToRefresh` qui le traduit en `completing failed`) ; l'invalidation
 * des stories ne rejette jamais (`invalidateQueries` ne lève pas).
 */
export function refreshListAction(): Promise<void> {
  return Promise.all([
    refreshConversations(appQueryClient, apiDeps),
    appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX }),
  ]).then(() => undefined);
}

/**
 * **LE RAIL DE STORIES** (#6080) — même adaptateur, même `apiDeps`, donc la
 * même règle de source : fixtures ou passerelle, résolu à la CONSTRUCTION.
 *
 * `staleTime` de 60 s : une story vit vingt heures et le plateau n'a
 * aucune raison d'être refetché à chaque retour sur la liste. Au-delà, c'est
 * le socket qui doit prévenir — issue compagnon, comme pour les messages.
 */
export function useStoryTray() {
  return useQuery({ ...storyTrayQueryOptions(apiDeps), staleTime: 60_000 });
}

/**
 * **LE CORPUS DES HUMEURS** (#5652) — même `apiDeps`, même règle de source
 * que `useStoryTray`, un corpus DISTINCT (`?scope=statuses`, jamais
 * `stories`). Même `staleTime` : une humeur, comme une story, vit une
 * fenêtre courte (une heure — `PostType.STATUS`, `schema.prisma`) et n'a
 * aucune raison d'être refetchée à chaque retour sur la liste.
 */
export function useStatusMoods() {
  return useQuery({ ...statusMoodsQueryOptions(apiDeps), staleTime: 60_000 });
}

/**
 * **LE CORPUS COMPLET DU LECTEUR DE STORIES** (#5817) — même adaptateur,
 * même `apiDeps` que `useStoryTray`. `staleTime: 0` (contrairement au
 * plateau) : le lecteur doit voir une vue tout juste marquée par une AUTRE
 * fenêtre/onglet dès sa prochaine ouverture — cache-first (le rendu part du
 * cache existant sans jamais poser de spinner dessus), mais sans figer une
 * minute de fraîcheur sur un corpus qui change à chaque `markStoryViewed`.
 */
export function useStoryFeed() {
  return useQuery({ ...storyFeedQueryOptions(apiDeps), staleTime: 0 });
}

/**
 * **LA TROISIÈME MARCHE, CÔTÉ ÉCRAN** (#5817, revue-correction, défaut 4) —
 * `enabled` uniquement quand le corpus principal EST arrivé et n'y contient
 * pas la story ciblée (`stories.ts#loadStoryPost`, doc-comment). `retry:
 * false` : un 404 est un VERDICT (D-6, aucun oracle d'existence), jamais une
 * panne réseau à réessayer.
 */
export function useStoryPost(postId: string, options: { readonly enabled: boolean }) {
  return useQuery({ ...storyPostQueryOptions({ ...apiDeps, postId }), enabled: options.enabled, retry: false, staleTime: 0 });
}

/**
 * `markStoryViewedAction` (#5817) — RÉFÉRENCE DE MODULE STABLE (motif
 * `rowAction`), en TROIS temps dont l'ordre est la moitié du travail :
 *
 * 1. **L'AVANCE OPTIMISTE, tout de suite** (`storyViewedStore`) — l'anneau de
 *    la tuile s'éteint à l'instant où la story s'affiche, pas au retour du
 *    réseau (§ Optimistic Updates). C'est le SEUL retour visible du geste
 *    « j'ai regardé » : sans lui, l'anneau s'éteint « tout seul », plus tard.
 * 2. l'appel réel (`POST /posts/:postId/view`), dont l'échec est AVALÉ — un
 *    accusé de lecture perdu n'a jamais mérité de toast, iOS le journalise
 *    sans le montrer (`StoryViewModel+Viewing.swift:120-166`).
 * 3. l'invalidation du **PLATEAU SEUL** (`STORY_TRAY_QUERY_KEY`), jamais du
 *    préfixe entier.
 *
 * **Pourquoi pas le préfixe** (revue-correction) : `STORIES_QUERY_PREFIX`
 * couvre AUSSI `STORY_FEED_QUERY_KEY`, le corpus que le lecteur est en train
 * de LIRE — et il a un observateur actif, à `staleTime: 0`. L'invalider
 * relançait donc une requête de 50 posts À CHAQUE story affichée, et surtout
 * reclassait les groupes sous le lecteur (le rang dépend de `hasUnseen`, que
 * la lecture fait basculer) : arrivé au bout d'un auteur, `nextPosition` ne
 * trouvait plus de groupe suivant et FERMAIT le lecteur au lieu de passer à
 * l'auteur d'après. Le plateau, lui, n'a aucun observateur pendant la lecture
 * — l'invalidation le marque périmé et il repart frais au retour.
 */
export function markStoryViewedAction(postId: string): Promise<void> {
  storyViewedStore.getState().markViewed(postId);
  return markStoryViewed({ ...apiDeps, postId })
    .catch(() => undefined)
    .then(() => appQueryClient.invalidateQueries({ queryKey: STORY_TRAY_QUERY_KEY }))
    .then(() => undefined);
}

/**
 * `useFeed` (#5893) — `useInfiniteQuery` : le fil des publications défile
 * au-delà de la première page serveur, même motif que `useConversations`.
 * `.data` est APLATI par `select` (`flattenFeedPages`).
 */
export function useFeed() {
  return useInfiniteQuery(feedQuery(apiDeps));
}

/**
 * `refreshFeedAction` (#5893) — RÉFÉRENCE DE MODULE STABLE (motif
 * `refreshListAction`) : le tirer-pour-rafraîchir du fil. Page 1 seule,
 * curseur remis à zéro — jamais l'invalidation du préfixe `STORIES_QUERY_PREFIX`,
 * un corpus DISTINCT que le fil ne montre pas.
 */
export function refreshFeedAction(): Promise<void> {
  return refreshFeed(appQueryClient, apiDeps);
}

/**
 * `postGestureAction` (#6278) — RÉFÉRENCE DE MODULE STABLE, motif
 * `reactAction` : aimer et enregistrer une publication du fil, liés à
 * l'instance PARTAGÉE `appQueryClient` — le cache que `useFeed` observe est
 * celui que le geste bascule.
 */
export function postGestureAction(postId: string, kind: PostToggleKind): Promise<PostGestureResult> {
  return performPostGesture({ postId, kind, deps: { ...apiDeps, queryClient: appQueryClient } });
}

/** `recordShareAction` (#6278) — RÉFÉRENCE DE MODULE STABLE : compter un
 * partage DÉJÀ parti, sur l'instance partagée du cache du fil. */
export function recordShareAction(postId: string): Promise<boolean> {
  return recordPostShare({ postId, deps: { ...apiDeps, queryClient: appQueryClient } });
}

/**
 * `usePost` (#6278) — le détail d'une publication, CACHE D'ABORD : ouvert
 * depuis le fil, il se peint AVEC la carte déjà reçue (`initialData`, datée
 * du fil pour que `staleTime: 0` la revalide en fond) — jamais un squelette
 * sur une publication que l'écran précédent affichait. Ouvert par un lien
 * direct, le cache est vide et le squelette est juste. `retry: false` : un
 * 404 est un VERDICT (D-6), pas une panne à réessayer.
 */
export function usePost(postId: string) {
  return useQuery({
    ...postQueryOptions({ ...apiDeps, postId }),
    initialData: () =>
      appQueryClient
        .getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)
        ?.pages.flatMap((page) => page.posts)
        .find((post) => post.id === postId),
    initialDataUpdatedAt: () => appQueryClient.getQueryState(FEED_QUERY_KEY)?.dataUpdatedAt,
    staleTime: 0,
    retry: false,
  });
}

export function useConversation(id: string) {
  const queryClient = useQueryClient();
  return useQuery(conversationQuery(apiDeps, id, { queryClient }));
}

/**
 * `useMessages` (#6972) — `useInfiniteQuery` : le fil charge les messages plus
 * ANCIENS à l'approche du haut, par `before=<id de message>` (§ Critère de fin
 * 1 de l'issue). Avant ce lot c'était un `useQuery` SIMPLE sur `?limit=50`,
 * sans `initialPageParam`, sans `getNextPageParam`, et `nextCursor` — la
 * moitié utile du curseur — était jeté : **une conversation de plus de 50
 * messages était définitivement tronquée.** Le dépôt le savait
 * (`decisions.md:2030` : « La sentinelle est GÉNÉRIQUE, et le fil la
 * copiera ») ; la moitié liste (#6195 / D-44) avait été livrée, la moitié fil
 * jamais.
 *
 * `.data` est APLATI par `select` (`flattenMessagePages`) ; `.hasNextPage` /
 * `.isFetchingNextPage` / `.isFetchNextPageError` alimentent
 * `paginationStateOf` — la MÊME loi à quatre cas que la Lentille
 * (`lib/lens/pagination.ts`), lue côté écran.
 */
export function useMessages(id: string) {
  return useInfiniteQuery(messagesQuery(apiDeps, id));
}

/** Référence STABLE — un `[]` écrit en ligne change d'identité à chaque
 * rendu, ce qui défait `useMemo([threadData.messages])`, `place()` et toute
 * la mémoïsation du fil virtualisé (`routes/thread.tsx` § `placed`). */
const NO_MESSAGES: readonly Message[] = [];

export type ThreadDataStatus = 'pending' | 'success' | 'refused' | 'error';

function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/**
 * `useThreadData` — compose les DEUX requêtes du fil. `status: 'refused'`
 * (D-6) dès que L'UNE des deux porte un `ApiError` 403/404 — un id qui
 * n'existe pas OU dont le lecteur n'est pas membre rend le MÊME refus,
 * jamais le contenu d'une autre conversation (F8 : plus de repli sur
 * `CONVERSATIONS[0]`).
 *
 * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — LE paramètre
 * de route n'est qu'un moyen de CHARGER (`GET /conversations/:id`, qui
 * accepte « ID or identifier », `core-detail.ts:250`) : la passerelle
 * NORMALISE tout identifiant lisible en ObjectId AVANT de diffuser quoi que
 * ce soit (`normalizeConversationId`, `MeeshySocketIOManager.ts:2879`), donc
 * `message:new`/`conversation:updated`/`message:translation` portent
 * TOUJOURS l'ObjectId — jamais l'identifiant de la route. Clé le fil sur le
 * paramètre de route AVANT que `conversation.data` n'arrive (rien à perdre,
 * la passerelle résout aussi les deux formes pour `GET …/messages`), puis
 * BASCULE sur `conversation.data.id` dès qu'il est connu : un lien direct
 * `/c/<identifiant>` recevait alors ses temps réel sur une clé de cache que
 * PERSONNE ne lisait, le fil ouvert restant muet et la Lentille ne se
 * réordonnant jamais. Un lien déjà canonique (le cas nominal, navigation
 * depuis la Lentille) ne change pas de clé : `conversation.data.id === id`,
 * aucune requête de plus.
 */
export function useThreadData(id: string) {
  const conversation = useConversation(id);
  const conversationId = conversation.data?.id ?? id;
  const messages = useMessages(conversationId);

  const error = conversation.error ?? messages.error ?? null;
  const refused = isRefusal(conversation.error) || isRefusal(messages.error);
  const failed = conversation.isError || messages.isError;
  const ready = conversation.data !== undefined && messages.data !== undefined;

  const status: ThreadDataStatus = refused ? 'refused' : failed ? 'error' : ready ? 'success' : 'pending';

  return {
    conversationId,
    conversation: conversation.data,
    messages: messages.data?.messages ?? NO_MESSAGES,
    /**
     * `hasOlder` — « le serveur DÉCLARE-T-IL du plus ancien ? », lu sur la
     * page qui borde la fenêtre (`threadWindowOf`, `messages-pages.ts`).
     * JAMAIS `hasNextPage`, qui répond à l'autre question — « peut-on en
     * demander davantage sans boucler ? » — et qui tombe à faux dès qu'un
     * refus anti-boucle s'applique, alors que l'historique, lui, existe
     * toujours. Son lecteur est `windowCoversUnread` (« Sur les N derniers
     * messages » du Résumé Vivant, `routes/thread.tsx`).
     */
    hasOlder: messages.data?.hasOlder ?? false,
    /** L'état de pagination du HAUT du fil, quatre cas, la MÊME loi que la
     * Lentille (`paginationStateOf`, `lib/lens/pagination.ts`) — dérivé des
     * drapeaux de TanStack, jamais tenu à part. */
    olderState: paginationStateOf({
      hasNextPage: messages.hasNextPage,
      isFetchingNextPage: messages.isFetchingNextPage,
      isFetchNextPageError: messages.isFetchNextPageError,
    }),
    /** `fetchNextPage` de TanStack — référence STABLE entre deux rendus
     * (`useInfiniteQuery` la mémoïse), ce que l'ancrage de `routes/thread.tsx`
     * exige pour ne pas recréer sa sentinelle à chaque image. */
    fetchOlder: messages.fetchNextPage,
    status,
    error,
    refetch: (): void => {
      void conversation.refetch();
      void messages.refetch();
    },
    /**
     * `typing` A DISPARU D'ICI (#5793) — c'était un BOOLÉEN DE SOURCE
     * (`apiConfig.source === 'fixtures'`), jamais une donnée : il valait
     * `true` en fixtures quel que soit ce qui se passait, `false` en
     * gateway quoi qu'il arrive. La frappe RÉELLE vit désormais dans
     * `typing-store.ts`, alimenté par `api/socket.ts` (`typing:start`/
     * `typing:stop`) et lu par `useTypists()` (`api/use-typists.ts`) —
     * `routes/thread.tsx` la consomme directement, ce hook n'a plus à la
     * transporter.
     */
  };
}

/**
 * `rowAction` — RÉFÉRENCE DE MODULE STABLE (jamais recréée), ce que
 * `LensRow` (`memo`) exige (`conversations.tsx:31-40`). Liée aux instances
 * PARTAGÉES du magasin optimiste et du client de requêtes.
 */
export function rowAction(conversationId: string, action: RowActionId): void {
  void performRowAction({
    conversationId,
    action,
    deps: { ...apiDeps, store: conversationStore, queryClient: appQueryClient },
  });
}

/**
 * `sendAction`/`retrySendAction` (#5813, étape 6) — RÉFÉRENCES DE MODULE
 * STABLES, motif `rowAction` ci-dessus : liées aux instances PARTAGÉES
 * (`appQueryClient`, `outboxStore`) et à `apiDeps` (la SEULE résolution de
 * `apiConfig.source`, `./deps.ts`). `online` est REÇU — ce module n'appelle
 * pas `useOnline()` (un hook), c'est `use-send.ts` qui le fournit.
 */
export function sendAction(params: {
  readonly conversationId: string;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, draft, viewerId, sender, online } = params;
  return performSend({
    conversationId,
    draft,
    viewerId,
    ...(sender === undefined ? {} : { sender }),
    deps: { ...apiDeps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

export function retrySendAction(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, clientMessageId, online } = params;
  return retrySend({
    conversationId,
    clientMessageId,
    deps: { ...apiDeps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

/**
 * `reactAction` (#5814) — RÉFÉRENCE DE MODULE STABLE, motif `rowAction` :
 * liée à l'instance PARTAGÉE `appQueryClient`. Le SITE UNIQUE que le menu du
 * message (`message-menu.tsx`) et son hôte (`routes/thread.tsx`) appellent —
 * jamais une seconde écriture du plan optimiste.
 */
export function reactAction(conversationId: string, messageId: string, emoji: string): Promise<PerformReactionResult> {
  return performReaction({ conversationId, messageId, emoji, deps: { ...apiDeps, queryClient: appQueryClient } });
}

/**
 * `useComments` (#6278 suite) — le fil de commentaires d'UNE publication,
 * `useInfiniteQuery` comme le Flux. `.data` reste PAGINÉ (pas de `select`) :
 * l'insertion optimiste de `performComment` écrit dans les pages, et un
 * `select` qui aplatit ne changerait rien pour elle mais obligerait chaque
 * hôte à reconnaître deux formes. L'aplatissement se fait au rendu, par
 * `flattenCommentPages` — le site unique.
 *
 * `enabled` : une story qui n'a pas encore ouvert son panneau ne charge pas
 * son fil. Le compteur du rail vient du corpus, jamais d'une requête.
 */
export function useComments(postId: string, options?: { readonly enabled?: boolean }) {
  return useInfiniteQuery({
    ...commentsInfiniteOptions({ ...apiDeps, postId }),
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}

/**
 * `commentAction` — RÉFÉRENCE DE MODULE STABLE (motif `reactAction`) : le
 * SITE UNIQUE d'envoi d'un commentaire, lié à l'instance PARTAGÉE
 * `appQueryClient`. La liste de `/post/$post` et le panneau du lecteur de
 * story écrivent donc dans le MÊME cache — le commentaire posé depuis une
 * story apparaît dans le détail de la publication sans relecture.
 */
export function commentAction(params: {
  readonly postId: string;
  readonly content: string;
  readonly author: FeedAuthor;
  readonly originalLanguage?: string | undefined;
}): Promise<CommentResult> {
  return performComment({
    postId: params.postId,
    content: params.content,
    author: params.author,
    ...(params.originalLanguage === undefined ? {} : { originalLanguage: params.originalLanguage }),
    deps: { ...apiDeps, queryClient: appQueryClient },
  });
}

/**
 * `storyReactionAction` — RÉFÉRENCE DE MODULE STABLE (motif `reactAction`) :
 * réagir à la story lue, sur l'instance PARTAGÉE `appQueryClient` — le corpus
 * que `useStoryFeed` observe est celui que le geste bascule, donc le cœur du
 * rail se remplit sans qu'aucun état local n'ait à s'en souvenir.
 */
export function storyReactionAction(storyId: string, emoji?: string): Promise<StoryReactionResult> {
  return performStoryReaction({
    storyId,
    ...(emoji === undefined ? {} : { emoji }),
    deps: { ...apiDeps, queryClient: appQueryClient },
  });
}

/** Ai-je réagi à cette story ? Lu du MÊME cache que le geste bascule. */
export function viewerReactedToStoryNow(storyId: string, emoji?: string): boolean {
  return viewerReactedToStory(appQueryClient, storyId, emoji);
}
