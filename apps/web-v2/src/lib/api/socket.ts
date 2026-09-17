import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type {
  AuthSessionRevokedEventData,
  AuthTokenExpiredEventData,
} from '@meeshy/shared/types/socketio-events/auth';
import type { TypingActionData, TypingEvent } from '@meeshy/shared/types/socketio-events/presence';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory } from '@/lib/net/socket';
import type { OutboxState } from '@/lib/send/outbox-store';
import { applyMediaCaptionTranslation, applyPostToggle, applyServedCount, type MediaCaptionTranslationUpdate } from '@/lib/feed/interactions';
import { decodeNotification } from '@/lib/notifications/record';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData } from './feed-pages';
import { FRIENDS_QUERY_PREFIX } from './friends-keys';
import { NOTIFICATIONS_QUERY_KEY } from './notifications';
import {
  applyNotificationCounts,
  applyNotificationDeleted,
  applyNotificationDeletedBulk,
  applyNotificationNew,
  applyNotificationRead,
  applyNotificationReadBulk,
} from './notifications-realtime';
import {
  applyConversationUnreadUpdated,
  applyConversationUpdated,
  applyMessageNew,
  applyMessageTranslation,
  isConversationUnreadUpdated,
  isConversationUpdated,
  isMessageTranslationEvent,
  isSocketMessage,
} from './realtime-apply';
import { STORY_TRAY_QUERY_KEY } from './stories';
import { TYPING_SAFETY_TIMEOUT_MS, type TypingStoreApi } from './typing-store';

/**
 * LA CONNEXION TEMPS RÉEL (#5793) — UN socket par session (miroir
 * `MessageSocketManager.shared`, § 1.1 de la spécification), la RÈGLE
 * (reconnexion, dédoublonnage de frappe, application au cache) branchée sur
 * un `SocketClient` INJECTABLE (`net/socket.ts`) : jamais un vrai
 * `socket.io-client` dans ce fichier — c'est ce qui rend ce module
 * témoignable sans réseau (`socket.test.ts`).
 *
 * Ce que ce module NE FAIT PAS : `conversation:join`.
 * `AuthHandler._joinUserConversations` (`AuthHandler.ts:855-890`) rejoint
 * TOUTES les rooms de participation à l'authentification elle-même — aucun
 * événement client n'est nécessaire (§ 1.4 point 3 de la spécification).
 */

function isTypingEvent(payload: unknown): payload is TypingEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.userId === 'string' && typeof p.conversationId === 'string' && typeof p.username === 'string';
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** `PostLikedEventData` / `PostUnlikedEventData` (`@meeshy/shared/types/post`),
 * réduits aux trois champs que le fil lit — validés, jamais crus sur parole. */
type PostLikeEvent = { readonly postId: string; readonly userId: string; readonly likeCount: number };

function isPostLikeEvent(payload: unknown): payload is PostLikeEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.postId === 'string' && typeof p.userId === 'string' && isFiniteNumber(p.likeCount);
}

/** `PostBookmarkedEventData` — PERSONNEL (émis aux seuls sockets de l'auteur
 * du geste), donc `bookmarked` décrit toujours le lecteur. */
type PostBookmarkEvent = { readonly postId: string; readonly bookmarked: boolean; readonly bookmarkCount?: number };

function isPostBookmarkEvent(payload: unknown): payload is PostBookmarkEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.postId === 'string' &&
    typeof p.bookmarked === 'boolean' &&
    (p.bookmarkCount === undefined || isFiniteNumber(p.bookmarkCount))
  );
}

/** `MediaCaptionTranslationUpdatedEventData` (`@meeshy/shared/types/post`,
 * #6280), réduite aux champs que `applyMediaCaptionTranslation` consomme —
 * `postId`/`commentId` ne servent qu'au ROUTAGE serveur (ZMQ, audience) :
 * la fusion côté cache retrouve le média par `mediaId`, quel que soit le
 * document (post ou commentaire) qui le porte. `commentId` n'est donc PAS
 * relu ici : un média de commentaire n'a jamais d'entrée dans `FEED_QUERY_KEY`,
 * `applyMediaCaptionTranslation` ne trouve rien à fusionner et ne modifie
 * rien, sans lever. */
function isMediaCaptionTranslationEvent(payload: unknown): payload is MediaCaptionTranslationUpdate {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.mediaId !== 'string' || typeof p.language !== 'string') return false;
  if (typeof p.translation !== 'object' || p.translation === null) return false;
  const t = p.translation as Record<string, unknown>;
  return (
    typeof t.text === 'string' &&
    typeof t.translationModel === 'string' &&
    typeof t.createdAt === 'string' &&
    (t.confidenceScore === undefined || isFiniteNumber(t.confidenceScore))
  );
}

export type RealtimeSessionInfo = {
  readonly token: string;
  readonly sessionToken: string;
};

export type RealtimeDeps = {
  readonly base: string;
  readonly socketFactory: SocketFactory;
  readonly queryClient: QueryClient;
  readonly typing: TypingStoreApi;
  readonly conversationStore: StoreApi<ConversationStoreState>;
  /** L'OUTBOX (D-28) — `applyMessageNew` y PROMEUT l'entrée en vol dont
   * l'écho porte le `clientMessageId` : sans elle, le fil rendrait DEUX lignes
   * pour un même message (la rangée optimiste vit dans l'outbox, jamais dans la
   * page du cache — `realtime-apply.ts` § `applyMessageNew`). */
  readonly outbox: StoreApi<OutboxState>;
  /** Résolu à CHAQUE événement (jamais figé à la construction) : l'identité
   * du lecteur peut changer sous une connexion qui vit (rare, mais un
   * appelant qui figerait cette valeur romprait le filtre « jamais soi-même »
   * sans qu'aucun test ne le voie). */
  readonly viewerId: () => string;
  /** Le MÊME geste qu'un 401 HTTP (`api/client.ts` § `onUnauthorized`) —
   * `auth:token-expired`/`auth:session-revoked` en sont l'équivalent socket
   * (§ 1.1/3.1 de la spécification : pas de rafraîchissement ce lot, D-26). */
  readonly onClearSession: () => void;
  /** Horloge INJECTABLE (motif `perform-send.ts`) — jamais `Date.now()` lu
   * directement, pour que le témoin d'expiration soit déterministe. */
  readonly now?: () => number;
  /** Le MINUTEUR DE SÉCURITÉ (`typingSafetyTimeout`, 15 s, miroir
   * `ConversationSocketHandler.swift:1490-1492`) est possédé ICI — ce
   * module a l'horloge de la connexion à offrir, `typing-store.ts` reste un
   * réducteur pur (motif `outbox-store.ts`/`perform-send.ts`). INJECTABLE
   * pour que `socket.test.ts` déclenche l'expiration SANS attendre 15 s
   * réelles : un témoin capture `(fn, ms)` et appelle `fn()` lui-même. */
  readonly scheduleTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
  /** `window` INJECTABLE — un témoin `bun:test` n'a pas de DOM ; `undefined`
   * désactive proprement le rebranchement sur `online` (§ 1.4 de la
   * spécification : « `online` ⇒ `connect()` immédiat si déconnecté »). */
  readonly windowTarget?: {
    addEventListener(type: 'online', listener: () => void): void;
    removeEventListener(type: 'online', listener: () => void): void;
  };
};

export type RealtimeConnection = {
  readonly socket: SocketClient;
  /** `typing:start`/`typing:stop` — émis vers le SEUL canal que la
   * passerelle accueille (§ 3.3 de la spécification). No-op côté réception :
   * la passerelle ne renvoie jamais ceci à son propre émetteur. */
  emitTyping(conversationId: string, isTyping: boolean): void;
  /** Démonte TOUS les écouteurs, ANNULE tout minuteur de sécurité en attente,
   * puis déconnecte — appelé quand la session redevient `anonymous`
   * (`api/realtime.ts`). */
  destroy(): void;
};

function defaultWindow(): RealtimeDeps['windowTarget'] {
  return typeof window === 'undefined' ? undefined : window;
}

export function createRealtimeConnection(session: RealtimeSessionInfo, deps: RealtimeDeps): RealtimeConnection {
  const now = deps.now ?? Date.now;
  const scheduleTimeout = deps.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const windowTarget = deps.windowTarget ?? defaultWindow();

  const socket = deps.socketFactory({
    base: deps.base,
    auth: { token: session.token, sessionToken: session.sessionToken },
  });

  /** Un minuteur de SÉCURITÉ par (conversation, frappeur) — REMIS À ZÉRO à
   * chaque `typing:start` du MÊME frappeur (miroir iOS, doc-comment ci-
   * dessus), ANNULÉ dès que `typing:stop` arrive en premier. */
  const typingTimers = new Map<string, unknown>();
  /** Le séparateur est ÉCHAPPÉ (`\u0000`), jamais le caractère NUL écrit tel
   * quel dans la source (revue #5652) : un octet nul fait classer le fichier
   * BINAIRE par git — `git diff` rendait « Binary files differ » sur le module
   * le plus sensible du lot, donc plus aucune revue de son diff, et `grep` le
   * saute par défaut. Valeur d'exécution identique. */
  const typingKey = (conversationId: string, userId: string): string => `${conversationId}\u0000${userId}`;

  const armTypingSafetyTimeout = (conversationId: string, userId: string): void => {
    const key = typingKey(conversationId, userId);
    const existing = typingTimers.get(key);
    if (existing !== undefined) clearTimeoutFn(existing);
    typingTimers.set(
      key,
      scheduleTimeout(() => {
        typingTimers.delete(key);
        deps.typing.getState().stop(conversationId, userId);
      }, TYPING_SAFETY_TIMEOUT_MS),
    );
  };

  const disarmTypingSafetyTimeout = (conversationId: string, userId: string): void => {
    const key = typingKey(conversationId, userId);
    const existing = typingTimers.get(key);
    if (existing === undefined) return;
    clearTimeoutFn(existing);
    typingTimers.delete(key);
  };

  /**
   * `message:new` RÉTRACTE la frappe de SON AUTEUR (#6171, G2) — miroir
   * `ConversationListViewModel.swift:992-1013` : « l'arrivée du message est
   * la preuve la plus forte que la frappe est terminée … il ne retire que
   * CET auteur et laisse les autres frappeurs en place ». La règle vit ICI
   * (`api/socket.ts`), pas dans `realtime-apply.ts` : la seconde est PURE sur
   * le cache et ne connaît pas le magasin de frappe (D-40) — ne pas lui
   * donner une dépendance de plus.
   *
   * DEUX ESPACES D'IDS (doc `conversation.ts:210-226`) : `senderId` porte un
   * `Participant.id`, `sender.userId` un `User.id` — le magasin de frappe est
   * indexé par `userId` (`typing:start`, `TypingEvent.userId`), donc les DEUX
   * candidats sont retirés, dédoublonnés. `stop` est IDEMPOTENT
   * (`typing-store.ts:56-67`) : un candidat qui ne tapait pas ne coûte rien.
   */
  const onMessageNew = (payload: unknown): void => {
    if (!isSocketMessage(payload)) return;
    applyMessageNew(deps.queryClient, deps.outbox, payload);

    const candidates = new Set([payload.senderId, payload.sender?.userId].filter((id): id is string => id !== undefined));
    for (const userId of candidates) {
      disarmTypingSafetyTimeout(payload.conversationId, userId);
      deps.typing.getState().stop(payload.conversationId, userId);
    }
  };

  const onTypingStart = (payload: unknown): void => {
    if (!isTypingEvent(payload)) return;
    if (payload.userId === deps.viewerId()) return; // jamais soi-même (iOS `:971-975`).
    deps.typing.getState().start(
      payload.conversationId,
      { userId: payload.userId, displayName: payload.displayName ?? payload.username },
      now(),
    );
    armTypingSafetyTimeout(payload.conversationId, payload.userId);
  };

  const onTypingStop = (payload: unknown): void => {
    if (!isTypingEvent(payload)) return;
    if (payload.userId === deps.viewerId()) return;
    disarmTypingSafetyTimeout(payload.conversationId, payload.userId);
    deps.typing.getState().stop(payload.conversationId, payload.userId);
  };

  const onUnreadUpdated = (payload: unknown): void => {
    if (!isConversationUnreadUpdated(payload)) return;
    applyConversationUnreadUpdated(deps.queryClient, deps.conversationStore, payload);
  };

  /** `conversation:updated` (revue-correction #5793, défaut 1) — la
   * QUATRIÈME famille du Prisme (résolue SERVEUR) : PRIME sur ce que
   * `onMessageNew` a déduit, voir le doc-comment de `applyConversationUpdated`. */
  const onConversationUpdated = (payload: unknown): void => {
    if (!isConversationUpdated(payload)) return;
    applyConversationUpdated(deps.queryClient, payload);
  };

  /** `message:translation` (revue-correction #5793, défaut 2) — le pipeline
   * traduit APRÈS la création ; voir le doc-comment de
   * `applyMessageTranslation`. */
  const onMessageTranslation = (payload: unknown): void => {
    if (!isMessageTranslationEvent(payload)) return;
    applyMessageTranslation(deps.queryClient, payload);
  };

  /**
   * `story:*` (#5652, bloc E ; #6080) — LE RAIL SUIT LE FIL EN DIRECT :
   * `story:created`/`story:updated`/`story:deleted`/`story:viewed` invalident
   * `STORY_TRAY_QUERY_KEY`. Miroir du motif `onAuthenticated` ci-dessous : UNE
   * invalidation par famille, jamais une reconstruction locale du corpus
   * depuis la charge de l'événement — `groupStoriesByAuthor`
   * (`lib/view/story-tray.ts`) reste le SEUL site qui sait regrouper des
   * stories par auteur (D-14), un événement isolé ne porte qu'UNE story,
   * jamais le groupe entier.
   */
  const onStoryChanged = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: STORY_TRAY_QUERY_KEY });
  };

  /**
   * `post:liked` / `post:unliked` / `post:bookmarked` (#6278, D-47) — LE FIL
   * SUIT LES GESTES EN DIRECT, par les DEUX mêmes fonctions pures que
   * l'optimiste (`lib/feed/interactions.ts`). Le compte diffusé est ABSOLU et
   * remplace l'estimation ; « aimé par moi » ne bascule que pour un geste du
   * LECTEUR (un autre de ses appareils) — le « j'aime » d'un autre ne remplit
   * jamais son cœur. Miroir `FeedView.swift:1331-1357`.
   */
  const updateFeed = (update: (data: FeedInfiniteData | undefined) => FeedInfiniteData | undefined): void => {
    deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, update);
  };

  const onPostLikeChanged =
    (on: boolean) =>
    (payload: unknown): void => {
      if (!isPostLikeEvent(payload)) return;
      const { postId, likeCount } = payload;
      const byViewer = payload.userId === deps.viewerId();
      updateFeed((data) =>
        applyServedCount(byViewer ? applyPostToggle(data, { postId, kind: 'like', on }) : data, {
          postId,
          kind: 'like',
          count: likeCount,
        }),
      );
    };
  const onPostLiked = onPostLikeChanged(true);
  const onPostUnliked = onPostLikeChanged(false);

  const onPostBookmarked = (payload: unknown): void => {
    if (!isPostBookmarkEvent(payload)) return;
    const { postId, bookmarked, bookmarkCount } = payload;
    updateFeed((data) => {
      const toggled = applyPostToggle(data, { postId, kind: 'bookmark', on: bookmarked });
      return bookmarkCount === undefined ? toggled : applyServedCount(toggled, { postId, kind: 'bookmark', count: bookmarkCount });
    });
  };

  /**
   * `media:caption-translation-updated` (#6280) — LA LÉGENDE D'UN MÉDIA DU
   * FIL SUIT LE PIPELINE ZMQ EN DIRECT, même motif que `post:liked` ci-dessus :
   * une fonction pure (`applyMediaCaptionTranslation`, `lib/feed/interactions.ts`)
   * appliquée à `FEED_QUERY_KEY`. `updateFeed` retrouve le média par id, quelle
   * que soit la page qui le porte (`flattenFeedPages` garde la PREMIÈRE
   * occurrence d'un post servi deux fois — la fusion doit donc viser TOUTES
   * les pages, pas seulement la première, ce que `applyMediaCaptionTranslation`
   * fait déjà via `mapPosts`).
   */
  const onMediaCaptionTranslationUpdated = (payload: unknown): void => {
    if (!isMediaCaptionTranslationEvent(payload)) return;
    updateFeed((data) => applyMediaCaptionTranslation(data, payload));
  };

  /**
   * `notification:*` (#6288) — LA CLOCHE SUIT LA PASSERELLE SANS RELIRE : les
   * règles vivent dans `notifications-realtime.ts`, ces lignes les branchent.
   *
   * Le DÉDOUBLONNAGE de `notification:new` vit ICI, sur la connexion : une
   * notification dont aucune liste n'est en cache (cloche jamais ouverte) ne
   * peut pas être reconnue par le cache, et le compte l'avancerait à chaque
   * rediffusion. La mémoire est BORNÉE — une session longue ne doit rien
   * retenir d'autre que les derniers identifiants vus.
   */
  const seenNotifications = new Set<string>();
  const SEEN_NOTIFICATIONS_CAP = 200;
  const onNotificationNew = (payload: unknown): void => {
    const notification = decodeNotification(payload);
    if (notification === null || seenNotifications.has(notification.id)) return;
    seenNotifications.add(notification.id);
    if (seenNotifications.size > SEEN_NOTIFICATIONS_CAP) {
      const oldest = seenNotifications.values().next().value;
      if (oldest !== undefined) seenNotifications.delete(oldest);
    }
    applyNotificationNew(deps.queryClient, notification);
  };
  const onNotificationRead = (payload: unknown): void => applyNotificationRead(deps.queryClient, payload);
  const onNotificationReadBulk = (payload: unknown): void => applyNotificationReadBulk(deps.queryClient, payload);
  const onNotificationDeleted = (payload: unknown): void => applyNotificationDeleted(deps.queryClient, payload);
  const onNotificationDeletedBulk = (payload: unknown): void => applyNotificationDeletedBulk(deps.queryClient, payload);
  const onNotificationCounts = (payload: unknown): void => applyNotificationCounts(deps.queryClient, payload);

  /**
   * `friend-request:*` (#6321) — LES DEMANDES D'AMITIÉ SUIVENT LA PASSERELLE :
   * une demande reçue, annulée par son auteur, acceptée ou refusée par l'autre
   * partie invalide la famille `['friends']` — le panier des reçues que la
   * pastille du barreau « Découvrir » compte, les envoyées, les contacts, les
   * bloqués. Une invalidation plutôt qu'une écriture locale : la charge ne
   * porte que des identifiants (`FriendRequestNewEventData`), jamais la ligne
   * à peindre ni le nom de la personne.
   */
  const onFriendshipChanged = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
  };

  /**
   * `conversation:new` (#6799) — UNE CONVERSATION QUI N'EST PAS ENCORE DANS LE
   * CACHE. `patchConversation` ne touche qu'une page qui porte DÉJÀ la ligne
   * (`conversations.ts:172-188`) : sans ce handler, un premier DM reçu, un
   * ajout à un groupe ou un DM réinitié laissait le `message:new` suivant
   * patcher le VIDE, en silence — l'aperçu n'apparaissait qu'au prochain
   * rechargement complet (`staleTime` 30 s, `refetchOnWindowFocus`), d'où le
   * symptôme « le dernier message ne remonte pas NÉCESSAIREMENT ».
   *
   * INVALIDER plutôt qu'écrire la ligne, pour la même raison que
   * `onFriendshipChanged` ci-dessus : la charge ne porte que des identifiants.
   * `ConversationNewEventData` est MINIMALE par contrat — ni dernier message,
   * ni participants complets — et son doc-comment renvoie à
   * `/conversations/:id`. Une ligne fabriquée depuis cette charge afficherait
   * un direct SANS NOM : le titre d'un DM se déduit de ses participants.
   *
   * La passerelle l'émet à TROIS sites (`core-lifecycle.ts:239` et `:410`,
   * `participants-writes.ts:420`) et le legacy l'écoutait déjà
   * (`presence.service.ts:150`) : ce câblage restaure une PARITÉ, il n'ouvre
   * pas un périmètre.
   */
  const onConversationNew = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  };

  /** Le MÊME geste qu'un 401 HTTP (§ doc-comment de `RealtimeDeps`) — les
   * DEUX motifs ferment la session, aucun ne tente de rafraîchir (D-26). */
  const onTokenExpired = (_payload: AuthTokenExpiredEventData): void => deps.onClearSession();
  const onSessionRevoked = (_payload: AuthSessionRevokedEventData): void => deps.onClearSession();

  /**
   * LE REJEU DE LA COUPURE (revue-correction #5793) — la passerelle émet
   * `authenticated` à CHAQUE (ré)authentification, donc à chaque reconnexion
   * (`AuthHandler.ts:364`, `handleTokenAuthentication` tournant sur toute
   * nouvelle connexion). Tout `message:new` émis PENDANT la coupure est perdu
   * : le socket ne rejoue rien, et `refetchOnReconnect` (`query-client.ts`) ne
   * couvre que le retour de `navigator.onLine` — pas un redémarrage de la
   * passerelle ni une coupure transitoire du socket seul, où le navigateur
   * n'a jamais cessé d'être « en ligne ». iOS resynchronise depuis son dernier
   * point de contrôle (`ConversationSyncEngine+Socket.swift:12-25`) ; ici, le
   * rejeu est une INVALIDATION TanStack — `GET /sync` est un lot séparé.
   *
   * La PREMIÈRE authentification ne rejoue rien : il n'y a pas de trou à
   * combler au démarrage, et invalider y doublerait la requête que l'écran
   * vient d'émettre.
   */
  let authenticatedOnce = false;
  const onAuthenticated = (): void => {
    if (!authenticatedOnce) {
      authenticatedOnce = true;
      return;
    }
    /* UNE invalidation couvre les TROIS familles : TanStack compare les clés
       par PRÉFIXE, et `['conversations']` préfixe la liste,
       `['conversations', id]` (la case du fil) et
       `['conversations', id, 'messages']` (la page du fil). Seules les requêtes
       ACTIVES sont re-jouées — un fil fermé se contente d'être marqué périmé. */
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    /* LA CLOCHE AUSSI (#6288) : une notification émise pendant la coupure n'a
       jamais atteint ce socket, et `notification:counts` ne se rejoue pas. */
    void deps.queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    /* LES DEMANDES D'AMITIÉ AUSSI (#6321) : une demande reçue pendant la
       coupure n'a jamais atteint ce socket, et la pastille du barreau
       « Découvrir » la compterait trop tard. */
    void deps.queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
  };

  socket.on<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
  socket.on<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
  socket.on<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_NEW, onConversationNew);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
  socket.on<unknown>(SERVER_EVENTS.STORY_CREATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_UPDATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_DELETED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_VIEWED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.POST_LIKED, onPostLiked);
  socket.on<unknown>(SERVER_EVENTS.POST_UNLIKED, onPostUnliked);
  socket.on<unknown>(SERVER_EVENTS.POST_BOOKMARKED, onPostBookmarked);
  socket.on<unknown>(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, onMediaCaptionTranslationUpdated);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_NEW, onNotificationNew);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_READ, onNotificationRead);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_READ_BULK, onNotificationReadBulk);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_DELETED, onNotificationDeleted);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_DELETED_BULK, onNotificationDeletedBulk);
  socket.on<unknown>(SERVER_EVENTS.NOTIFICATION_COUNTS, onNotificationCounts);
  socket.on<unknown>(SERVER_EVENTS.FRIEND_REQUEST_NEW, onFriendshipChanged);
  socket.on<unknown>(SERVER_EVENTS.FRIEND_REQUEST_CANCELLED, onFriendshipChanged);
  socket.on<unknown>(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED, onFriendshipChanged);
  socket.on<unknown>(SERVER_EVENTS.FRIEND_REQUEST_REJECTED, onFriendshipChanged);
  socket.on<AuthTokenExpiredEventData>(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, onTokenExpired);
  socket.on<AuthSessionRevokedEventData>(SERVER_EVENTS.AUTH_SESSION_REVOKED, onSessionRevoked);

  /** `online` ⇒ `connect()` IMMÉDIAT si déconnecté (§ 1.1 de la
   * spécification) — `socket.io-client` gère déjà la gigue/le plafond de la
   * reconnexion PÉRIODIQUE ; ce raccourci évite d'attendre le prochain tir
   * d'un backoff qui pouvait culminer à 16 s pendant que le réseau vient de
   * revenir. */
  const onOnline = (): void => {
    if (!socket.connected) socket.connect();
  };
  windowTarget?.addEventListener('online', onOnline);

  socket.connect();

  return {
    socket,
    emitTyping: (conversationId, isTyping) => {
      const body: TypingActionData = { conversationId };
      socket.emit(isTyping ? CLIENT_EVENTS.TYPING_START : CLIENT_EVENTS.TYPING_STOP, body);
    },
    destroy: () => {
      for (const handle of typingTimers.values()) clearTimeoutFn(handle);
      typingTimers.clear();
      windowTarget?.removeEventListener('online', onOnline);
      socket.off<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
      socket.off<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
      socket.off<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
      socket.off<unknown>(SERVER_EVENTS.STORY_CREATED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_UPDATED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_DELETED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_VIEWED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.POST_LIKED, onPostLiked);
      socket.off<unknown>(SERVER_EVENTS.POST_UNLIKED, onPostUnliked);
      socket.off<unknown>(SERVER_EVENTS.POST_BOOKMARKED, onPostBookmarked);
      socket.off<unknown>(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, onMediaCaptionTranslationUpdated);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_NEW, onNotificationNew);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_READ, onNotificationRead);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_READ_BULK, onNotificationReadBulk);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_DELETED, onNotificationDeleted);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_DELETED_BULK, onNotificationDeletedBulk);
      socket.off<unknown>(SERVER_EVENTS.NOTIFICATION_COUNTS, onNotificationCounts);
      socket.off<unknown>(SERVER_EVENTS.FRIEND_REQUEST_NEW, onFriendshipChanged);
      socket.off<unknown>(SERVER_EVENTS.FRIEND_REQUEST_CANCELLED, onFriendshipChanged);
      socket.off<unknown>(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED, onFriendshipChanged);
      socket.off<unknown>(SERVER_EVENTS.FRIEND_REQUEST_REJECTED, onFriendshipChanged);
      socket.off<AuthTokenExpiredEventData>(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, onTokenExpired);
      socket.off<AuthSessionRevokedEventData>(SERVER_EVENTS.AUTH_SESSION_REVOKED, onSessionRevoked);
      socket.disconnect();
    },
  };
}
