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

import { CONVERSATIONS_QUERY_KEY } from './conversations';
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
  };

  socket.on<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_NEW, onMessageNew);
  socket.on<unknown>(SERVER_EVENTS.TYPING_START, onTypingStart);
  socket.on<unknown>(SERVER_EVENTS.TYPING_STOP, onTypingStop);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, onUnreadUpdated);
  socket.on<unknown>(SERVER_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
  socket.on<unknown>(SERVER_EVENTS.MESSAGE_TRANSLATION, onMessageTranslation);
  socket.on<unknown>(SERVER_EVENTS.STORY_CREATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_UPDATED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_DELETED, onStoryChanged);
  socket.on<unknown>(SERVER_EVENTS.STORY_VIEWED, onStoryChanged);
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
      socket.off<AuthTokenExpiredEventData>(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, onTokenExpired);
      socket.off<AuthSessionRevokedEventData>(SERVER_EVENTS.AUTH_SESSION_REVOKED, onSessionRevoked);
      socket.disconnect();
    },
  };
}
