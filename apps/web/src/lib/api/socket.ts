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
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { noteGalleryReception } from '@/lib/gallery/auto-save-runtime';
import type { SocketAuth, SocketClient, SocketFactory } from '@/lib/net/socket';
import type { OutboxState } from '@/lib/send/outbox-store';
import { offerInAppBanner } from '@/lib/notifications/in-app-banner';
import { decodeRealtimeNotification } from '@/lib/notifications/record';

import { deletedAccountOf, deletedAccountOfRevocation, ownDeletedAccount } from './account-deleted';
import { attachmentStatusDetailsQueryKey } from './attachments';
import { guestAccessEndOfSocketError, type GuestAccessEnd } from './guest-access-end';
import { CONVERSATION_CATEGORIES_QUERY_KEY, CONVERSATIONS_QUERY_KEY, requestFullConversationRead } from './conversations';
import { messagesQueryKey } from './messages';
import { applyAttachmentDeleted, decodeAttachmentDeletedEvent } from './realtime-attachment-deleted';
import { applyAttachmentReactionUpdate, isAttachmentReactionUpdate } from './realtime-attachment-reactions';
import { applyCitedPostWithdrawn, isCitedPostWithdrawnEvent } from './realtime-cited-post';
import { applyEncryptionChanged, isEncryptionChanged } from './realtime-encryption-changed';
import {
  applyMessageDeleted,
  applyMessageEdited,
  isMessageDeletedEvent,
  isMessageEditedEvent,
} from './realtime-message-mutations';
import { applyMessageHiddenForMe, applyMessageRestoredForMe, isMessageHiddenForMeEvent, isMessageRestoredForMeEvent } from './realtime-message-hidden';
import { applyViewerMembershipEnded, viewerMembershipEndedOf } from './realtime-membership-ended';
import { applyMemberCountChange, memberCountChangeOf, type MembershipChange } from './realtime-member-count';
import { applyConversationGone, conversationGoneOf, viewerConversationOf } from './realtime-conversation-gone';
import { applyMessagePinnedEvent, applyMessageUnpinnedEvent, isMessagePinnedEvent, isMessageUnpinnedEvent } from './realtime-message-pin';
import { applyMessageReactionUpdate, isMessageReactionUpdate } from './realtime-message-reactions';
/* LES DEUX CLÉS DU REJEU SOCIAL (#18641) — `feed-realtime.ts` (branché par
   `realtime-social.ts`) tire déjà `./feed` et `./stories` : les nommer ici
   n'ajoute AUCUN poids au chunk `realtime`, seulement la capacité de les
   périmer. */
import { FEED_QUERY_KEY } from './feed';
import { STATUS_MOODS_QUERY_KEY, STORY_TRAY_QUERY_KEY } from './stories';
import { FRIENDS_QUERY_PREFIX } from './friends-keys';
import { MY_PROFILE_QUERY_KEY } from './me-keys';
import { profileRepaintOfUserUpdated, repaintProfile } from './my-portrait';
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
  notificationIdOf,
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
import { applyTranscriptionReady, isTranscriptionReady } from './realtime-transcription-ready';
import { mediaProcessingFailures } from './media-processing-failures';
import { applyAudioTranslationFailed, applyTranscriptionFailed, isMediaProcessingFailed } from './realtime-media-processing-failed';
import {
  applyMessageCountdownStarted,
  applyMessageExpired,
  isMessageCountdownStartedEvent,
  isMessageExpiredEvent,
  noteEphemeralDelivery,
} from './realtime-ephemeral';
import { catchUpFirstAuthentication, catchUpThreadMessage, createUnknownRowCatchUp, relaunchConversationList } from './realtime-thread-catch-up';
import { viewerRoleUpdatedListener } from './realtime-viewer-role';
import { bindSocialRealtime } from './realtime-social';
import { STARRED_MESSAGES_QUERY_ROOT, applyStarredEvent } from './starred-messages-cache';
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

/**
 * **LES FAMILLES PERSONNELLES QU'UNE SURDITÉ DU SOCKET PREND EN ENTIER**
 * (#6288, #6321, #6974, #7378, #18573).
 *
 * Déclarées ICI, une fois, parce que les DEUX rattrapages d'`onAuthenticated`
 * les doivent — la reconnexion comme la première connexion. Elles étaient
 * épelées dans la seule branche de reconnexion, et trois lots de suite y ont
 * ajouté la leur sans voir l'autre branche : c'est cette absence de liste, et
 * non un arbitrage, qui a laissé la cloche mentir après chaque démarrage à
 * froid (#18573).
 *
 * Chacune porte sa propre raison, et aucune n'est la racine de sa voisine :
 *
 * - **les LISTES de la cloche** (#6288) parce qu'aucun gestionnaire n'a vu les
 *   lignes de l'intervalle. À la DIFFÉRENCE de `notifications-realtime.ts:92`
 *   (`refetchType: 'none'`, qui a déjà écrit la ligne dans le cache), il faut
 *   ici un vrai refetch : il n'y a rien d'écrit à réconcilier ;
 * - **les COMPTES de la cloche** (#6974) parce que rien d'autre ne les
 *   rafraîchit à cet instant — mesuré : leur unique lecteur
 *   (`use-notification-counts.ts`) ne relit que sur FOCUS de fenêtre, et ni une
 *   coupure du seul socket ni un démarrage à froid n'en produit un (le
 *   navigateur n'a jamais cessé d'être « en ligne », et la fenêtre est déjà au
 *   premier plan) ;
 * - **les DEMANDES D'AMITIÉ** (#6321) parce qu'une demande reçue dans
 *   l'intervalle n'a atteint aucun socket, et que la pastille du barreau
 *   « Découvrir » la compterait trop tard ;
 * - **les MESSAGES FAVORIS** (#7378) parce qu'un `message:starred` posé depuis
 *   un AUTRE appareil dans l'intervalle n'a atteint aucun socket, et que
 *   l'étoile du fil mentirait jusqu'à la prochaine relecture ;
 * - **le PROFIL du lecteur** (#18914) parce qu'aucun événement n'atteint ses
 *   propres sockets quand il change de langue, de nom ou de photo ailleurs :
 *   la session suit `GET /me` (`served-profile-session.ts`), et cette relecture
 *   est ce qui la ramène sans attendre ses trente minutes de fraîcheur.
 *
 * Les deux familles de la cloche sont NOMMÉES plutôt que leur racine
 * `['notifications']` balayée : c'est refuser d'emporter la prochaine requête
 * qu'on rangera sous cette racine sans l'avoir décidé — la garde
 * `socket.test.ts` y tient une sentinelle.
 *
 * Les CONVERSATIONS n'y figurent pas, et ce n'est pas un oubli : les deux
 * branches n'en prennent pas la même portée. Une coupure invalide la racine
 * entière (la liste, la case, la page du fil) ; la première connexion n'en
 * prend que la liste et le fil VIVANT, parce que ni la case ni une fenêtre
 * ancrée ne sont nourries par ce que l'intervalle a emporté (#7420).
 */
const CATCH_UP_PERSONAL_FAMILIES: readonly (readonly unknown[])[] = [
  NOTIFICATION_LISTS_KEY,
  NOTIFICATION_COUNTS_QUERY_KEY,
  FRIENDS_QUERY_PREFIX,
  STARRED_MESSAGES_QUERY_ROOT,
  MY_PROFILE_QUERY_KEY,
];

/** Les notifications qui annoncent l'ARRIVÉE d'un message — jamais une
 * réaction ni une édition, qui nomment un message que le fil peut ne pas avoir
 * chargé sans qu'il manque quoi que ce soit (#9291). */
const MESSAGE_ARRIVAL_NOTIFICATIONS: ReadonlySet<string> = new Set([
  'new_message',
  'message_reply',
  'user_mentioned',
  'mention',
]);

function isTypingEvent(payload: unknown): payload is TypingEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.userId === 'string' && typeof p.conversationId === 'string' && typeof p.username === 'string';
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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

export type RealtimeSessionInfo = SocketAuth;

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
  readonly onClearSession: (reason?: AuthSessionRevokedEventData['reason']) => void;
  /** `error { code: SHARE_LINK_EXPIRED }` (#10442) — l'accès de l'invité est
   * fini : la connexion se ferme d'elle-même et ne se rouvre plus. */
  readonly onGuestAccessEnded?: (reason: GuestAccessEnd) => void;
  /** Le compte NOMMÉ supprimé (#10237) : `error { code: ACCOUNT_DELETED, accountId }`
   * ou `auth:session-revoked { deletedAccountId }` — jamais le compte actif. */
  readonly onAccountDeleted?: (accountId: string) => void;
  /** `conversation:closed` / `conversation:obsoleted` (#14645) : le fil ouvert de cette conversation se referme. */
  readonly onConversationGone?: (conversationId: string) => void;
  /** Le compte de la session qui a OUVERT la connexion — seul nommable (audit #10237) ; `null` pour un invité. */
  readonly account?: string | null;
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

const CATEGORY_EVENTS = [
  SERVER_EVENTS.CATEGORY_CREATED,
  SERVER_EVENTS.CATEGORY_UPDATED,
  SERVER_EVENTS.CATEGORY_DELETED,
  SERVER_EVENTS.CATEGORIES_REORDERED,
] as const;

function defaultWindow(): RealtimeDeps['windowTarget'] {
  return typeof window === 'undefined' ? undefined : window;
}

export function createRealtimeConnection(session: RealtimeSessionInfo, deps: RealtimeDeps): RealtimeConnection {
  const now = deps.now ?? Date.now;
  const scheduleTimeout = deps.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const windowTarget = deps.windowTarget ?? defaultWindow();
  /* Une conversation hors de la liste en cache la fait relire (#10573). */
  const unknownRows = createUnknownRowCatchUp({ queryClient: deps.queryClient, scheduleTimeout, clearTimeoutFn });

  const socket = deps.socketFactory({
    base: deps.base,
    auth: session,
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
    unknownRows.note(payload.conversationId);
    /* LE DÉCOMPTE PART D'ICI, PAS DU PREMIER PIXEL (#7454) — le fil peut être
       fermé quand l'éphémère arrive ; c'est cet instant-là qui fait foi. */
    noteEphemeralDelivery(payload, now());
    /* LA GALERIE DE LA COQUE ANDROID (#8308) — à la RÉCEPTION, une seule fois,
       jamais un média protégé ni le mien, seulement si « Sauvegarder média »
       est ouvert (#14641) ; sans effet hors de la coque. */
    noteGalleryReception(payload, deps.viewerId(), deps.queryClient);

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
    unknownRows.note(payload.conversationId);
  };

  /** `conversation:updated` (revue-correction #5793, défaut 1) — la
   * QUATRIÈME famille du Prisme (résolue SERVEUR) : PRIME sur ce que
   * `onMessageNew` a déduit, voir le doc-comment de `applyConversationUpdated`. */
  const onConversationUpdated = (payload: unknown): void => {
    if (!isConversationUpdated(payload)) return;
    applyConversationUpdated(deps.queryClient, payload);
    unknownRows.note(payload.conversationId);
    /* LE FIL OUVERT RATTRAPE UN `message:new` PERDU (#9291) — cet évènement
       voyage par la room PERSONNELLE ; `message:new`, par celle de la
       conversation. Mes propres envois sont exclus : leur écho voyage par ma
       room personnelle, et l'outbox tient la rangée optimiste. */
    if (typeof payload.lastMessageId === 'string' && payload.updatedBy.id !== deps.viewerId()) {
      catchUpThreadMessage(deps.queryClient, { conversationId: payload.conversationId, messageId: payload.lastMessageId });
    }
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
   * l'écoute (`legacy-web-final:apps/web/hooks/queries/use-socket-cache-sync.ts:1565`) — si bien
   * qu'un vocal reçu restait MUET, sans transcription et sans drapeau de langue,
   * jusqu'à ce qu'on quitte et rouvre le fil.
   *
   * La règle vit dans `realtime-apply.ts` (D-40) : cette ligne la BRANCHE.
   */
  const onAttachmentUpdated = (payload: unknown): void => {
    if (!isAttachmentUpdated(payload)) return;
    applyMessageAttachmentUpdated(deps.queryClient, payload);
  };

  /** `audio:transcription-ready` (#10742) — la transcription demandée rejoint la bonne pièce sans rechargement. */
  const onTranscriptionReady = (payload: unknown): void => {
    if (!isTranscriptionReady(payload)) return;
    applyTranscriptionReady(deps.queryClient, payload);
  };

  /**
   * `audio:transcription-failed` / `audio:translation-failed` (#18537) — L'AUTRE
   * ISSUE DE LA MÊME DEMANDE.
   *
   * `onTranscriptionReady` ci-dessus porte la RÉUSSITE d'un travail mis en file.
   * La PANNE voyage par ces deux noms, qu'iOS et Android lisent depuis toujours
   * et que ce module ne portait pas : le lecteur attendait le plafond de SILENCE
   * de 90 s (`ON_DEMAND_STALL_MS`) pour une panne que la passerelle avait dite
   * en une seconde, puis rendait la main sans un mot.
   */
  const onTranscriptionFailed = (payload: unknown): void => {
    if (!isMediaProcessingFailed(payload)) return;
    applyTranscriptionFailed(mediaProcessingFailures, payload);
  };

  const onAudioTranslationFailed = (payload: unknown): void => {
    if (!isMediaProcessingFailed(payload)) return;
    applyAudioTranslationFailed(mediaProcessingFailures, payload);
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

  /** `attachment:reaction-added|removed` (#7894) — le résumé ABSOLU d'une pièce ; la règle vit dans `realtime-attachment-reactions.ts`. */
  const onAttachmentReactionChanged = (payload: unknown): void => {
    if (!isAttachmentReactionUpdate(payload)) return;
    applyAttachmentReactionUpdate(deps.queryClient, payload, deps.viewerId());
  };

  /** `attachment:deleted` (#13611) — une pièce retirée par un membre quitte le fil, l'écran des médias et la ligne de liste. Règle : `realtime-attachment-deleted.ts`. */
  const onAttachmentDeleted = (payload: unknown): void => {
    const data = decodeAttachmentDeletedEvent(payload);
    if (data !== null) applyAttachmentDeleted(deps.queryClient, data);
  };

  /** `reaction:added|removed` (#5863) — le compte ABSOLU d'un emoji ; « ma réaction » ne suit que MON geste. Règle : `realtime-message-reactions.ts`. */
  const onMessageReactionChanged = (payload: unknown): void => {
    if (!isMessageReactionUpdate(payload)) return;
    applyMessageReactionUpdate(deps.queryClient, payload, deps.viewerId());
  };

  /** `message:edited` / `message:deleted` (#7926) — la rangée, ses citations et la ligne de liste. Règle : `realtime-message-mutations.ts`. */
  const onMessageEdited = (payload: unknown): void => {
    if (!isMessageEditedEvent(payload)) return;
    applyMessageEdited(deps.queryClient, payload);
  };

  const onMessageDeleted = (payload: unknown): void => {
    if (!isMessageDeletedEvent(payload)) return;
    applyMessageDeleted(deps.queryClient, payload);
  };

  /** `message:pinned` / `message:unpinned` (#7558) — l'épingle posée ailleurs se voit sans rechargement. Règle : `realtime-message-pin.ts`. */
  const onMessagePinned = (payload: unknown): void => {
    if (isMessagePinnedEvent(payload)) applyMessagePinnedEvent(deps.queryClient, payload);
  };

  const onMessageUnpinned = (payload: unknown): void => {
    if (isMessageUnpinnedEvent(payload)) applyMessageUnpinnedEvent(deps.queryClient, payload);
  };

  /** `message:hidden-for-me` (#10587) — masqué pour moi sur un autre appareil : la rangée quitte le fil. Règle : `realtime-message-hidden.ts`. */
  const onMessageHiddenForMe = (payload: unknown): void => {
    if (isMessageHiddenForMeEvent(payload)) applyMessageHiddenForMe(deps.queryClient, payload, deps.viewerId());
  };

  /** L'effectif d'un groupe (#18914) : posé tel que servi, repli ±1 sur une passerelle antérieure. Règle : `realtime-member-count.ts`. */
  const applyMembershipCount = (payload: unknown, change: MembershipChange): void => {
    const counted = memberCountChangeOf(payload, change);
    if (counted !== null) applyMemberCountChange(deps.queryClient, counted);
  };

  const onParticipantJoined = (payload: unknown): void => applyMembershipCount(payload, 'joined');

  /** `conversation:participant-left` / `-banned` qui nomment le lecteur (#11415) : il n'y est plus membre. Règle : `realtime-membership-ended.ts`. */
  const onParticipantDeparture =
    (change: Exclude<MembershipChange, 'joined'>) =>
    (payload: unknown): void => {
      const ended = viewerMembershipEndedOf(payload, deps.viewerId());
      if (ended !== null) applyViewerMembershipEnded(deps.queryClient, ended);
      applyMembershipCount(payload, change);
    };
  const onParticipantLeft = onParticipantDeparture('left');
  const onParticipantBanned = onParticipantDeparture('banned');

  /** `conversation:closed` / `-obsoleted` (#14645) — ligne, détail et messages partent. Règle : `realtime-conversation-gone.ts`. */
  const onConversationGone = (payload: unknown): void => {
    const id = conversationGoneOf(payload);
    if (id === null) return;
    deps.onConversationGone?.(id);
    applyConversationGone(deps.queryClient, id);
  };

  /** `conversation:deleted` (#18914) — supprimée POUR MOI sur un autre appareil : ligne, fiche et fil partent, le fil ouvert se referme. */
  const onConversationDeletedForMe = (payload: unknown): void => {
    const id = viewerConversationOf(payload, deps.viewerId());
    if (id === null) return;
    deps.onConversationGone?.(id);
    applyConversationGone(deps.queryClient, id);
  };

  /** `conversation:restored` (#18914) — restaurée pour moi : la liste se relit EN ENTIER, `updatedAt` n'ayant pas bougé. */
  const onConversationRestoredForMe = (payload: unknown): void => {
    if (viewerConversationOf(payload, deps.viewerId()) === null) return;
    requestFullConversationRead(deps.queryClient);
    relaunchConversationList(deps.queryClient);
  };

  /** `message:restored-for-me` (#18914) — le fil de chaque conversation nommée se relit. Règle : `realtime-message-hidden.ts`. */
  const onMessageRestoredForMe = (payload: unknown): void => {
    if (isMessageRestoredForMeEvent(payload)) applyMessageRestoredForMe(deps.queryClient, payload, deps.viewerId());
  };

  /** `message:cited-post-withdrawn` (#7969) — la story citée est retirée : la carte passe « Story indisponible ». Règle : `realtime-cited-post.ts`. */
  const onCitedPostWithdrawn = (payload: unknown): void => {
    if (!isCitedPostWithdrawnEvent(payload)) return;
    applyCitedPostWithdrawn(deps.queryClient, payload);
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

  /** `message:view-once-purged` (#7578, #7644) — le contenu est purgé, la bulle reste « déjà ouverte ». */
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
    const notification = decodeRealtimeNotification(payload);
    if (notification === null || seenNotifications.has(notification.id)) return;
    seenNotifications.add(notification.id);
    if (seenNotifications.size > SEEN_NOTIFICATIONS_CAP) {
      const oldest = seenNotifications.values().next().value;
      if (oldest !== undefined) seenNotifications.delete(oldest);
    }
    applyNotificationNew(deps.queryClient, notification);
    /* LA CLOCHE SONNE, LE FIL SUIT (#9291) — la notification d'un message
       absent du fil ouvert le relit. */
    const { conversationId, messageId } = notification.context;
    if (MESSAGE_ARRIVAL_NOTIFICATIONS.has(notification.type) && conversationId !== undefined && messageId !== undefined) {
      catchUpThreadMessage(deps.queryClient, { conversationId, messageId });
    }
    /* LA BANNIÈRE IN-APP (#8727) — seulement devant un onglet VISIBLE : un
       onglet caché reçoit le push système, et une bannière posée pendant
       l'absence surgirait, périmée, au retour. */
    if (typeof document !== 'undefined' && !document.hidden) offerInAppBanner(notification, { pathname: window.location.pathname });
  };
  const onNotificationRead = (payload: unknown): void => applyNotificationRead(deps.queryClient, payload);
  const onNotificationReadBulk = (payload: unknown): void => applyNotificationReadBulk(deps.queryClient, payload);
  /* Un id supprimé qui revient est une notification RÉÉCRITE (édition :
     `notification:deleted` puis `notification:new`, même identité) — la
     mémoire de dédoublonnage l'oublie pour la laisser reprendre sa place. */
  const onNotificationDeleted = (payload: unknown): void => {
    const id = notificationIdOf(payload);
    if (id !== null) seenNotifications.delete(id);
    applyNotificationDeleted(deps.queryClient, payload);
  };
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

  /** `category:*` (#10103) — une catégorie changée sur un autre appareil repeint les sections de la liste. */
  const onCategoriesChanged = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATION_CATEGORIES_QUERY_KEY });
  };

  /** `user:updated` (#8889, #8890) — la photo et le nom d'un pair repeints dans chaque copie du cache ; la loi vit dans `my-portrait.ts`. */
  const onUserUpdated = (payload: unknown): void => {
    const update = profileRepaintOfUserUpdated(payload);
    if (update !== null) repaintProfile(deps.queryClient, update);
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
   *
   * La LISTE seule (`exact`, #18914) : la racine préfixe aussi la fiche et les
   * pages du fil ouvert, qu'une conversation NEUVE ne change pas.
   */
  const onConversationNew = (): void => {
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });
  };

  /** Le MÊME geste qu'un 401 HTTP (§ doc-comment de `RealtimeDeps`) — les
   * DEUX motifs ferment la session, aucun ne tente de rafraîchir (D-26). */
  const onTokenExpired = (_payload: AuthTokenExpiredEventData): void => deps.onClearSession();
  /* Le MOTIF voyage (#9613) : l'écran de connexion dit pourquoi la session s'est fermée. */
  const onSessionRevoked = (payload: AuthSessionRevokedEventData): void => {
    deps.onClearSession(payload?.reason);
    const deleted = ownDeletedAccount(deletedAccountOfRevocation(payload), deps.account);
    if (deleted !== null) deps.onAccountDeleted?.(deleted);
  };
  let guestAccessEnded = false;
  const onServerError = (payload: unknown): void => {
    const deleted = ownDeletedAccount(deletedAccountOf(payload), deps.account);
    if (deleted !== null) deps.onAccountDeleted?.(deleted);
    const reason = guestAccessEndOfSocketError(payload);
    if (reason === null) return;
    guestAccessEnded = true;
    socket.disconnect();
    deps.onGuestAccessEnded?.(reason);
  };

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
   * La PREMIÈRE authentification prend la MÊME fenêtre, et donc les MÊMES
   * familles (#18573) : le socket se branche après la première peinture, et ce
   * qui est parti entre la lecture REST et l'entrée dans les rooms était perdu.
   * Elle n'en relisait qu'une — la liste et le fil (#10573) — parce que la
   * liste des familles n'existait nulle part : #6288, #6321 et #7378 ont chacun
   * ajouté la sienne à la branche de RECONNEXION seule, et une liste qu'il faut
   * retaper à chaque branche est une liste qu'une branche finira par ne pas
   * avoir. Elle est déclarée une fois (`CATCH_UP_PERSONAL_FAMILIES`), et la
   * seule différence entre les deux branches reste le PRÉDICAT : une requête
   * encore en vol n'est jamais doublée au démarrage à froid
   * (`catchUpFirstAuthentication`), là où une coupure les relit toutes.
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
      catchUpFirstAuthentication(deps.queryClient, CATCH_UP_PERSONAL_FAMILIES);
      return;
    }
    /* UNE invalidation couvre les TROIS familles : TanStack compare les clés
       par PRÉFIXE, et `['conversations']` préfixe la liste,
       `['conversations', id]` (la case du fil) et
       `['conversations', id, 'messages']` (la page du fil). Seules les requêtes
       ACTIVES sont re-jouées — un fil fermé se contente d'être marqué périmé. */
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    /* Les familles PERSONNELLES, toutes, sans prédicat : la coupure prouve que
       ce socket n'a rien vu de l'intervalle. */
    for (const queryKey of CATCH_UP_PERSONAL_FAMILIES) {
      void deps.queryClient.invalidateQueries({ queryKey });
    }
    /* LE FIL SOCIAL ET LE RAIL DES STORIES AUSSI (#18641) — les dix `post:*`
       et les six `story:*` que cette connexion écoute écrivent `FEED_QUERY_KEY`
       et `STORY_TRAY_QUERY_KEY` (`feed-realtime.ts`), et RIEN ne les rattrapait
       après une coupure du SEUL socket : `refetchOnReconnect` suit
       `navigator.onLine`, qui ne bascule pas quand la passerelle redémarre, et
       `staleTime` périme sans rejouer — une requête MONTÉE n'a alors aucun
       déclencheur. Ces deux-là sont exactement les surfaces qu'on peut REGARDER
       pendant la coupure ; les autres caisses de cartes (favoris, auteur,
       communauté, hashtag, commentaires) se rejoignent par une navigation, donc
       par un montage, donc par une relecture — elles se soignent seules.

       `exact` sur le fil : `['feed', 'new-count']` est un ENTIER qui partage sa
       racine (`feed-new-count.ts`), et TanStack compare par PRÉFIXE. Même règle
       qu'au #6974 — nommer la famille, jamais balayer la racine.

       LE FIL DES RÉELS RESTE DEHORS, par décision : `card-caches.ts` le déclare
       `frozen: true` (D-66) — son ordre est gelé, il ne se relit ni au focus ni
       à la reconnexion. */
    void deps.queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY, exact: true });
    void deps.queryClient.invalidateQueries({ queryKey: STORY_TRAY_QUERY_KEY });
    /* ET LES HUMEURS (#18914) — le corpus `?scope=statuses` que le rail et les
       pastilles d'avatar lisent ; nommé exactement, jamais la racine `['stories']`. */
    void deps.queryClient.invalidateQueries({ queryKey: STATUS_MOODS_QUERY_KEY, exact: true });
    /* ET LES CATEGORIES DE CONVERSATION (#18641) — `['conversation-categories']`
       est une RACINE A PART, jamais couverte par le prefixe `['conversations']`
       ci-dessus : TanStack compare les cles ELEMENT PAR ELEMENT, et le premier
       differe deja. Les quatre `category:*` que cette connexion ecoute
       n'ecrivent que cette cle, et les onglets qu'elle sert vivent sur l'ecran
       de la liste — donc MONTES pendant la coupure, comme le fil et le rail.
       iOS la rehydrate sur le meme signal (`didReconnect` →
       `categoryStore.hydrate()`, « to resync server-side deletions »).

       Ces deux cles voisines sont le piege que ce lot a failli rejouer : une
       enumeration affirme AUSSI qu'elle est complete, et celle-ci s'etait
       arretee a ce qui RESSEMBLAIT au defaut (des caisses de cartes). */
    void deps.queryClient.invalidateQueries({ queryKey: CONVERSATION_CATEGORIES_QUERY_KEY });
  };

  /** `conversation:encryption-changed` — pour fermer, jamais pour rouvrir le clair (#12949). */
  const onEncryptionChanged = (payload: unknown): void => {
    if (isEncryptionChanged(payload)) applyEncryptionChanged(deps.queryClient, endToEndRegimeLedger, payload);
  };

  const onViewerRoleUpdated = viewerRoleUpdatedListener(deps.queryClient, deps.viewerId); /* #15987 — `realtime-viewer-role.ts` */
  /* Les publications, les stories et leurs commentaires (#18914) — `realtime-social.ts`. */
  const unbindSocial = bindSocialRealtime({ socket, queryClient: deps.queryClient, viewerId: deps.viewerId });
  socket.on<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
  socket.on<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
  socket.on<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_ENCRYPTION_CHANGED, onEncryptionChanged);
  socket.on<unknown>(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, onViewerRoleUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_NEW, onConversationNew);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, onAttachmentUpdated);
  socket.on<unknown>(SERVER_EVENTS.TRANSCRIPTION_READY, onTranscriptionReady);
  socket.on<unknown>(SERVER_EVENTS.TRANSCRIPTION_FAILED, onTranscriptionFailed);
  socket.on<unknown>(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, onAudioTranslationFailed);
  socket.on<unknown>(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, onAttachmentStatusUpdated);
  socket.on<unknown>(SERVER_EVENTS.ATTACHMENT_REACTION_ADDED, onAttachmentReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED, onAttachmentReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.ATTACHMENT_DELETED, onAttachmentDeleted);
  socket.on<unknown>(SERVER_EVENTS.REACTION_ADDED, onMessageReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.REACTION_REMOVED, onMessageReactionChanged);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_EDITED, onMessageEdited);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_DELETED, onMessageDeleted);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_PINNED, onMessagePinned);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_UNPINNED, onMessageUnpinned);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, onMessageHiddenForMe);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, onParticipantJoined);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, onParticipantLeft);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, onParticipantBanned);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_CLOSED, onConversationGone);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_OBSOLETED, onConversationGone);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_DELETED, onConversationDeletedForMe);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_RESTORED, onConversationRestoredForMe);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, onMessageRestoredForMe);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, onCitedPostWithdrawn);
  socket.on<unknown>(SERVER_EVENTS.READ_STATUS_UPDATED, onReadStatusUpdated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_CONSUMED, onMessageConsumed);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, onMessageViewOncePurged);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_EXPIRED, onMessageExpired);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, onMessageCountdownStarted);
  socket.on<unknown>(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, onPendingMessagesDelivered);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_STARRED, onMessageStarred);
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
  for (const event of CATEGORY_EVENTS) socket.on<unknown>(event, onCategoriesChanged);
  socket.on<unknown>(SERVER_EVENTS.USER_UPDATED, onUserUpdated);
  socket.on<AuthTokenExpiredEventData>(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, onTokenExpired);
  socket.on<AuthSessionRevokedEventData>(SERVER_EVENTS.AUTH_SESSION_REVOKED, onSessionRevoked);
  socket.on<unknown>(SERVER_EVENTS.ERROR, onServerError);

  /** `online` ⇒ `connect()` IMMÉDIAT si déconnecté (§ 1.1 de la
   * spécification) — `socket.io-client` gère déjà la gigue/le plafond de la
   * reconnexion PÉRIODIQUE ; ce raccourci évite d'attendre le prochain tir
   * d'un backoff qui pouvait culminer à 16 s pendant que le réseau vient de
   * revenir. */
  const onOnline = (): void => {
    if (!socket.connected && !guestAccessEnded) socket.connect();
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
      unbindSocial();
      unknownRows.dispose();
      for (const handle of typingTimers.values()) clearTimeoutFn(handle);
      typingTimers.clear();
      windowTarget?.removeEventListener('online', onOnline);
      socket.off<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
      socket.off<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
      socket.off<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_ENCRYPTION_CHANGED, onEncryptionChanged);
      socket.off<unknown>(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, onViewerRoleUpdated);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_NEW, onConversationNew);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, onAttachmentUpdated);
      socket.off<unknown>(SERVER_EVENTS.TRANSCRIPTION_READY, onTranscriptionReady);
      socket.off<unknown>(SERVER_EVENTS.TRANSCRIPTION_FAILED, onTranscriptionFailed);
      socket.off<unknown>(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, onAudioTranslationFailed);
      socket.off<unknown>(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, onAttachmentStatusUpdated);
      socket.off<unknown>(SERVER_EVENTS.ATTACHMENT_REACTION_ADDED, onAttachmentReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED, onAttachmentReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.ATTACHMENT_DELETED, onAttachmentDeleted);
      socket.off<unknown>(SERVER_EVENTS.REACTION_ADDED, onMessageReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.REACTION_REMOVED, onMessageReactionChanged);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_EDITED, onMessageEdited);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_DELETED, onMessageDeleted);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_PINNED, onMessagePinned);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_UNPINNED, onMessageUnpinned);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, onMessageHiddenForMe);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, onParticipantJoined);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, onParticipantLeft);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, onParticipantBanned);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_CLOSED, onConversationGone);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_OBSOLETED, onConversationGone);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_DELETED, onConversationDeletedForMe);
      socket.off<unknown>(SERVER_EVENTS.CONVERSATION_RESTORED, onConversationRestoredForMe);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, onMessageRestoredForMe);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, onCitedPostWithdrawn);
      socket.off<unknown>(SERVER_EVENTS.READ_STATUS_UPDATED, onReadStatusUpdated);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_CONSUMED, onMessageConsumed);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_VIEW_ONCE_PURGED, onMessageViewOncePurged);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_EXPIRED, onMessageExpired);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, onMessageCountdownStarted);
      socket.off<unknown>(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, onPendingMessagesDelivered);
      socket.off<unknown>(SERVER_EVENTS.MESSAGE_STARRED, onMessageStarred);
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
      for (const event of CATEGORY_EVENTS) socket.off<unknown>(event, onCategoriesChanged);
      socket.off<unknown>(SERVER_EVENTS.USER_UPDATED, onUserUpdated);
      socket.off<AuthTokenExpiredEventData>(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, onTokenExpired);
      socket.off<AuthSessionRevokedEventData>(SERVER_EVENTS.AUTH_SESSION_REVOKED, onSessionRevoked);
      socket.off<unknown>(SERVER_EVENTS.ERROR, onServerError);
      socket.disconnect();
    },
  };
}
