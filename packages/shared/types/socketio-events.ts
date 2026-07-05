/**
 * Types unifiés pour les événements Socket.IO Meeshy
 * Remplace les anciens types WebSocket pour correspondre à la nouvelle architecture Socket.IO
 */

// Import unified Participant types
import type { ParticipantType } from './participant.js';

// Import pour les événements d'appels vidéo
import type {
  CallInitiateEvent,
  CallInitiatedEvent,
  CallJoinEvent,
  CallSignalEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError,
  CallHeartbeatEvent,
  CallQualityReportEvent,
  CallReconnectingEvent,
  CallReconnectedEvent,
  CallMissedEvent,
  CallQualityAlertEvent,
  CallInitiateAck,
  CallJoinAck,
  CallTranscriptionSegmentEvent,
  CallTranslatedSegmentEvent,
  CallTranscriptionCapabilityEvent,
  CallTranscriptionRoleEvent,
  CallTranslationRequestEvent,
  CallTranslationResponseEvent,
  CallAudioChunkEvent,
  CallQualityFeedbackEvent,
  CallScreenCaptureEvent,
  CallTranslationRequestedEvent,
  CallTranslationEnabledEvent,
  CallTranscriptionResultEvent,
  CallAlreadyAnsweredEvent,
  CallForceLeaveClientEvent,
  CallForceLeaveServerEvent,
  CallRequestIceServersEvent,
  CallIceServersRefreshedEvent,
} from './video-call.js';

// Import pour les événements sociaux (posts, stories, statuts, commentaires)
import type {
  PostCreatedEventData,
  PostUpdatedEventData,
  PostDeletedEventData,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  PostBookmarkedEventData,
  StoryCreatedEventData,
  StoryUpdatedEventData,
  StoryDeletedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
  StoryUnreactedEventData,
  StatusCreatedEventData,
  StatusUpdatedEventData,
  StatusDeletedEventData,
  StatusReactedEventData,
  StatusUnreactedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
  CommentMediaUpdatedEventData,
  CommentReactionUpdateEventData,
  CommentReactionSyncEventData,
  PostReactionUpdateEventData,
  PostReactionSyncEventData,
  PostReactionAddData,
  PostReactionRemoveData,
} from './post.js';

// ===== ROOM HELPERS =====
// Convention: entity:${id} (colons, jamais underscores)

export const ROOMS = {
  conversation: (id: string) => `conversation:${id}`,
  user: (id: string) => `user:${id}`,
  feed: (id: string) => `feed:${id}`,
  call: (id: string) => `call:${id}`,
  post: (id: string) => `post:${id}`,
  adminAgent: () => 'admin:agent',
} as const;

// Canal Redis pub/sub partagé service agent / gateway pour notifier les
// dashboards admin (relayé vers la room Socket.IO `admin:agent`)
export const AGENT_ADMIN_EVENT_CHANNEL = 'agent:admin-event';

// ===== CONSTANTES D'ÉVÉNEMENTS =====
// Convention: entity:action-word (colons + hyphens, jamais underscores)

// Événements du serveur vers le client
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_TRANSLATION: 'message:translation',
  MESSAGE_TRANSLATED: 'message:translated',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  /**
   * Snapshot émis à l'authentification socket : liste des userIds actuellement
   * connectés (présents dans `connectedUsers` Map serveur) parmi les participants
   * des conversations du nouvel arrivant. Permet au client de seed son store
   * de présence sans attendre un changement d'état.
   */
  PRESENCE_SNAPSHOT: 'presence:snapshot',
  CONVERSATION_JOINED: 'conversation:joined',
  CONVERSATION_LEFT: 'conversation:left',
  /** Server emits when a `conversation:join` is rejected (banned, not a
   * member, conversation deleted, etc.). Carries the conversationId so
   * clients can route the error to the right ViewModel and purge stale
   * cache entries. */
  CONVERSATION_JOIN_ERROR: 'conversation:join-error',
  AUTHENTICATED: 'authenticated',
  AUTH_TOKEN_EXPIRED: 'auth:token-expired',
  AUTH_SESSION_REVOKED: 'auth:session-revoked',
  ERROR: 'error',
  NOTIFICATION: 'notification',
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_DELETED: 'notification:deleted',
  NOTIFICATION_COUNTS: 'notification:counts',
  SYSTEM_MESSAGE: 'system:message',
  CONVERSATION_STATS: 'conversation:stats',
  CONVERSATION_ONLINE_STATS: 'conversation:online-stats',
  CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  REACTION_SYNC: 'reaction:sync',
  ATTACHMENT_REACTION_ADDED: 'attachment:reaction-added',
  ATTACHMENT_REACTION_REMOVED: 'attachment:reaction-removed',
  MENTION_CREATED: 'mention:created',
  CALL_INITIATED: 'call:initiated',
  CALL_PARTICIPANT_JOINED: 'call:participant-joined',
  CALL_PARTICIPANT_LEFT: 'call:participant-left',
  CALL_ENDED: 'call:ended',
  CALL_SIGNAL: 'call:signal',
  CALL_MEDIA_TOGGLED: 'call:media-toggled',
  CALL_ERROR: 'call:error',
  /**
   * --- Call events RESERVED (no emitter yet) ---
   * Declared for upcoming voice/video phases:
   * - quality monitoring (CALL_QUALITY_ALERT, CALL_SCREEN_CAPTURE_ALERT)
   * - in-call translation pipeline (CALL_TRANSLATED_SEGMENT,
   *   CALL_TRANSLATION_REQUESTED/ENABLED, CALL_TRANSCRIPTION_RESULT)
   * - state edge cases (CALL_MISSED, CALL_ALREADY_ANSWERED — iOS already
   *   subscribes via MessageSocketManager but the gateway never emits)
   * Keep names + types in sync until the emitters land.
   */
  CALL_MISSED: 'call:missed',
  CALL_QUALITY_ALERT: 'call:quality-alert',
  CALL_TRANSLATED_SEGMENT: 'call:translated-segment',
  CALL_TRANSLATION_REQUESTED: 'call:translation-requested',
  CALL_TRANSLATION_ENABLED: 'call:translation-enabled',
  CALL_TRANSCRIPTION_RESULT: 'call:transcription-result',
  CALL_ALREADY_ANSWERED: 'call:already-answered',
  CALL_SCREEN_CAPTURE_ALERT: 'call:screen-capture-alert',
  /** Server-side GC/admin forced the call to end — clients should dismiss call UI. */
  CALL_FORCE_LEAVE: 'call:force-leave',
  /** Gateway pushes fresh TURN credentials to the client after a `call:request-ice-servers` event. */
  CALL_ICE_SERVERS_REFRESHED: 'call:ice-servers-refreshed',
  READ_STATUS_UPDATED: 'read-status:updated',
  /**
   * Same payload as `READ_STATUS_UPDATED`, correctly namespaced under the
   * `message:` entity per the `entity:action-word` convention (the legacy
   * name hyphenates the entity itself, `read-status`, which violates it).
   * Emitted in parallel with `READ_STATUS_UPDATED` for ~3 months so clients
   * can migrate independently; see tasks/socketio-events-cleanup.md #3.
   */
  MESSAGE_READ_STATUS_UPDATED: 'message:read-status-updated',
  MESSAGE_CONSUMED: 'message:consumed',
  PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
  CONVERSATION_UPDATED: 'conversation:updated',
  /**
   * Emitted to the user-rooms of EVERY participant of a freshly-created
   * conversation — INCLUDING the creator. Replaces the previous overload
   * of `NOTIFICATION_NEW` (which was only sent to invitees, leaving the
   * creator without any socket signal). Carries the canonical conversation
   * payload so clients can prepend the row without an extra GET. Both web
   * and iOS subscribe to this directly; the legacy `notification:new` with
   * `type=new_conversation_*` is kept emitted in parallel for ~3 months
   * so older clients keep working during rollout.
   */
  CONVERSATION_NEW: 'conversation:new',
  /**
   * Emitted to the OTHER party's user-room when a pending friend request is
   * removed via `DELETE /friend-requests/:id` — either the sender cancelling
   * their own outgoing request, or the receiver declining/removing it without
   * an explicit accept/reject. Previously this path emitted NOTHING, leaving
   * the counterpart's pending-request list stale until their next full
   * refetch (same class of gap `CONVERSATION_NEW` fixed for conversation
   * creation). Realtime-only signal — no persisted `Notification` row.
   */
  FRIEND_REQUEST_CANCELLED: 'friend-request:cancelled',
  /**
   * Emitted to the RECEIVER's user-room when `POST /friend-requests`
   * creates a new pending request. Same rationale as `CONVERSATION_NEW`:
   * replaces string-discrimination on `NOTIFICATION_NEW(type=friend_request)`
   * with a typed, domain-specific event. The legacy `notification:new` is
   * kept emitted in parallel for ~3 months so older clients keep working.
   */
  FRIEND_REQUEST_NEW: 'friend-request:new',
  /**
   * Emitted to the ORIGINAL SENDER's user-room when the receiver accepts
   * via `PATCH /friend-requests/:id`. Typed counterpart of
   * `NOTIFICATION_NEW(type=friend_accepted)`, emitted in parallel.
   */
  FRIEND_REQUEST_ACCEPTED: 'friend-request:accepted',
  /**
   * Emitted to the ORIGINAL SENDER's user-room when the receiver rejects
   * via `PATCH /friend-requests/:id`. Typed counterpart of the legacy
   * system notification, emitted in parallel.
   */
  FRIEND_REQUEST_REJECTED: 'friend-request:rejected',
  CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
  CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
  /**
   * GLOBAL soft-delete by the creator/an admin (`DELETE /conversations/:id`):
   * `Conversation.isActive` is set to `false` (with `closedAt`/`closedBy`)
   * and the conversation disappears from every member's list. Broadcast to
   * the **conversation room** (`ROOMS.conversation`) so all members react —
   * contrast with `CONVERSATION_DELETED` below.
   */
  CONVERSATION_CLOSED: 'conversation:closed',
  /**
   * PER-USER "delete for me" (`DELETE /conversations/:id/delete-for-me`):
   * removes the conversation from the caller's own device list only — the
   * conversation stays active for every other participant. Broadcast to the
   * caller's **user room** (`ROOMS.user`) only, so their other devices stay
   * in sync — contrast with `CONVERSATION_CLOSED` above.
   */
  CONVERSATION_DELETED: 'conversation:deleted',
  CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
  ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  LINK_MESSAGE_NEW: 'link:message:new',
  /**
   * Emitted whenever an attachment on an existing message has been
   * enriched server-side : Whisper transcription finalized, NLLB+TTS
   * translation finalized for one language, etc.
   *
   * Payload : { conversationId, messageId, attachment } — the FULL
   * attachment object as serialized by `serializeAttachmentForSocket`
   * (parity with the `message:new` shape). Clients replace the matching
   * attachment in their store atomically and refresh derived metadata
   * (transcription dictionaries, translated audio listings).
   *
   * Replaces the need for separate `audio-transcribed` / `audio-translated`
   * events — one generic delta event is enough for any attachment field
   * update post-creation.
   */
  MESSAGE_ATTACHMENT_UPDATED: 'message:attachment-updated',
  /**
   * UNE seule traduction quand une seule langue est demandée
   */
  AUDIO_TRANSLATION_READY: 'audio:translation-ready',
  /**
   * UNE traduction parmi plusieurs (progressif, pas la dernière)
   */
  AUDIO_TRANSLATIONS_PROGRESSIVE: 'audio:translations-progressive',
  /**
   * DERNIÈRE traduction + signal que toutes les traductions sont terminées
   */
  AUDIO_TRANSLATIONS_COMPLETED: 'audio:translations-completed',
  /**
   * Transcription originale prête (avant traductions)
   */
  TRANSCRIPTION_READY: 'audio:transcription-ready',
  /**
   * Emitted when a server-side translation attempt (text or audio) has
   * permanently failed — e.g. the translator service rejected the request
   * or the ZMQ pipeline returned an error after all retries.  Lets clients
   * clear any "translating…" spinner and surface a retry affordance
   * instead of waiting indefinitely for a result that will never arrive.
   *
   * Emitted to the conversation room so all participants on any device
   * receive the failure at the same time.
   *
   * Payload: `TranslationFailedEventData`
   */
  TRANSLATION_FAILED: 'translation:failed',
  /**
   * Emitted when audio translation processing has permanently failed for a
   * specific attachment (ZMQ translator returned an error code after all
   * retries). Lets clients clear any "processing…" spinner on the audio
   * bubble and surface a retry affordance.
   *
   * Payload: `AudioTranslationFailedEventData`
   */
  AUDIO_TRANSLATION_FAILED: 'audio:translation-failed',
  /**
   * Emitted when audio transcription has permanently failed for a specific
   * attachment. Lets clients render a "transcription unavailable" state
   * rather than keeping the transcript placeholder visible forever.
   *
   * Payload: `TranscriptionFailedEventData`
   */
  TRANSCRIPTION_FAILED: 'audio:transcription-failed',

  /**
   * --- Message pinning ---
   * Emitted by the gateway on the pin/unpin REST routes
   * (POST/DELETE /conversations/:id/messages/:messageId/pin) to the
   * conversation room. iOS subscribes via MessageSocketManager
   * (messagePinned / messageUnpinned) and applies the change through
   * persistence so other participants and devices see pin state live.
   */
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',

  // --- Delivery queue ---
  PENDING_MESSAGES_DELIVERED: 'message:pending-delivered',

  // --- Location sharing ---
  LOCATION_SHARED: 'location:shared',
  LOCATION_LIVE_STARTED: 'location:live-started',
  LOCATION_LIVE_UPDATED: 'location:live-updated',
  LOCATION_LIVE_STOPPED: 'location:live-stopped',

  // --- Social / Posts ---
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_DELETED: 'post:deleted',
  POST_LIKED: 'post:liked',
  POST_UNLIKED: 'post:unliked',
  POST_REPOSTED: 'post:reposted',
  POST_BOOKMARKED: 'post:bookmarked',

  // --- Stories ---
  STORY_CREATED: 'story:created',
  STORY_UPDATED: 'story:updated',
  STORY_DELETED: 'story:deleted',
  STORY_VIEWED: 'story:viewed',
  STORY_REACTED: 'story:reacted',
  STORY_UNREACTED: 'story:unreacted',
  STORY_TRANSLATION_UPDATED: 'story:translation-updated',

  // --- Moods/Statuses ---
  STATUS_CREATED: 'status:created',
  STATUS_UPDATED: 'status:updated',
  STATUS_DELETED: 'status:deleted',
  STATUS_REACTED: 'status:reacted',
  STATUS_UNREACTED: 'status:unreacted',

  // --- Comments ---
  COMMENT_ADDED: 'comment:added',
  COMMENT_DELETED: 'comment:deleted',
  COMMENT_LIKED: 'comment:liked',
  COMMENT_REACTION_ADDED: 'comment:reaction-added',
  COMMENT_REACTION_REMOVED: 'comment:reaction-removed',
  COMMENT_REACTION_SYNC: 'comment:reaction-sync',

  // --- Post reactions (Phase 3B) ---
  POST_REACTION_ADDED: 'post:reaction-added',
  POST_REACTION_REMOVED: 'post:reaction-removed',
  POST_REACTION_SYNC: 'post:reaction-sync',

  // --- Post/Comment Translations ---
  POST_TRANSLATION_UPDATED: 'post:translation-updated',
  COMMENT_TRANSLATION_UPDATED: 'comment:translation-updated',

  // --- Comment media (audio transcription/translation ready) ---
  COMMENT_MEDIA_UPDATED: 'comment:media-updated',

  // --- User Preferences ---
  USER_PREFERENCES_UPDATED: 'user:preferences-updated',
  USER_PREFERENCES_REORDERED: 'user:preferences-reordered',

  // --- User Profile (realtime propagation to conversation partners) ---
  USER_UPDATED: 'user:updated',

  // --- Conversation Categories ---
  CATEGORY_CREATED: 'category:created',
  CATEGORY_UPDATED: 'category:updated',
  CATEGORY_DELETED: 'category:deleted',
  CATEGORIES_REORDERED: 'categories:reordered',

  // --- Agent admin dashboard (room admin:agent) ---
  AGENT_ADMIN_EVENT: 'agent:admin-event',

  // --- Connection health ---
  /**
   * Emitted in response to a client `heartbeat` event.
   * Lets clients measure round-trip latency and detect server-side processing
   * stalls (socket connected but gateway event loop starved).
   * Payload: { serverTime: ISO-string, latencyMs: number }
   */
  HEARTBEAT_ACK: 'heartbeat:ack',
} as const;

// Événements du client vers le serveur
export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  AUTHENTICATE: 'authenticate',
  REQUEST_TRANSLATION: 'translation:request',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  REACTION_REQUEST_SYNC: 'reaction:request-sync',
  ATTACHMENT_REACTION_ADD: 'attachment:reaction-add',
  ATTACHMENT_REACTION_REMOVE: 'attachment:reaction-remove',
  CALL_INITIATE: 'call:initiate',
  CALL_JOIN: 'call:join',
  CALL_LEAVE: 'call:leave',
  CALL_SIGNAL: 'call:signal',
  CALL_TOGGLE_AUDIO: 'call:toggle-audio',
  CALL_TOGGLE_VIDEO: 'call:toggle-video',
  CALL_END: 'call:end',
  CALL_HEARTBEAT: 'call:heartbeat',
  CALL_QUALITY_REPORT: 'call:quality-report',
  CALL_RECONNECTING: 'call:reconnecting',
  CALL_RECONNECTED: 'call:reconnected',
  CALL_BACKGROUNDED: 'call:backgrounded',
  CALL_FOREGROUNDED: 'call:foregrounded',
  CALL_TRANSCRIPTION_SEGMENT: 'call:transcription-segment',
  CALL_TRANSCRIPTION_CAPABILITY: 'call:transcription-capability',
  CALL_TRANSCRIPTION_ROLE: 'call:transcription-role',
  CALL_TRANSLATION_REQUEST: 'call:translation-request',
  CALL_TRANSLATION_RESPONSE: 'call:translation-response',
  CALL_AUDIO_CHUNK: 'call:audio-chunk',
  CALL_QUALITY_FEEDBACK: 'call:quality-feedback',
  CALL_SCREEN_CAPTURE_DETECTED: 'call:screen-capture-detected',
  /** Preflight sent before `call:initiate` to evict zombie call sessions. */
  CALL_FORCE_LEAVE: 'call:force-leave',
  /** Reconnect probe: client asks gateway if an active call still exists. */
  CALL_CHECK_ACTIVE: 'call:check-active',
  /** Request fresh TURN credentials before the current TTL expires. */
  CALL_REQUEST_ICE_SERVERS: 'call:request-ice-servers',

  // --- Location sharing ---
  LOCATION_SHARE: 'location:share',
  LOCATION_LIVE_START: 'location:live-start',
  LOCATION_LIVE_UPDATE: 'location:live-update',
  LOCATION_LIVE_STOP: 'location:live-stop',

  // --- Feed subscription ---
  FEED_SUBSCRIBE: 'feed:subscribe',
  FEED_UNSUBSCRIBE: 'feed:unsubscribe',

  // --- Post room membership ---
  JOIN_POST: 'post:join',
  LEAVE_POST: 'post:leave',

  // --- Comment reactions ---
  COMMENT_REACTION_ADD: 'comment:reaction-add',
  COMMENT_REACTION_REMOVE: 'comment:reaction-remove',
  COMMENT_REACTION_REQUEST_SYNC: 'comment:reaction-request-sync',

  // --- Post reactions (Phase 3B) ---
  POST_REACTION_ADD: 'post:reaction-add',
  POST_REACTION_REMOVE: 'post:reaction-remove',
  POST_REACTION_REQUEST_SYNC: 'post:reaction-request-sync',

  // --- Presence ---
  HEARTBEAT: 'heartbeat',

  // --- Agent admin dashboard (souscription room admin:agent) ---
  ADMIN_AGENT_SUBSCRIBE: 'admin:agent-subscribe',
  ADMIN_AGENT_UNSUBSCRIBE: 'admin:agent-unsubscribe',
} as const;

// ===== ÉVÉNEMENTS SOCKET.IO =====

// Types utilitaires pour les constantes
export type ServerEventNames = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
export type ClientEventNames = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];

/**
 * Données pour l'événement de suppression de message
 */
export interface MessageDeletedEventData {
  readonly messageId: string;
  readonly conversationId: string;
}

/**
 * Données pour l'événement de participation à une conversation
 */
export interface ConversationParticipationEventData {
  readonly conversationId: string;
  readonly userId: string;
}

/**
 * Données pour l'événement d'authentification
 */
export interface AuthenticatedEventData {
  readonly success: boolean;
  readonly user?: SocketIOUser;
  readonly error?: string;
}

/**
 * Données pour l'événement d'erreur
 */
export interface ErrorEventData {
  readonly message: string;
  readonly code?: string;
}

export interface AuthTokenExpiredEventData {
  readonly code: 'token_expired';
  readonly message: string;
}

export interface AuthSessionRevokedEventData {
  readonly code: 'session_revoked';
  readonly message: string;
  readonly reason: 'password_changed' | 'logout_all_devices' | 'admin_revoke';
}

/**
 * Payload emitted by the server in response to a client `heartbeat` event.
 * Clients can measure RTT = (received at) - clientTime, and detect stalled
 * gateway event loops even while the WebSocket connection appears healthy.
 */
export interface HeartbeatAckEventData {
  /** ISO-8601 timestamp of the server's response — use for clock-skew diagnostics */
  readonly serverTime: string;
  /**
   * Round-trip latency hint computed by the gateway when the client includes
   * a `clientTime` in the heartbeat payload (optional, for backwards compat
   * with older clients that emit bare `heartbeat` with no payload).
   * Undefined when the client did not supply `clientTime`.
   */
  readonly latencyHintMs?: number;
}

/**
 * Données de notification générique
 * Aligned with NotificationFormatter.formatNotification() output.
 *
 * `title` / `subtitle` mirror the APN/FCM push payload header so the iOS
 * in-app toast (driven by Socket.IO when the app is foreground + socket
 * connected) can render the same "sender + conversation" framing as the
 * native iOS banner. They are derived from `buildPushHeader()` server-side
 * and propagated identically over the push channel and the socket channel
 * to keep both surfaces in sync.
 *  - `title`      : sender display name (or `customTitle` for system events,
 *                   `"Meeshy"` fallback when no actor)
 *  - `subtitle`   : conversation title for `new_message` notifications in
 *                   group/global/public/community conversations.
 *                   `undefined` for 1-on-1 direct messages and for non-message
 *                   notification types (reactions / mentions / system events).
 */
export interface NotificationEventData {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly priority?: string;
  /** Sender display name (or custom override / "Meeshy" fallback). */
  readonly title?: string;
  /** Conversation title for group messages — undefined for direct messages
   *  and non-message notification types. */
  readonly subtitle?: string;
  readonly content: string;
  readonly actor?: {
    readonly id?: string;
    readonly username?: string;
    readonly displayName?: string;
    readonly avatar?: string;
  };
  readonly context?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly state: {
    readonly isRead: boolean;
    readonly readAt: Date | null;
    readonly createdAt: Date;
    readonly expiresAt?: Date;
  };
  readonly delivery?: {
    readonly emailSent: boolean;
    readonly pushSent: boolean;
  };
}

/**
 * Payload de `CONVERSATION_NEW` — émis aux user-rooms de TOUS les
 * participants (créateur inclus) lors de la création d'une conversation.
 * Champs minimaux pour permettre au client de prepend la row sans GET
 * supplémentaire ; les détails enrichis (participants complets, tags,
 * preferences user-scoped) restent fetchables via `/conversations/:id`
 * et seront mergés au moment où le client en a besoin.
 */
export interface ConversationNewEventData {
  readonly conversationId: string;
  readonly conversationType: string;          // 'direct' | 'group' | 'public' | 'community' | 'global' | 'broadcast'
  readonly title: string | null;
  readonly creatorId: string;
  readonly participantIds: readonly string[]; // tous les participants y compris le créateur
  readonly createdAt: string;                 // ISO8601
}

/**
 * Payload de `FRIEND_REQUEST_CANCELLED` — émis à l'user-room de l'AUTRE
 * partie (pas l'auteur de l'action) lors d'un `DELETE /friend-requests/:id`.
 */
export interface FriendRequestCancelledEventData {
  readonly friendRequestId: string;
  readonly cancelledBy: string; // userId de qui a déclenché la suppression
}

/**
 * Payload de `FRIEND_REQUEST_NEW` — émis à l'user-room du DESTINATAIRE
 * lors d'un `POST /friend-requests`.
 */
export interface FriendRequestNewEventData {
  readonly friendRequestId: string;
  readonly senderId: string;
  readonly receiverId: string;
}

/**
 * Payload de `FRIEND_REQUEST_ACCEPTED` — émis à l'user-room de l'EXPÉDITEUR
 * original lors d'un `PATCH /friend-requests/:id` avec `status=accepted`.
 */
export interface FriendRequestAcceptedEventData {
  readonly friendRequestId: string;
  readonly accepterId: string;
  readonly conversationId?: string;
}

/**
 * Payload de `FRIEND_REQUEST_REJECTED` — émis à l'user-room de l'EXPÉDITEUR
 * original lors d'un `PATCH /friend-requests/:id` avec `status=rejected`.
 */
export interface FriendRequestRejectedEventData {
  readonly friendRequestId: string;
  readonly rejecterId: string;
}

/**
 * Payload de `USER_UPDATED` — émis aux user-rooms de tous les contacts
 * (utilisateurs partageant au moins une conversation avec `userId`) quand un
 * profil change (displayName, avatar, banner, username). Delta léger : seuls
 * les champs modifiés sont présents dans `changes`, pas le user complet.
 * Voir tasks/socketio-events-cleanup.md #6.
 */
export interface UserUpdatedEventData {
  readonly userId: string;
  readonly changes: Readonly<{
    displayName?: string;
    avatar?: string | null;
    banner?: string | null;
    username?: string;
    firstName?: string;
    lastName?: string;
  }>;
}

/**
 * Notification marquée comme lue
 */
export interface NotificationReadEventData {
  readonly notificationId: string;
}

/**
 * Notification supprimée
 */
export interface NotificationDeletedEventData {
  readonly notificationId: string;
}

/**
 * Compteurs de notifications
 */
export interface NotificationCountsEventData {
  readonly total: number;
  readonly unread: number;
  readonly byType?: Record<string, number>;
}

/**
 * Données de mise à jour de statut d'attachement
 * Emitted by gateway when an attachment action occurs (e.g., download, view)
 */
export interface AttachmentStatusUpdatedEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly action: string;
  readonly updatedAt: Date;
}

/**
 * Payload de `SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED`.
 *
 * Reçu quand un worker gateway a enrichi un attachment d'un message
 * existant (transcription Whisper finalisée, traduction audio NLLB+TTS
 * finalisée pour une langue, etc.). `attachment` est la forme complète
 * sérialisée par `serializeAttachmentForSocket` côté gateway — incluant
 * `transcription` et `translations` enrichis. Le client remplace
 * l'attachment correspondant dans son store atomiquement.
 */
export interface AttachmentUpdatedEventData {
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachment: unknown;
}

/**
 * Données de message système
 */
export interface SystemMessageEventData {
  readonly type: string;
  readonly content: string;
  readonly timestamp: Date;
}

/**
 * Données pour l'événement de statistiques de conversation
 */
export interface ConversationStatsEventData {
  readonly conversationId: string;
  readonly stats: ConversationStatsDTO;
}

/**
 * Données pour l'événement de statistiques en ligne
 */
export interface ConversationOnlineStatsEventData {
  readonly conversationId: string;
  readonly onlineUsers: readonly ConversationOnlineUser[];
  readonly updatedAt: Date;
}

/**
 * Données pour l'événement de mise à jour du compteur de messages non lus
 */
export interface ConversationUnreadUpdatedEventData {
  readonly conversationId: string;
  readonly unreadCount: number;
}

/**
 * Données pour l'événement de mise à jour de réaction
 */
export interface ReactionUpdateEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: {
    readonly emoji: string;
    readonly count: number;
    readonly participantIds: readonly string[];
    readonly hasCurrentUser: boolean;
  };
  readonly timestamp: Date;
}

/**
 * Données pour l'événement de synchronisation des réactions
 */
export interface ReactionSyncEventData {
  readonly messageId: string;
  readonly reactions: readonly {
    readonly emoji: string;
    readonly count: number;
    readonly participantIds: readonly string[];
    readonly hasCurrentUser: boolean;
  }[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

/**
 * BUG2 A' — delta de réaction par-image. `reactionSummary` porte les comptes
 * agrégés (emoji→count) de l'attachment APRÈS l'action. Le client met à jour les
 * comptes ; l'état « ma réaction » reste maintenu côté client via
 * `currentUserReactions` (optimiste + re-baké au cold-load REST), miroir des
 * réactions message-level.
 */
export interface AttachmentReactionUpdateEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly reactionSummary: Readonly<Record<string, number>>;
  readonly timestamp: string;
}

/**
 * Résumé des statuts de lecture pour enrichir les événements temps réel
 */
export interface ReadStatusSummary {
  readonly totalMembers: number;
  readonly deliveredCount: number;
  readonly readCount: number;
}

/**
 * Données pour l'événement de mise à jour du statut de lecture
 */
export interface ReadStatusUpdatedEventData {
  readonly conversationId: string;
  readonly participantId: string;
  readonly userId: string;
  readonly type: 'read' | 'received';
  readonly updatedAt: Date;
  readonly summary: ReadStatusSummary;
  /**
   * Read frontier of `userId` (the actor) AT broadcast time, read from
   * `ConversationReadCursor.lastReadAt`. Scoped to `userId`: it lets that
   * user's OTHER devices sync their own read cursor (multi-device read
   * sync). Recipients whose id differs from `userId` MUST ignore it — a
   * peer reading does not move your own cursor. Read receipts are monotone,
   * so a client applies it only when strictly newer than its local cursor.
   * `null` when the actor has no read cursor yet.
   *
   * Present ONLY on `type: 'read'` broadcasts — the sole action that advances
   * a read cursor. ABSENT (`undefined`) on `type: 'received'` (delivery never
   * moves `lastReadAt`) and on the bulk auto-deliver broadcast
   * (`MessageHandler._autoDeliverToOnlineRecipients`), which carries only the
   * aggregate `summary` for sender checkmarks. Travels paired with
   * `unreadCount`: a consumer applies them together or not at all.
   */
  readonly lastReadAt?: Date | null;
  /**
   * Server-authoritative unread count for `userId` in this conversation
   * after the read/receive action. Same `userId` scoping and same
   * present-on-dedicated-routes / absent-on-auto-deliver semantics as
   * `lastReadAt`; applied as-is by the actor's devices when accepted.
   */
  readonly unreadCount?: number;
}

/**
 * Données pour l'événement de consommation d'un message view-once
 */
export interface MessageConsumedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly viewOnceCount: number;
  readonly maxViewOnceCount: number;
  readonly isFullyConsumed: boolean;
}

// Import unified TranslatedAudioData from translated-audio.ts
import type { TranslatedAudioData } from './translated-audio.js';
// Import TranscriptionSegment for real-time audio synchronization
import type { TranscriptionSegment } from './attachment-transcription.js';

// Re-export for convenience
export type { TranslatedAudioData };

/**
 * Structure commune pour les événements de traduction audio (une traduction)
 * Utilisée pour:
 * - AUDIO_TRANSLATION_READY (langue unique)
 * - AUDIO_TRANSLATIONS_PROGRESSIVE (une traduction parmi plusieurs)
 * - AUDIO_TRANSLATIONS_COMPLETED (dernière traduction)
 */
export interface AudioTranslationEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly language: string;
  readonly translatedAudio: {
    readonly id: string;
    readonly targetLanguage: string;
    readonly url: string;
    readonly transcription: string;
    readonly durationMs: number;
    readonly format: string;
    readonly cloned: boolean;
    readonly quality: number;
    readonly voiceModelId?: string;
    readonly ttsModel: string;
    /**
     * Segments de transcription traduits avec timestamps pour synchronisation audio/texte
     * Inclut speakerId et voiceSimilarityScore pour diarisation
     */
    readonly segments?: readonly TranscriptionSegment[];
  };
  readonly processingTimeMs?: number;
}

/**
 * Événement pour UNE seule traduction quand une seule langue est demandée
 */
export type AudioTranslationReadyEventData = AudioTranslationEventData;

/**
 * Événement pour UNE traduction parmi plusieurs (progressif, pas la dernière)
 */
export type AudioTranslationsProgressiveEventData = AudioTranslationEventData;

/**
 * Événement pour la DERNIÈRE traduction + signal que toutes sont terminées
 */
export type AudioTranslationsCompletedEventData = AudioTranslationEventData;

/**
 * Données pour l'événement de transcription seule prête (sans traduction)
 * Utilisé lorsque seule la transcription est demandée, sans génération d'audios traduits
 */
export interface TranscriptionReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription: {
    readonly id: string;
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
    readonly durationMs?: number;
    readonly source?: string;
    readonly segments?: readonly TranscriptionSegment[];
    // Champs de diarisation (speaker detection)
    readonly speakerCount?: number;
    readonly primarySpeakerId?: string;
    readonly senderVoiceIdentified?: boolean;
    readonly senderSpeakerId?: string;
    // Analyse détaillée des speakers avec caractéristiques vocales (pitch, fréquences, etc.)
    readonly speakerAnalysis?: Record<string, unknown>;
  };
  readonly processingTimeMs?: number;
}

/**
 * Emitted when a server-side translation attempt has permanently failed.
 * Lets clients clear any "translating…" spinner and surface a retry
 * affordance instead of waiting indefinitely for a result that will
 * never arrive. Emitted to the conversation room so all participants
 * receive the failure at the same time.
 */
export interface TranslationFailedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly taskId?: string;
}

export interface AudioTranslationFailedEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly errorCode?: string;
  readonly taskId?: string;
}

export interface TranscriptionFailedEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly error: string;
  readonly errorCode?: string;
  readonly taskId?: string;
}

// ===== LOCATION SHARING EVENTS =====

export interface LocationShareData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly placeName?: string;
  readonly address?: string;
}

export interface LocationSharedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly placeName?: string;
  readonly address?: string;
  readonly timestamp: Date;
}

export interface LocationLiveStartData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
}

export interface LocationLiveStartedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly username: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
  readonly expiresAt: Date;
  readonly startedAt: Date;
}

export interface LocationLiveUpdateData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly speed?: number;
  readonly heading?: number;
}

export interface LocationLiveUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly accuracy?: number;
  readonly speed?: number;
  readonly heading?: number;
  readonly timestamp: Date;
}

export interface LocationLiveStopData {
  readonly conversationId: string;
}

export interface LocationLiveStoppedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly stoppedAt: Date;
}

/**
 * Données pour l'événement de mise à jour du rôle d'un participant
 * Émis lorsqu'un admin/modérateur modifie le rôle d'un participant dans une conversation
 */
export interface ParticipantRoleUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly newRole: string;
  readonly updatedBy: string;
  /** Minimum guaranteed shape from gateway; actual payload may include additional fields */
  readonly participant?: {
    readonly id: string;
    readonly role: string;
    readonly displayName: string;
    readonly userId: string | null;
  };
}

/**
 * Données pour l'événement de mise à jour des traductions d'un textObject de story.
 * Émis après que le pipeline ZMQ a traduit un textObject de storyEffects.
 */
export interface StoryTranslationUpdatedEventData {
  readonly postId: string;
  readonly textObjectIndex: number;
  readonly translations: Record<string, string>;
}

/**
 * Snapshot complet des préférences user/conversation envoyé dans les
 * événements `USER_PREFERENCES_UPDATED` (scope conversation). Reflète
 * `UserConversationPreferences` côté Prisma.
 *
 * @see schema.prisma model UserConversationPreferences
 */
export interface ConversationPreferencesPayload {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly mentionsOnly: boolean;
  readonly isArchived: boolean;
  readonly tags: readonly string[];
  readonly categoryId: string | null;
  readonly orderInCategory: number | null;
  readonly customName: string | null;
  readonly reaction: string | null;
  readonly deletedForUserAt: string | null;
  readonly clearHistoryBefore: string | null;
}

/**
 * Variante "préférences user-level" : émis par
 * `me/preferences/{category}` factory. Le client doit refetch la
 * catégorie nommée.
 */
export interface UserPreferencesCategoryUpdatedEventData {
  readonly userId: string;
  readonly category: string;
}

/**
 * Variante "préférences scope conversation" : émis par
 * `PUT/DELETE /user-preferences/conversations/:id`. Payload complet
 * incluant `version` pour la résolution optimistic vs socket.
 */
export interface UserPreferencesConversationUpdatedEventData {
  readonly userId: string;
  readonly conversationId: string;
  readonly version: number;
  /** true si l'événement résulte d'un DELETE (reset aux defaults). */
  readonly reset: boolean;
  /** null si reset === true (le client applique ses defaults locaux). */
  readonly preferences: ConversationPreferencesPayload | null;
}

/**
 * Snapshot complet des préférences user/communauté envoyé dans les
 * événements `USER_PREFERENCES_UPDATED` (scope communauté). Reflète
 * `UserCommunityPreferences` côté Prisma.
 *
 * @see schema.prisma model UserCommunityPreferences
 */
export interface CommunityPreferencesPayload {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly isArchived: boolean;
  readonly isHidden: boolean;
  readonly notificationLevel: 'all' | 'mentions' | 'none';
  readonly customName: string | null;
  readonly categoryId: string | null;
  readonly orderInCategory: number | null;
}

/**
 * Variante "préférences scope communauté" : émis par
 * `PUT/DELETE /user-preferences/communities/:id`. Sibling de
 * `UserPreferencesConversationUpdatedEventData` (pas de `version` :
 * `UserCommunityPreferences` n'a pas ce champ — le client réagit en
 * invalidant son cache plutôt qu'en réconciliant un snapshot optimiste).
 */
export interface UserPreferencesCommunityUpdatedEventData {
  readonly userId: string;
  readonly communityId: string;
  /** true si l'événement résulte d'un DELETE (reset aux defaults). */
  readonly reset: boolean;
  /** null si reset === true (le client applique ses defaults locaux). */
  readonly preferences: CommunityPreferencesPayload | null;
}

/**
 * Union des trois scopes possibles. La présence de `conversationId` /
 * `communityId` discrimine côté client (sinon c'est le scope `category`).
 */
export type UserPreferencesUpdatedEventData =
  | UserPreferencesCategoryUpdatedEventData
  | UserPreferencesConversationUpdatedEventData
  | UserPreferencesCommunityUpdatedEventData;

/**
 * Émis par `POST /user-preferences/conversations/reorder` après mise
 * à jour batch de l'ordre dans une catégorie.
 */
export interface UserPreferencesReorderedEventData {
  readonly userId: string;
  readonly updates: ReadonlyArray<{
    readonly conversationId: string;
    readonly orderInCategory: number;
  }>;
}

/**
 * Snapshot d'une `UserConversationCategory` envoyé dans
 * `CATEGORY_CREATED` / `CATEGORY_UPDATED`.
 */
export interface UserConversationCategoryPayload {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly color: string | null;
  readonly icon: string | null;
  readonly order: number;
  readonly isExpanded: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CategoryCreatedEventData {
  readonly userId: string;
  readonly category: UserConversationCategoryPayload;
}

export interface CategoryUpdatedEventData {
  readonly userId: string;
  readonly category: UserConversationCategoryPayload;
}

export interface CategoryDeletedEventData {
  readonly userId: string;
  readonly categoryId: string;
}

export interface CategoriesReorderedEventData {
  readonly userId: string;
  readonly updates: ReadonlyArray<{
    readonly categoryId: string;
    readonly order: number;
  }>;
}

/**
 * Émis par `DELETE /conversations/:id/delete-for-me` vers la room de
 * l'utilisateur, pour que ses autres appareils retirent la conversation
 * de leur liste (per-user soft delete). Consommé iOS par
 * `ConversationStore.applyConversationDeleted`.
 */
export interface ConversationDeletedEventData {
  readonly userId: string;
  readonly conversationId: string;
}

/**
 * Données pour l'événement d'épinglage d'un message
 */
export interface MessagePinnedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly pinnedBy: string;
  readonly pinnedAt: string;
}

/**
 * Données pour l'événement de désépinglage d'un message
 */
export interface MessageUnpinnedEventData {
  readonly messageId: string;
  readonly conversationId: string;
}

export interface MentionCreatedEventData {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly mentionedUserId: string;
  readonly mentionedParticipantId?: string;
  readonly content: string;
  readonly timestamp: string;
}

export interface ConversationParticipantBannedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly bannedBy: { readonly id: string };
  readonly bannedAt: string;
}

export interface ConversationParticipantUnbannedEventData {
  readonly conversationId: string;
  readonly userId: string;
}

export interface ConversationParticipantLeftEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly leftAt: string;
}

export interface ConversationUpdatedEventData {
  readonly conversationId: string;
  readonly updatedBy: { readonly id: string };
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

export interface ConversationClosedEventData {
  readonly conversationId: string;
  readonly closedBy: string;
  readonly closedAt: string;
}

export interface LinkMessageNewEventData {
  readonly message: Record<string, unknown>;
}

export const AGENT_ADMIN_EVENT_KINDS = ['delivery-queue', 'scan', 'config', 'topics'] as const;

export type AgentAdminEventKind = (typeof AGENT_ADMIN_EVENT_KINDS)[number];

export interface AgentAdminEventData {
  readonly kind: AgentAdminEventKind;
  readonly conversationId?: string;
}

// Événements du serveur vers le client
export interface ServerToClientEvents {
  [SERVER_EVENTS.MESSAGE_NEW]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED]: (data: AttachmentUpdatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_EDITED]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_DELETED]: (data: MessageDeletedEventData) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATION]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATED]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.TYPING_START]: (data: TypingEvent) => void;
  [SERVER_EVENTS.TYPING_STOP]: (data: TypingEvent) => void;
  [SERVER_EVENTS.USER_STATUS]: (data: UserStatusEvent) => void;
  [SERVER_EVENTS.PRESENCE_SNAPSHOT]: (data: PresenceSnapshotEventData) => void;
  [SERVER_EVENTS.CONVERSATION_JOINED]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_LEFT]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.AUTHENTICATED]: (data: AuthenticatedEventData) => void;
  [SERVER_EVENTS.AUTH_TOKEN_EXPIRED]: (data: AuthTokenExpiredEventData) => void;
  [SERVER_EVENTS.AUTH_SESSION_REVOKED]: (data: AuthSessionRevokedEventData) => void;
  [SERVER_EVENTS.ERROR]: (data: ErrorEventData) => void;
  [SERVER_EVENTS.NOTIFICATION]: (data: NotificationEventData) => void;
  [SERVER_EVENTS.SYSTEM_MESSAGE]: (data: SystemMessageEventData) => void;
  [SERVER_EVENTS.CONVERSATION_STATS]: (data: ConversationStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_ONLINE_STATS]: (data: ConversationOnlineStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED]: (data: ConversationUnreadUpdatedEventData) => void;
  [SERVER_EVENTS.REACTION_ADDED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_REMOVED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_SYNC]: (data: ReactionSyncEventData) => void;
  [SERVER_EVENTS.ATTACHMENT_REACTION_ADDED]: (data: AttachmentReactionUpdateEventData) => void;
  [SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED]: (data: AttachmentReactionUpdateEventData) => void;
  [SERVER_EVENTS.CALL_INITIATED]: (data: CallInitiatedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_JOINED]: (data: CallParticipantJoinedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_LEFT]: (data: CallParticipantLeftEvent) => void;
  [SERVER_EVENTS.CALL_ENDED]: (data: CallEndedEvent) => void;
  [SERVER_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent) => void;
  [SERVER_EVENTS.CALL_MEDIA_TOGGLED]: (data: CallMediaToggleEvent) => void;
  [SERVER_EVENTS.CALL_ERROR]: (data: CallError) => void;
  [SERVER_EVENTS.CALL_MISSED]: (data: CallMissedEvent) => void;
  [SERVER_EVENTS.CALL_QUALITY_ALERT]: (data: CallQualityAlertEvent) => void;
  [SERVER_EVENTS.CALL_TRANSLATED_SEGMENT]: (data: CallTranslatedSegmentEvent) => void;
  [SERVER_EVENTS.CALL_TRANSLATION_REQUESTED]: (data: CallTranslationRequestedEvent) => void;
  [SERVER_EVENTS.CALL_TRANSLATION_ENABLED]: (data: CallTranslationEnabledEvent) => void;
  [SERVER_EVENTS.CALL_TRANSCRIPTION_RESULT]: (data: CallTranscriptionResultEvent) => void;
  [SERVER_EVENTS.CALL_ALREADY_ANSWERED]: (data: CallAlreadyAnsweredEvent) => void;
  [SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT]: (data: CallScreenCaptureEvent) => void;
  [SERVER_EVENTS.CALL_FORCE_LEAVE]: (data: CallForceLeaveServerEvent) => void;
  [SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED]: (data: CallIceServersRefreshedEvent) => void;
  [SERVER_EVENTS.CONVERSATION_NEW]: (data: ConversationNewEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_CANCELLED]: (data: FriendRequestCancelledEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_NEW]: (data: FriendRequestNewEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED]: (data: FriendRequestAcceptedEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_REJECTED]: (data: FriendRequestRejectedEventData) => void;
  [SERVER_EVENTS.READ_STATUS_UPDATED]: (data: ReadStatusUpdatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_READ_STATUS_UPDATED]: (data: ReadStatusUpdatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_CONSUMED]: (data: MessageConsumedEventData) => void;
  [SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED]: (data: ParticipantRoleUpdatedEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATION_READY]: (data: AudioTranslationReadyEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE]: (data: AudioTranslationsProgressiveEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED]: (data: AudioTranslationsCompletedEventData) => void;
  [SERVER_EVENTS.TRANSCRIPTION_READY]: (data: TranscriptionReadyEventData) => void;
  [SERVER_EVENTS.TRANSLATION_FAILED]: (data: TranslationFailedEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATION_FAILED]: (data: AudioTranslationFailedEventData) => void;
  [SERVER_EVENTS.TRANSCRIPTION_FAILED]: (data: TranscriptionFailedEventData) => void;

  // Mentions
  [SERVER_EVENTS.MENTION_CREATED]: (data: MentionCreatedEventData) => void;

  // Message pinning
  [SERVER_EVENTS.MESSAGE_PINNED]: (data: MessagePinnedEventData) => void;
  [SERVER_EVENTS.MESSAGE_UNPINNED]: (data: MessageUnpinnedEventData) => void;

  // Location sharing
  [SERVER_EVENTS.LOCATION_SHARED]: (data: LocationSharedEventData) => void;
  [SERVER_EVENTS.LOCATION_LIVE_STARTED]: (data: LocationLiveStartedEventData) => void;
  [SERVER_EVENTS.LOCATION_LIVE_UPDATED]: (data: LocationLiveUpdatedEventData) => void;
  [SERVER_EVENTS.LOCATION_LIVE_STOPPED]: (data: LocationLiveStoppedEventData) => void;

  // Social / Posts
  [SERVER_EVENTS.POST_CREATED]: (data: PostCreatedEventData) => void;
  [SERVER_EVENTS.POST_UPDATED]: (data: PostUpdatedEventData) => void;
  [SERVER_EVENTS.POST_DELETED]: (data: PostDeletedEventData) => void;
  [SERVER_EVENTS.POST_LIKED]: (data: PostLikedEventData) => void;
  [SERVER_EVENTS.POST_UNLIKED]: (data: PostUnlikedEventData) => void;
  [SERVER_EVENTS.POST_REPOSTED]: (data: PostRepostedEventData) => void;
  [SERVER_EVENTS.POST_BOOKMARKED]: (data: PostBookmarkedEventData) => void;

  // Stories
  [SERVER_EVENTS.STORY_CREATED]: (data: StoryCreatedEventData) => void;
  [SERVER_EVENTS.STORY_UPDATED]: (data: StoryUpdatedEventData) => void;
  [SERVER_EVENTS.STORY_DELETED]: (data: StoryDeletedEventData) => void;
  [SERVER_EVENTS.STORY_VIEWED]: (data: StoryViewedEventData) => void;
  [SERVER_EVENTS.STORY_REACTED]: (data: StoryReactedEventData) => void;
  [SERVER_EVENTS.STORY_UNREACTED]: (data: StoryUnreactedEventData) => void;
  [SERVER_EVENTS.STORY_TRANSLATION_UPDATED]: (data: StoryTranslationUpdatedEventData) => void;

  // Moods/Statuses
  [SERVER_EVENTS.STATUS_CREATED]: (data: StatusCreatedEventData) => void;
  [SERVER_EVENTS.STATUS_UPDATED]: (data: StatusUpdatedEventData) => void;
  [SERVER_EVENTS.STATUS_DELETED]: (data: StatusDeletedEventData) => void;
  [SERVER_EVENTS.STATUS_REACTED]: (data: StatusReactedEventData) => void;
  [SERVER_EVENTS.STATUS_UNREACTED]: (data: StatusUnreactedEventData) => void;

  // Comments
  [SERVER_EVENTS.COMMENT_ADDED]: (data: CommentAddedEventData) => void;
  [SERVER_EVENTS.COMMENT_DELETED]: (data: CommentDeletedEventData) => void;
  [SERVER_EVENTS.COMMENT_LIKED]: (data: CommentLikedEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_ADDED]: (data: CommentReactionUpdateEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_REMOVED]: (data: CommentReactionUpdateEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_SYNC]: (data: CommentReactionSyncEventData) => void;

  // Post reactions (Phase 3B)
  [SERVER_EVENTS.POST_REACTION_ADDED]: (data: PostReactionUpdateEventData) => void;
  [SERVER_EVENTS.POST_REACTION_REMOVED]: (data: PostReactionUpdateEventData) => void;
  [SERVER_EVENTS.POST_REACTION_SYNC]: (data: PostReactionSyncEventData) => void;

  // Post/Comment Translations
  [SERVER_EVENTS.POST_TRANSLATION_UPDATED]: (data: PostTranslationUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED]: (data: CommentTranslationUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_MEDIA_UPDATED]: (data: CommentMediaUpdatedEventData) => void;

  // User Preferences
  [SERVER_EVENTS.USER_PREFERENCES_UPDATED]: (data: UserPreferencesUpdatedEventData) => void;
  [SERVER_EVENTS.USER_PREFERENCES_REORDERED]: (data: UserPreferencesReorderedEventData) => void;

  // User Profile
  [SERVER_EVENTS.USER_UPDATED]: (data: UserUpdatedEventData) => void;

  // Conversation Categories
  [SERVER_EVENTS.CATEGORY_CREATED]: (data: CategoryCreatedEventData) => void;
  [SERVER_EVENTS.CATEGORY_UPDATED]: (data: CategoryUpdatedEventData) => void;
  [SERVER_EVENTS.CATEGORY_DELETED]: (data: CategoryDeletedEventData) => void;
  [SERVER_EVENTS.CATEGORIES_REORDERED]: (data: CategoriesReorderedEventData) => void;

  // Agent admin dashboard
  [SERVER_EVENTS.AGENT_ADMIN_EVENT]: (data: AgentAdminEventData) => void;

  // Notifications
  [SERVER_EVENTS.NOTIFICATION_NEW]: (data: NotificationEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_READ]: (data: NotificationReadEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_DELETED]: (data: NotificationDeletedEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_COUNTS]: (data: NotificationCountsEventData) => void;

  // Delivery queue — includes affected conversationIds so clients can scope invalidation
  [SERVER_EVENTS.PENDING_MESSAGES_DELIVERED]: (data: { count: number; conversationIds: string[] }) => void;

  // Conversation lifecycle
  [SERVER_EVENTS.CONVERSATION_UPDATED]: (data: ConversationUpdatedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_CLOSED]: (data: ConversationClosedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_DELETED]: (data: ConversationDeletedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT]: (data: ConversationParticipantLeftEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED]: (data: ConversationParticipantBannedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED]: (data: ConversationParticipantUnbannedEventData) => void;

  // Attachment status
  [SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED]: (data: AttachmentStatusUpdatedEventData) => void;

  // Share link messages
  [SERVER_EVENTS.LINK_MESSAGE_NEW]: (data: LinkMessageNewEventData) => void;

  // Connection health
  [SERVER_EVENTS.HEARTBEAT_ACK]: (data: HeartbeatAckEventData) => void;
}

/**
 * Données pour l'envoi de message
 *
 * `clientMessageId` est OBLIGATOIRE — format `cid_<UUID v4 lowercase>`.
 * Validé contre `CLIENT_MESSAGE_ID_REGEX` exporté depuis
 * `@meeshy/shared/utils/client-message-id`. Sert d'identifiant
 * d'idempotence cross-device pour le dedup gateway/MongoDB.
 */
export interface MessageSendData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly messageType?: string;
  readonly replyToId?: string;
  readonly clientMessageId: string;
}

/**
 * Réponse d'envoi de message
 */
export interface MessageSendResponseData {
  readonly messageId: string;
}

/**
 * Données pour l'envoi de message avec attachements
 *
 * `clientMessageId` est OBLIGATOIRE — format `cid_<UUID v4 lowercase>`.
 * Validé contre `CLIENT_MESSAGE_ID_REGEX` exporté depuis
 * `@meeshy/shared/utils/client-message-id`. Sert d'identifiant
 * d'idempotence cross-device pour le dedup gateway/MongoDB.
 */
export interface MessageSendWithAttachmentsData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly attachmentIds: readonly string[];
  readonly replyToId?: string;
  readonly clientMessageId: string;
}

/**
 * Données pour l'édition de message
 */
export interface MessageEditData {
  readonly messageId: string;
  readonly content: string;
}

/**
 * Données pour la suppression de message
 */
export interface MessageDeleteData {
  readonly messageId: string;
}

/**
 * Données pour rejoindre/quitter une conversation
 */
export interface ConversationActionData {
  readonly conversationId: string;
}

/**
 * Données pour les événements de frappe
 */
export interface TypingActionData {
  readonly conversationId: string;
}

/**
 * Données pour le statut utilisateur
 */
export interface UserStatusData {
  readonly isOnline: boolean;
}

/**
 * Données pour l'authentification
 */
export interface AuthenticateData {
  readonly userId?: string;
  readonly sessionToken?: string;
  readonly language?: string;
}

/**
 * Données pour la requête de traduction
 */
export interface RequestTranslationData {
  readonly messageId: string;
  readonly targetLanguage: string;
}

/**
 * Données pour ajouter une réaction
 */
export interface ReactionAddData {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données pour retirer une réaction
 */
export interface ReactionRemoveData {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données pour ajouter une réaction à un commentaire
 */
export interface CommentReactionAddData {
  readonly commentId: string;
  readonly postId: string;
  readonly emoji: string;
}

/**
 * Données pour retirer une réaction d'un commentaire
 */
export interface CommentReactionRemoveData {
  readonly commentId: string;
  readonly postId: string;
  readonly emoji: string;
}

/**
 * Données pour rejoindre/quitter une room de post
 */
export interface PostRoomActionData {
  readonly postId: string;
}

// Événements du client vers le serveur
export interface ClientToServerEvents {
  [CLIENT_EVENTS.MESSAGE_SEND]: (data: MessageSendData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS]: (data: MessageSendWithAttachmentsData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_EDIT]: (data: MessageEditData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.MESSAGE_DELETE]: (data: MessageDeleteData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.CONVERSATION_JOIN]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.CONVERSATION_LEAVE]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.TYPING_START]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.TYPING_STOP]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.USER_STATUS]: (data: UserStatusData) => void;
  [CLIENT_EVENTS.AUTHENTICATE]: (data: AuthenticateData) => void;
  [CLIENT_EVENTS.REQUEST_TRANSLATION]: (data: RequestTranslationData) => void;
  [CLIENT_EVENTS.REACTION_ADD]: (data: ReactionAddData, callback?: (response: SocketIOResponse<ReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.REACTION_REMOVE]: (data: ReactionRemoveData, callback?: (response: SocketIOResponse<ReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.ATTACHMENT_REACTION_ADD]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<unknown>) => void) => void;
  [CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<unknown>) => void) => void;
  [CLIENT_EVENTS.REACTION_REQUEST_SYNC]: (messageId: string, callback?: (response: SocketIOResponse<ReactionSyncEventData>) => void) => void;
  [CLIENT_EVENTS.CALL_INITIATE]: (data: CallInitiateEvent, ack: (response: CallInitiateAck) => void) => void;
  [CLIENT_EVENTS.CALL_JOIN]: (data: CallJoinEvent, ack: (response: CallJoinAck) => void) => void;
  [CLIENT_EVENTS.CALL_LEAVE]: (data: { callId: string }) => void;
  [CLIENT_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent, ack: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_AUDIO]: (data: { callId: string; enabled: boolean }, ack: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_VIDEO]: (data: { callId: string; enabled: boolean }, ack: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_END]: (data: { callId: string; reason?: string }, ack: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_HEARTBEAT]: (data: CallHeartbeatEvent) => void;
  [CLIENT_EVENTS.CALL_QUALITY_REPORT]: (data: CallQualityReportEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTING]: (data: CallReconnectingEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTED]: (data: CallReconnectedEvent) => void;
  [CLIENT_EVENTS.CALL_BACKGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_FOREGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT]: (data: CallTranscriptionSegmentEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_CAPABILITY]: (data: CallTranscriptionCapabilityEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_ROLE]: (data: CallTranscriptionRoleEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSLATION_REQUEST]: (data: CallTranslationRequestEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSLATION_RESPONSE]: (data: CallTranslationResponseEvent) => void;
  [CLIENT_EVENTS.CALL_AUDIO_CHUNK]: (data: CallAudioChunkEvent) => void;
  [CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]: (data: CallQualityFeedbackEvent) => void;
  [CLIENT_EVENTS.CALL_SCREEN_CAPTURE_DETECTED]: (data: CallScreenCaptureEvent) => void;
  [CLIENT_EVENTS.CALL_FORCE_LEAVE]: (data: CallForceLeaveClientEvent) => void;
  [CLIENT_EVENTS.CALL_CHECK_ACTIVE]: () => void;
  [CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS]: (data: CallRequestIceServersEvent) => void;

  // Location sharing
  [CLIENT_EVENTS.LOCATION_SHARE]: (data: LocationShareData, callback?: (response: SocketIOResponse<LocationSharedEventData>) => void) => void;
  [CLIENT_EVENTS.LOCATION_LIVE_START]: (data: LocationLiveStartData, callback?: (response: SocketIOResponse<LocationLiveStartedEventData>) => void) => void;
  [CLIENT_EVENTS.LOCATION_LIVE_UPDATE]: (data: LocationLiveUpdateData) => void;
  [CLIENT_EVENTS.LOCATION_LIVE_STOP]: (data: LocationLiveStopData) => void;

  // Feed subscription
  [CLIENT_EVENTS.FEED_SUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.FEED_UNSUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;

  // Post room membership
  [CLIENT_EVENTS.JOIN_POST]: (data: PostRoomActionData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.LEAVE_POST]: (data: PostRoomActionData, callback?: (response: SocketIOResponse) => void) => void;

  // Comment reactions
  [CLIENT_EVENTS.COMMENT_REACTION_ADD]: (data: CommentReactionAddData, callback?: (response: SocketIOResponse<CommentReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.COMMENT_REACTION_REMOVE]: (data: CommentReactionRemoveData, callback?: (response: SocketIOResponse<CommentReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.COMMENT_REACTION_REQUEST_SYNC]: (data: { commentId: string }, callback?: (response: SocketIOResponse<CommentReactionSyncEventData>) => void) => void;

  // Post reactions (Phase 3B)
  [CLIENT_EVENTS.POST_REACTION_ADD]: (data: PostReactionAddData, callback?: (response: SocketIOResponse<PostReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.POST_REACTION_REMOVE]: (data: PostReactionRemoveData, callback?: (response: SocketIOResponse<PostReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.POST_REACTION_REQUEST_SYNC]: (data: { postId: string }, callback?: (response: SocketIOResponse<PostReactionSyncEventData>) => void) => void;

  // Presence — optionally carries clientTime (ms since epoch) for RTT measurement
  [CLIENT_EVENTS.HEARTBEAT]: (data?: { clientTime?: number }) => void;

  // Agent admin dashboard
  [CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
}

// ===== TYPES DE BASE =====

/**
 * Types de messages supportés dans l'architecture Meeshy
 * Défini une fois, réutilisé partout
 */
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system';

// ===== STRUCTURES DE DONNÉES =====

/**
 * Lightweight sender shape for Socket.IO message broadcasts.
 * A subset of Participant — only the fields needed for display.
 */
export interface SocketIOMessageSender {
  readonly id: string;
  readonly displayName: string;
  readonly avatar?: string;
  readonly type?: ParticipantType;
  readonly userId?: string;
  readonly username?: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

export interface SocketIOMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string; // Participant.id (unified)
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly isEdited?: boolean;
  readonly editedAt?: Date;
  readonly deletedAt?: Date;
  readonly replyToId?: string;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly sender?: SocketIOMessageSender;
}

export interface UserPermissions {
  readonly canAccessAdmin: boolean;
  readonly canManageUsers: boolean;
  readonly canManageGroups: boolean;
  readonly canManageConversations: boolean;
  readonly canViewAnalytics: boolean;
  readonly canModerateContent: boolean;
  readonly canViewAuditLogs: boolean;
  readonly canManageNotifications: boolean;
  readonly canManageTranslations: boolean;
}

/**
 * User type for Socket.IO communications
 * Aligned with schema.prisma User model
 */
export interface SocketIOUser {
  readonly id: string;
  readonly userId?: string; // User.id when sender is a Participant (post Participant model migration)
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phoneNumber?: string;
  readonly displayName?: string;
  readonly avatar?: string;
  readonly banner?: string;  // Profile banner/cover image
  readonly bio?: string;
  readonly role: string;
  readonly permissions?: UserPermissions;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly timezone?: string;  // IANA format (e.g., "America/New_York")

  // Blocked users
  readonly blockedUserIds?: readonly string[];

  // Language preferences
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  /**
   * Locale appareil persistée par le gateway (Prisme Linguistique étendu —
   * 4e priorité). Normalisée en ISO 639-1 par `normalizeLanguageCode`.
   * Source du write : header `X-Device-Locale` envoyé par les clients
   * (iOS `Locale.current.identifier`, web `navigator.language`).
   */
  readonly deviceLocale?: string;
  readonly autoTranslateEnabled: boolean;

  // Account status
  readonly isActive: boolean;
  readonly deactivatedAt?: Date;
  readonly deletedAt?: Date;
  readonly deletedBy?: string;

  // Verification statuses
  readonly emailVerifiedAt?: Date;
  readonly phoneVerifiedAt?: Date;
  readonly twoFactorEnabledAt?: Date;

  // Pending contact changes (awaiting verification)
  readonly pendingEmail?: string;
  readonly pendingPhone?: string;

  // Security fields
  readonly failedLoginAttempts?: number;
  readonly lockedUntil?: Date;
  readonly lockedReason?: string;
  readonly lastPasswordChange?: Date;
  readonly passwordResetAttempts?: number;
  readonly lastPasswordResetAttempt?: Date;

  // Login tracking
  readonly lastLoginIp?: string;
  readonly lastLoginLocation?: string;
  readonly lastLoginDevice?: string;

  // E2EE / Signal Protocol
  readonly encryptionPreference?: 'disabled' | 'optional' | 'always';
  readonly signalIdentityKeyPublic?: string;  // Base64 encoded
  readonly signalRegistrationId?: number;
  readonly signalPreKeyBundleVersion?: number;
  readonly lastKeyRotation?: Date;

  // Transcription settings (on-device)
  readonly autoTranscriptionEnabled?: boolean;  // Auto-transcribe audio/video when no transcription exists

  // Voice profile
  readonly voiceProfileConsentAt?: Date;
  readonly ageVerificationConsentAt?: Date;
  readonly birthDate?: Date;
  readonly voiceCloningEnabledAt?: Date;
  readonly voiceProfileUpdateNotifiedAt?: Date;

  // Metadata
  readonly profileCompletionRate?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Compatibility flags
  readonly isAnonymous?: boolean;
  readonly isMeeshyer?: boolean;
}

export interface SocketIOResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  /** Machine-readable error code (e.g. ErrorCode.USER_BLOCKED) when success === false. */
  readonly code?: string;
}

export interface TranslationEvent {
  readonly messageId: string;
  readonly translations: readonly TranslationData[];
}

export interface TranslationData {
  readonly id: string; // ID de la traduction en base de données
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: string;
  readonly cacheKey: string;
  readonly cached: boolean;
  readonly confidenceScore?: number;
  readonly createdAt?: Date; // Ajouté pour la gestion des traductions
}

export interface TypingEvent {
  readonly userId: string;
  /** Identifiant (handle) de l'utilisateur. Pour un participant anonyme — qui n'a pas
   *  de handle — retombe sur le nom d'affichage. */
  readonly username: string;
  /** Nom d'affichage : `displayName` explicite saisi par l'utilisateur, sinon la
   *  concaténation « Prénom Nom ». Le gateway le transmet systématiquement ; il reste
   *  optionnel pour tolérer un client/serveur antérieur. Le front-end décide quoi
   *  afficher — `displayName` en priorité, `username` en repli. */
  readonly displayName?: string;
  readonly conversationId: string;
  readonly isTyping?: boolean; // Ajouté côté service pour distinguer start/stop
}

export interface UserStatusEvent {
  readonly userId: string;
  readonly username: string;
  readonly isOnline: boolean;
  readonly lastActiveAt?: Date | null;
}

/**
 * Snapshot de présence — userIds actuellement online parmi les contacts du destinataire.
 * Émis une fois à l'authentification socket pour seed le store côté client.
 * `lastActiveAt` peut être omis (null) selon les préférences privacy.
 */
export interface PresenceSnapshotEventData {
  readonly users: readonly {
    readonly userId: string;
    readonly username: string;
    readonly isOnline: boolean;
    readonly lastActiveAt?: Date | null;
  }[];
}

// ===== TYPES POUR LES STATISTIQUES DE CONVERSATION =====

export interface ConversationOnlineUser {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface ConversationStatsDTO {
  readonly messagesPerLanguage: Record<string, number>;
  readonly participantCount: number;
  readonly participantsPerLanguage: Record<string, number>;
  readonly onlineUsers: readonly ConversationOnlineUser[];
  readonly updatedAt: Date;
}

// ===== TYPES DE CONFIGURATION =====

export interface UserLanguageConfig {
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  readonly autoTranslateEnabled: boolean;
}

// ===== HELPERS POUR LA GESTION DES TRADUCTIONS =====

export interface MessageTranslationCache {
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: 'basic' | 'medium' | 'premium';
  readonly cacheKey: string;
  readonly cached: boolean;
  readonly createdAt: Date;
  readonly confidenceScore?: number;
}

// ===== TYPES POUR LES CONNEXIONS =====

export interface ConnectionStatus {
  readonly isConnected: boolean;
  readonly hasSocket: boolean;
  readonly currentUser: string;
  readonly connectedAt?: Date;
  readonly lastReconnectAttempt?: Date;
  readonly reconnectAttempts?: number;
}

export interface ConnectionDiagnostics {
  readonly connectionStatus: ConnectionStatus;
  readonly socketId?: string;
  readonly transport?: string;
  readonly connectedSockets?: number;
  readonly serverStatus?: 'online' | 'offline' | 'unknown';
}

// ===== TYPES POUR L'AUTHENTIFICATION =====

/**
 * Listener générique pour les événements Socket.IO
 */
export type SocketEventListener = (...args: readonly unknown[]) => void;

/**
 * Base Socket interface pour éviter l'import de socket.io dans shared
 */
export interface BaseSocket {
  readonly id: string;
  emit: (event: string, ...args: readonly unknown[]) => boolean;
  on: (event: string, listener: SocketEventListener) => void;
  join: (room: string) => void;
  leave: (room: string) => void;
}

/**
 * Socket authentifié avec métadonnées utilisateur
 */
export interface AuthenticatedSocket extends BaseSocket {
  readonly userId: string;
  readonly username: string;
  readonly userData: SocketIOUser;
  readonly connectedAt: Date;
  readonly currentConversations: readonly string[];
}

// ===== EXPORTS POUR RÉTROCOMPATIBILITÉ =====

// Aliases pour faciliter la migration
// ❌ SUPPRIMÉ : export type Message = SocketIOMessage; // Conflit avec conversation.ts
export type User = SocketIOUser;
export type Response<T = unknown> = SocketIOResponse<T>;

// Export des interfaces principales
export type {
  ServerToClientEvents as SocketIOServerEvents,
  ClientToServerEvents as SocketIOClientEvents
};
