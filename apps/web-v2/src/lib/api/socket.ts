import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type {
  AuthSessionRevokedEventData,
  AuthTokenExpiredEventData,
} from '@meeshy/shared/types/socketio-events/auth';
import type { TypingActionData, TypingEvent } from '@meeshy/shared/types/socketio-events/presence';
import type { PostRoomActionData } from '@meeshy/shared/types/socketio-events/social';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory } from '@/lib/net/socket';
import type { OutboxState } from '@/lib/send/outbox-store';
import { decodeNotification } from '@/lib/notifications/record';

import { attachmentStatusDetailsQueryKey } from './attachments';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { messagesQueryKey } from './messages';
import {
  applyMediaCaptionTranslation,
  applyPostCreated,
  applyPostDeleted,
  applyPostReactionEvent,
  applyPostTranslation,
  applyPostUpdated,
  applyServedBookmark,
  applyServedLike,
} from './feed-realtime';
import { FRIENDS_QUERY_PREFIX } from './friends-keys';
import { PUBLIC_PROFILE_QUERY_PREFIX } from './public-profile';
import { NOTIFICATION_COUNTS_QUERY_KEY, NOTIFICATION_LISTS_KEY } from './notifications';
import { bindPublicationRoomTransport } from './publication-rooms';
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
  applyMessageAttachmentUpdated,
  applyMessageConsumed,
  applyMessageViewOncePurged,
  applyMessageNew,
  applyMessageTranslation,
  applyReadStatusUpdated,
  isAttachmentUpdated,
  isConversationUnreadUpdated,
  isConversationUpdated,
  isMessageConsumedEvent,
  isMessageViewOncePurgedEvent,
  isMessageTranslationEvent,
  isReadStatusUpdated,
  isSocketMessage,
} from './realtime-apply';
import {
  applyMessageCountdownStarted,
  applyMessageExpired,
  isMessageCountdownStartedEvent,
  isMessageExpiredEvent,
  noteEphemeralDelivery,
} from './realtime-ephemeral';
import { STARRED_MESSAGES_QUERY_ROOT, applyStarredEvent } from './starred-messages-cache';
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
 *
 * Ce qu'il FAIT à la place pour les PUBLICATIONS : `post:join` / `post:leave`
 * pour les salles que les écrans tiennent (`publication-rooms.ts`, #7395) — la
 * passerelle ne peut pas deviner ce qu'un écran montre.
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

/**
 * `message:pending-delivered` (#7223) — charge INLINE, aucun type exporté
 * (`packages/shared/types/socketio-events/event-maps.ts:382` : `{ count:
 * number; conversationIds: string[] }`), motif `PostLikeEvent` ci-dessous :
 * une garde LOCALE plutôt qu'un import qui n'existe pas dans `@meeshy/shared`.
 */
type PendingMessagesDeliveredEvent = { readonly count: number; readonly conversationIds: readonly string[] };

function isPendingMessagesDeliveredEvent(payload: unknown): payload is PendingMessagesDeliveredEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    isFiniteNumber(p.count) &&
    Array.isArray(p.conversationIds) &&
    p.conversationIds.every((id) => typeof id === 'string')
  );
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

/** `AttachmentStatusUpdatedEventData` (`@meeshy/shared/types/socketio-events/
 * attachment.ts`), réduite au SEUL champ que la feuille « Infos du message »
 * (#7226) doit router : `attachmentId`, qui nomme la query à invalider. Les
 * autres champs (`action`, `playPositionMs`…) sont déjà dans la ligne que le
 * REFETCH ramènera — les relire ici doublerait la source de vérité. */
type AttachmentStatusEvent = { readonly attachmentId: string };

function isAttachmentStatusEvent(payload: unknown): payload is AttachmentStatusEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  return typeof (payload as Record<string, unknown>).attachmentId === 'string';
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

  /**
   * LES SALLES DE PUBLICATION (#7395) — `publication-rooms.ts` tient le COMPTE (quels
   * écrans tiennent quelle salle) ; la connexion ÉMET. Rien ne part sur un
   * socket COUPÉ : `socket.io-client` tamponnerait l'émission et la viderait
   * dès la reconnexion, AVANT que la passerelle ait réauthentifié le socket —
   * `handleJoinPost` la refuserait (« User not authenticated ») et la salle
   * resterait perdue. Le rejeu d'`onAuthenticated` s'en charge ; un `leave`
   * sur un socket coupé n'a rien à quitter, la passerelle a déjà vidé ses
   * salles.
   */
  const emitPostRoom = (event: typeof CLIENT_EVENTS.JOIN_POST | typeof CLIENT_EVENTS.LEAVE_POST, postId: string): void => {
    if (!socket.connected) return;
    const body: PostRoomActionData = { postId };
    socket.emit(event, body);
  };
  const publicationRooms = bindPublicationRoomTransport({
    join: (postId) => emitPostRoom(CLIENT_EVENTS.JOIN_POST, postId),
    leave: (postId) => emitPostRoom(CLIENT_EVENTS.LEAVE_POST, postId),
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
    /* LE DÉCOMPTE PART D'ICI, PAS DU PREMIER PIXEL (#7454) — le fil peut être
       fermé quand l'éphémère arrive ; c'est cet instant-là qui fait foi. */
    noteEphemeralDelivery(payload, now());

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
   * `message:attachment-updated` (#7017) — LE PENDANT DE `message:translation`
   * POUR LES PIÈCES JOINTES.
   *
   * `message:translation` rattrape le TEXTE d'un message traduit APRÈS sa
   * création ; celui-ci rattrape la TRANSCRIPTION Whisper, puis les traductions
   * NLLB et les pistes TTS d'une pièce jointe, qui arrivent par le même retard
   * de pipeline (`emitAttachmentUpdated.ts:77`, une émission par enrichissement).
   * L'inventaire des `socket.on` de ce module ne le portait pas — le legacy
   * l'écoute (`apps/web/hooks/queries/use-socket-cache-sync.ts:1565`) — si bien
   * qu'un vocal reçu restait MUET, sans transcription et sans drapeau de langue,
   * jusqu'à ce qu'on quitte et rouvre le fil.
   *
   * La règle vit dans `realtime-apply.ts` (D-40) : cette ligne la BRANCHE.
   */
  const onAttachmentUpdated = (payload: unknown): void => {
    if (!isAttachmentUpdated(payload)) return;
    applyMessageAttachmentUpdated(deps.queryClient, payload);
  };

  /**
   * `attachment-status:updated` (#7226, W7) — LA FEUILLE « INFOS DU MESSAGE »
   * SUIT UNE OUVERTURE/UN TÉLÉCHARGEMENT/UNE ÉCOUTE EN DIRECT.
   *
   * Émis par `services/gateway/src/routes/messages-writes.ts:717` après
   * `listened`/`watched`/`viewed`/`downloaded`. La feuille lit
   * `GET /attachments/:id/status-details` via `useQuery`
   * (`attachmentStatusDetailsQueryKey`, `api/attachments.ts`) ; ce module ne
   * FUSIONNE rien dans la ligne (la forme paginée, par participant, ne se
   * met pas à jour champ par champ sans risquer de désynchroniser `Nx` et la
   * barre de progression) — il INVALIDE la query, même idiome que
   * `onUnreadUpdated`/`onFriendshipChanged` plus bas : le prochain rendu de
   * la feuille OUVERTE refetch, une feuille FERMÉE ne refetch rien (React
   * Query n'interroge que les observateurs actifs).
   */
  const onAttachmentStatusUpdated = (payload: unknown): void => {
    if (!isAttachmentStatusEvent(payload)) return;
    void deps.queryClient.invalidateQueries({ queryKey: attachmentStatusDetailsQueryKey(payload.attachmentId) });
  };

  /**
   * `read-status:updated` (#7223, #7348) — LES COCHES ✓✓ D'UN MESSAGE ENVOYÉ
   * BOUGENT EN DIRECT quand le destinataire reçoit ou lit. La règle (cible le
   * message que `summary.messageId` NOMME ; à défaut de nom — passerelle
   * pré-G-5/#7347 — le dernier message du fil ; tous-ou-rien en groupe
   * conservé) vit dans `realtime-apply.ts` (D-40) : cette ligne la BRANCHE.
   */
  const onReadStatusUpdated = (payload: unknown): void => {
    if (!isReadStatusUpdated(payload)) return;
    applyReadStatusUpdated(deps.queryClient, payload);
  };

  /**
   * `message:consumed` (#7354, V6) — L'ÉVÉNEMENT PAIR DE
   * `consumeViewOnceOptimistic` (`view-once.ts:20-26`), diffusé par la
   * passerelle à TOUTE la room de conversation au PREMIER visionnage d'une
   * vue unique (`messages-view-once.ts:158-167`). La règle vit dans
   * `realtime-apply.ts` (D-40) : cette ligne la BRANCHE.
   */
  const onMessageConsumed = (payload: unknown): void => {
    if (!isMessageConsumedEvent(payload)) return;
    applyMessageConsumed(deps.queryClient, payload, deps.viewerId());
  };

  /** `message:view-once-purged` (#7578) — le contenu est purgé, la bulle reste « déjà ouverte ». */
  const onMessageViewOncePurged = (payload: unknown): void => {
    if (!isMessageViewOncePurgedEvent(payload)) return;
    applyMessageViewOncePurged(deps.queryClient, payload);
  };

  /**
   * L'ÉCHÉANCE D'UN ÉPHÉMÈRE, DES DEUX CÔTÉS (#7454) — `message:expired` la
   * CONSOMME (le message quitte l'écran sur-le-champ), `message:countdown-
   * started` la POSE. Les deux étaient absents : un message détruit par le
   * serveur restait affiché jusqu'au prochain chargement du fil.
   *
   * Les deux puits vivent dans `realtime-ephemeral.ts` ; ici, seule la
   * reconnaissance de la charge et le branchement — motif de tous les autres
   * gestionnaires de ce fichier.
   */
  const onMessageExpired = (payload: unknown): void => {
    if (!isMessageExpiredEvent(payload)) return;
    applyMessageExpired(deps.queryClient, payload);
  };

  const onMessageCountdownStarted = (payload: unknown): void => {
    if (!isMessageCountdownStartedEvent(payload)) return;
    applyMessageCountdownStarted(payload);
  };

  /**
   * `message:pending-delivered` (#7223) — la charge ne porte AUCUN compteur
   * par message (`{count, conversationIds}`) : ce puits INVALIDE les fils
   * NOMMÉS plutôt que d'inventer des compteurs qu'elle ne transporte pas
   * (doc-comment `MeeshySocketIOManager.ts:826-846` — « invalider les
   * messages des conversations nommées »). La prochaine lecture de
   * `GET …/messages` sert les compteurs réels.
   */
  const onPendingMessagesDelivered = (payload: unknown): void => {
    if (!isPendingMessagesDeliveredEvent(payload)) return;
    for (const conversationId of payload.conversationIds) {
      void deps.queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
    }
  };

  /**
   * `comment:added` (#7151) — LA LISTE DES COMMENTAIRES SUIT LE FIL EN DIRECT.
   *
   * L'événement existait depuis toujours côté passerelle ; mesuré avant ce lot,
   * `grep -rn "comment:added"` sur `src/` rendait VIDE. La règle vit dans
   * `realtime-apply.ts` (idempotence, réconciliation de l'optimiste, garde de
   * forme) : **cette ligne la BRANCHE**.
   *
   * Sans elle, le couple serait « écrit, testé, et jamais activé » — la forme
   * exacte que #7142 vient de coûter au dépôt sur une autre surface. Un
   * mécanisme dont la valeur n'atteint aucun lecteur n'a corrigé personne.
   */
  /**
   * `comment:added` (#7151) — LA LISTE DES COMMENTAIRES SUIT LE FIL EN DIRECT.
   *
   * `import()`, JAMAIS statique — D-98 : « un écouteur temps réel n'IMPORTE pas
   * le cache qu'il met à jour ». Mesuré : l'import statique portait le chunk
   * `realtime` à 5,05 Ko pour un plafond de 5 ; garder la seule GARDE ici le
   * laissait encore à 5,01. La règle ENTIÈRE — forme et application — vit donc
   * avec le cache, et cette ligne ne fait que router.
   */
  const onCommentAdded = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentAdded }) => {
      applyCommentAdded(deps.queryClient, payload);
    });
  };

  /**
   * `comment:updated` / `comment:deleted` / `comment:liked` / `comment:unliked`
   * (#7227, W8) — LE FIL DE COMMENTAIRES SUIT LA PASSERELLE EN DIRECT, même
   * motif que `comment:added` juste au-dessus : la règle (garde de forme,
   * réécriture pure sur `commentsQueryKey`) vit dans `publication-comments.ts`
   * (D-40), ces lignes ne font que BRANCHER, par `import()` (D-98, chunk
   * `realtime` plafonné à 5 Ko).
   */
  const onCommentUpdated = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentUpdated }) => {
      applyCommentUpdated(deps.queryClient, payload);
    });
  };

  const onCommentDeleted = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentDeleted }) => {
      applyCommentDeleted(deps.queryClient, payload);
    });
  };

  const onCommentLikeChanged =
    (liked: boolean) =>
    (payload: unknown): void => {
      void import('./publication-comments').then(({ applyCommentLikeEvent }) => {
        applyCommentLikeEvent(deps.queryClient, payload, deps.viewerId(), liked);
      });
    };
  const onCommentLiked = onCommentLikeChanged(true);
  const onCommentUnliked = onCommentLikeChanged(false);

  /**
   * `comment:translation-updated` (#7394) — LE PRISME SUIT LE PIPELINE EN
   * DIRECT SUR UN COMMENTAIRE, jumeau de `post:translation-updated` (#7383).
   * Il n'était écouté NULLE PART : un commentaire écrit hors de la langue du
   * lecteur restait dans celle de son auteur jusqu'à la relecture du fil. La
   * loi (garde de forme, fusion par langue, caisse du fil) vit avec le cache
   * dans `publication-comments.ts` ; cette ligne ne fait que BRANCHER, par
   * `import()` comme ses quatre voisines (D-98).
   */
  const onCommentTranslationUpdated = (payload: unknown): void => {
    void import('./publication-comments').then(({ applyCommentTranslation }) => {
      applyCommentTranslation(deps.queryClient, payload);
    });
  };

  /**
   * `story:reacted` / `story:unreacted` (#7227, W8) — LE RAIL SUIT LES
   * RÉACTIONS EN DIRECT. La règle (compte ABSOLU, garde « jamais le cœur
   * d'un autre ») vit dans `reaction-realtime.ts` — SÉPARÉ de
   * `story-reactions.ts` (le port du GESTE, importé STATIQUEMENT par le
   * lecteur, chunk `story_reader` déjà serré) — ; `import()`, même motif que
   * `comment:added`.
   */
  const onStoryReactionChanged =
    (plan: 'add' | 'remove') =>
    (payload: unknown): void => {
      void import('./reaction-realtime').then(({ applyStoryReactionEvent }) => {
        applyStoryReactionEvent(deps.queryClient, payload, { viewerId: deps.viewerId(), plan });
      });
    };
  const onStoryReacted = onStoryReactionChanged('add');
  const onStoryUnreacted = onStoryReactionChanged('remove');

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
   *
   * **ET LES RÉELS, ET LA FICHE (#7227, W8)** — la MÊME carte, servie par un
   * fil de Réels (`ReelsViewModel.swift:117-128` : SEULS les likes et la
   * suppression y sont câblés, jamais `postCreated`/`postUpdated`) ou par
   * `/post/$post`. Les caisses vivent au registre (`card-caches.ts`, #7341 :
   * le hashtag, le profil et les enregistrées aussi), atteint par
   * `feed-realtime.ts#applyServedLike`, site UNIQUE partagé avec
   * `post:reaction-added`/`post:reaction-removed` : cet écouteur ne tient que
   * le branchement (D-98), et deux boucles recopiées ne peuvent plus diverger
   * d'une caisse.
   */
  const onPostLikeChanged =
    (on: boolean) =>
    (payload: unknown): void => {
      if (!isPostLikeEvent(payload)) return;
      applyServedLike(deps.queryClient, {
        postId: payload.postId,
        on,
        byViewer: payload.userId === deps.viewerId(),
        likeCount: payload.likeCount,
      });
    };
  const onPostLiked = onPostLikeChanged(true);
  const onPostUnliked = onPostLikeChanged(false);

  /**
   * `post:created` / `post:updated` / `post:deleted` (#7182) — LE FLUX APPREND
   * CE QUI ARRIVE. Ces trois événements étaient MUETS ici pendant que leurs
   * sept cousins (`post:liked`, `post:bookmarked`, les quatre `story:*`,
   * `comment:added`) étaient écoutés : une publication d'un ami n'atteignait
   * jamais le fil sans rechargement.
   *
   * Les lois vivent dans `feed-realtime.ts` — réconciliation par cmid,
   * idempotence, insertion en tête, préservation de l'état du lecteur — et
   * un écouteur ne tient QUE le branchement (D-98). L'import est STATIQUE et
   * c'est MESURÉ : `feed-realtime.ts` ne tient aucune requête, et le rendre
   * différé coûtait PLUS que le module lui-même (5,10 Ko contre 5,01 pour le
   * chunk `realtime` — trois `import()` et leur table de dépendances).
   */
  const onPostCreated = (payload: unknown): void => {
    applyPostCreated(deps.queryClient, payload);
  };

  const onPostUpdated = (payload: unknown): void => {
    applyPostUpdated(deps.queryClient, payload);
  };

  const onPostDeleted = (payload: unknown): void => {
    applyPostDeleted(deps.queryClient, payload);
  };

  /**
   * `post:bookmarked` — **ET LES RÉELS, ET LA FICHE (#7227, W8)**. Cet écho
   * n'écrivait que le Flux pendant que le geste LOCAL tenait plusieurs
   * caisses (`feed-gestures.ts#performPostGesture`) et qu'iOS réconcilie son
   * pager (`ReelsViewModel.swift:139-163`) : un favori posé depuis un AUTRE
   * appareil n'atteignait ni le pager ni la fiche. Les caisses vivent au
   * registre (`card-caches.ts`, #7341), atteint par
   * `feed-realtime.ts#applyServedBookmark`, à côté de ses jumelles du cœur —
   * cet écouteur ne tient que le branchement (D-98).
   */
  const onPostBookmarked = (payload: unknown): void => {
    if (!isPostBookmarkEvent(payload)) return;
    applyServedBookmark(deps.queryClient, {
      postId: payload.postId,
      on: payload.bookmarked,
      bookmarkCount: payload.bookmarkCount,
    });
  };

  /**
   * `message:starred` (#7378) — LE FAVORI D'UN MESSAGE, posé ou retiré sur un
   * AUTRE appareil (ou l'écho de ce geste-ci). PERSONNEL : la passerelle
   * n'émet que vers `user:<id>`. La loi (l'étoile du fil, la ligne de l'écran
   * des favoris) vit dans `starred-messages-cache.ts`, importé STATIQUEMENT :
   * il ne tient aucune requête, comme `feed-realtime.ts` ; cet écouteur ne
   * tient que le branchement (D-98).
   */
  const onMessageStarred = (payload: unknown): void => {
    applyStarredEvent(deps.queryClient, payload);
  };

  /**
   * `post:reaction-added` / `post:reaction-removed` (#7227, W8) — GARDÉS au
   * ❤️, miroir EXACT d'iOS (`FeedView.swift:1307-1325`). Le ❤️ sur un
   * POST/REEL part en pratique par `post:liked`/`post:unliked`
   * (`PostReactionHandler.ts:106-123`) ; les emojis NON-❤️ n'ont AUCUN champ
   * côté `FeedPost` — la règle (garde + application, feed/reels/détail) vit
   * dans `feed-realtime.ts`, importé STATIQUEMENT (D-98 mesure déjà le coût
   * de ce module dans le chunk `realtime` pour `post:created/updated/deleted`,
   * un `import()` de plus n'ajouterait rien).
   */
  const onPostReactionChanged = (payload: unknown): void => {
    applyPostReactionEvent(deps.queryClient, payload, deps.viewerId());
  };

  /**
   * `post:translation-updated` (#7383) et `media:caption-translation-updated`
   * (#6280, #7382) — LE PRISME SUIT LE PIPELINE EN DIRECT, sur CHAQUE écran
   * qui montre la carte. Le texte d'une publication n'était écouté NULLE PART
   * (iOS l'écoute sur le Flux, la fiche, le profil et les stories), et la
   * légende d'un média n'atteignait que le Flux (`updateFeed`, disparu) : sa
   * charge porte pourtant `postId` depuis sa naissance — c'est la garde locale
   * qui ne le lisait pas.
   *
   * Les lois vivent dans `feed-realtime.ts` (validation, fusion par langue,
   * registre des caisses) ; ces écouteurs ne tiennent que le branchement
   * (D-98). Deux contenus, deux cartes de traduction, jamais mélangées.
   */
  const onPostTranslationUpdated = (payload: unknown): void => {
    applyPostTranslation(deps.queryClient, payload);
  };

  const onMediaCaptionTranslationUpdated = (payload: unknown): void => {
    applyMediaCaptionTranslation(deps.queryClient, payload);
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
    /* ET LA FICHE DE PROFIL (#7083) — `/u/:handle` porte `relation`, servie
       AVEC le profil (`expand=relation`). Elle change quand quelqu'un d'AUTRE
       pose un geste : sans cette ligne, la fiche resterait sur « Ajouter » pour
       une demande qui vient d'arriver, jusqu'à expiration de sa fenêtre de
       fraîcheur. Miroir d'`onReceive(FriendshipCache.objectWillChange)`
       (`UserProfileSheet.swift:156-158`). */
    void deps.queryClient.invalidateQueries({ queryKey: PUBLIC_PROFILE_QUERY_PREFIX });
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
   *
   * SAUF LES SALLES DE PUBLICATION (#7395), rejointes à CHAQUE
   * authentification, la première comprise : un écran ouvert avant que la
   * connexion ait fini de s'établir a demandé sa salle à un socket qui ne
   * pouvait pas encore l'accepter, et une coupure a vidé côté passerelle
   * toutes celles du socket précédent.
   */
  let authenticatedOnce = false;
  const onAuthenticated = (): void => {
    publicationRooms.rejoin();
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
    /* LA CLOCHE AUSSI (#6288), PAR FAMILLE NOMMÉE (#6974) : une notification
       émise pendant la coupure n'a jamais atteint ce socket, et
       `notification:counts` ne se rejoue pas.

       Les DEUX lignes, et chacune pour sa propre raison — c'est ce que la
       racine `['notifications']` disait en une seule sans le dire :
       - les LISTES parce qu'aucun gestionnaire n'a vu les lignes de
         l'intervalle. À la DIFFÉRENCE de `notifications-realtime.ts:92`
         (`refetchType: 'none'`, qui a déjà écrit la ligne dans le cache), il
         faut ici un vrai refetch : il n'y a rien d'écrit à réconcilier ;
       - les COMPTES parce que rien d'autre ne les rafraîchit à cet instant
         (mesuré : leur unique lecteur, `use-notification-counts.ts`, ne relit
         que sur focus de fenêtre, et une coupure du SEUL socket n'en produit
         aucun — le navigateur n'a jamais cessé d'être « en ligne »).

       Nommer les deux plutôt que balayer leur racine, c'est refuser d'emporter
       la prochaine requête qu'on rangera sous `['notifications']` sans l'avoir
       décidé — la garde `socket.test.ts` y tient une sentinelle. */
    void deps.queryClient.invalidateQueries({ queryKey: NOTIFICATION_LISTS_KEY });
    void deps.queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_QUERY_KEY });
    /* LES DEMANDES D'AMITIÉ AUSSI (#6321) : une demande reçue pendant la
       coupure n'a jamais atteint ce socket, et la pastille du barreau
       « Découvrir » la compterait trop tard. */
    void deps.queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
    /* LES MESSAGES FAVORIS AUSSI (#7378) : un `message:starred` émis pendant
       la coupure n'a jamais atteint ce socket, et l'étoile du fil mentirait
       jusqu'à la prochaine relecture. L'ensemble ET la liste de l'écran. */
    void deps.queryClient.invalidateQueries({ queryKey: STARRED_MESSAGES_QUERY_ROOT });
  };

  socket.on<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
  socket.on<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
  socket.on<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_NEW, onConversationNew);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, onAttachmentUpdated);
  socket.on<unknown>(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, onAttachmentStatusUpdated);
  socket.on<unknown>(SERVER_EVENTS.READ_STATUS_UPDATED, onReadStatusUpdated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_CONSUMED, onMessageConsumed);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, onMessageViewOncePurged);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_EXPIRED, onMessageExpired);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, onMessageCountdownStarted);
  socket.on<unknown>(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, onPendingMessagesDelivered);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_ADDED, onCommentAdded);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_UPDATED, onCommentUpdated);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_DELETED, onCommentDeleted);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_LIKED, onCommentLiked);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_UNLIKED, onCommentUnliked);
  socket.on<unknown>(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, onCommentTranslationUpdated);
  socket.on<unknown>(SERVER_EVENTS.STORY_CREATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_UPDATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_DELETED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_VIEWED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_REACTED, onStoryReacted);
  socket.on<unknown>(SERVER_EVENTS.STORY_UNREACTED, onStoryUnreacted);
  socket.on<unknown>(SERVER_EVENTS.POST_CREATED, onPostCreated);
  socket.on<unknown>(SERVER_EVENTS.POST_UPDATED, onPostUpdated);
  socket.on<unknown>(SERVER_EVENTS.POST_DELETED, onPostDeleted);
  socket.on<unknown>(SERVER_EVENTS.POST_LIKED, onPostLiked);
  socket.on<unknown>(SERVER_EVENTS.POST_UNLIKED, onPostUnliked);
  socket.on<unknown>(SERVER_EVENTS.POST_BOOKMARKED, onPostBookmarked);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_STARRED, onMessageStarred);
  socket.on<unknown>(SERVER_EVENTS.POST_REACTION_ADDED, onPostReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.POST_REACTION_REMOVED, onPostReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.POST_TRANSLATION_UPDATED, onPostTranslationUpdated);
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
      publicationRooms.detach();
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
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, onAttachmentUpdated);
      socket.off<unknown>(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, onAttachmentStatusUpdated);
      socket.off<unknown>(SERVER_EVENTS.READ_STATUS_UPDATED, onReadStatusUpdated);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_CONSUMED, onMessageConsumed);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, onMessageViewOncePurged);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_EXPIRED, onMessageExpired);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, onMessageCountdownStarted);
      socket.off<unknown>(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, onPendingMessagesDelivered);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_ADDED, onCommentAdded);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_UPDATED, onCommentUpdated);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_DELETED, onCommentDeleted);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_LIKED, onCommentLiked);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_UNLIKED, onCommentUnliked);
      socket.off<unknown>(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, onCommentTranslationUpdated);
      socket.off<unknown>(SERVER_EVENTS.POST_CREATED, onPostCreated);
      socket.off<unknown>(SERVER_EVENTS.POST_UPDATED, onPostUpdated);
      socket.off<unknown>(SERVER_EVENTS.POST_DELETED, onPostDeleted);
      socket.off<unknown>(SERVER_EVENTS.STORY_CREATED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_UPDATED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_DELETED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_VIEWED, onStoryChanged);
      socket.off<unknown>(SERVER_EVENTS.STORY_REACTED, onStoryReacted);
      socket.off<unknown>(SERVER_EVENTS.STORY_UNREACTED, onStoryUnreacted);
      socket.off<unknown>(SERVER_EVENTS.POST_LIKED, onPostLiked);
      socket.off<unknown>(SERVER_EVENTS.POST_UNLIKED, onPostUnliked);
      socket.off<unknown>(SERVER_EVENTS.POST_BOOKMARKED, onPostBookmarked);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_STARRED, onMessageStarred);
      socket.off<unknown>(SERVER_EVENTS.POST_REACTION_ADDED, onPostReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.POST_REACTION_REMOVED, onPostReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.POST_TRANSLATION_UPDATED, onPostTranslationUpdated);
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
