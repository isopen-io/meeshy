/**
 * Types unifiés pour les événements Socket.IO Meeshy
 * Remplace les anciens types WebSocket pour correspondre à la nouvelle architecture Socket.IO
 */

// Import unified Participant types
import type { ParticipantType } from './participant.js';

// Le pont ✦ (G-123) — payload optionnel de `conversation:unread-updated`
import type { ConversationBridge } from './conversation-bridge.js';

// Motifs de refus de `conversation:join` — la table ET la règle qui décide
// lesquels autorisent un consommateur à purger son cache (cycle 99)
import type { ConversationJoinErrorReason } from '../utils/conversation-join-error.js';

// Prédicat des marquages de notifications en masse
import type {
  NotificationContext,
  NotificationDeletedBulkScope,
  NotificationMetadata,
  NotificationReadBulkScope,
} from './notification.js';

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
  CallTranscriptionActiveEvent,
  CallTranscriptionActiveBroadcast,
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
  CallMediaToggleClientEvent,
  CallAnalyticsEvent,
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
  CommentUpdatedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentUnlikedEventData,
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

// La ligne de réaction persistée — ce que l'accusé de `reaction:add` porte.
import type { ReactionData, ReactionUpdateEvent } from './reaction.js';

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
  // Pas de `MESSAGE_TRANSLATED` : la traduction d'un message voyage sous
  // `message:translation`, et sous ce nom seul. `message:translated` a été
  // déclaré comme un alias que la passerelle n'a jamais émis — et les TROIS
  // clients s'y étaient abonnés, chacun en dupliquant le traitement du vrai
  // canal (iOS vers le même sujet, Android via un flow `translationCompleted`
  // jumeau, web via le même chemin de déduplication). Rien ne manquait à
  // l'arrivée, mais rien non plus n'aurait signalé que la moitié de ce câblage
  // ne servait à rien. Retiré au cycle 77.
  /**
   * PER-USER "delete for me" on a MESSAGE (`DELETE /api/messages/:id/delete-for-me`
   * and its bulk sibling): a `UserMessageDeletion` row now hides the message from
   * THIS user's view, on every one of their devices. The message itself is
   * untouched and every other participant keeps seeing it — contrast with
   * `MESSAGE_DELETED` (delete for EVERYONE, `Message.deletedAt`), which is
   * broadcast to the conversation room.
   *
   * Broadcast to the caller's **user room** (`ROOMS.user`) only. Without it the
   * hiding was a per-DEVICE illusion: the device that issued the request removed
   * the bubble optimistically, and the user's other devices kept showing the
   * message indefinitely — the read filter only shrinks what a *new* query
   * returns, it cannot reach a row a client already holds.
   */
  MESSAGE_HIDDEN_FOR_ME: 'message:hidden-for-me',
  /**
   * Inverse of `MESSAGE_HIDDEN_FOR_ME` (`POST /api/messages/:id/restore-for-me`):
   * the `UserMessageDeletion` row is gone and the message is visible again.
   *
   * The payload deliberately carries no message body. An APPEARANCE cannot be
   * expressed as a tombstone: a client that dropped the bubble no longer holds
   * the content, so the only honest instruction is "refetch this conversation".
   */
  MESSAGE_RESTORED_FOR_ME: 'message:restored-for-me',
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
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  /** Marquage EN MASSE : annonce le PRÉDICAT appliqué, pas la liste des ids —
   *  les chemins bulk ne les renvoient pas. @see NotificationReadBulkScope */
  NOTIFICATION_READ_BULK: 'notification:read-bulk',
  NOTIFICATION_DELETED: 'notification:deleted',
  /** Purge EN MASSE : annonce le PRÉDICAT appliqué, pas la liste des ids. Sans
   *  lui rien n'annonce la purge — `notification:counts` est MUET ici, les
   *  lignes qui partent sont déjà lues. @see NotificationDeletedBulkScope */
  NOTIFICATION_DELETED_BULK: 'notification:deleted-bulk',
  NOTIFICATION_COUNTS: 'notification:counts',
  // Pas de `SYSTEM_MESSAGE` : un message système est un MESSAGE, et il arrive
  // sous `message:new` comme tous les autres (`messageType: 'system'`). Le canal
  // séparé venait d'un ancien comportement où `broadcastMessage` diffusait
  // `system:message` à TOUS les sockets connectés faute de savoir router ; il a
  // été supprimé, et une régression le garde fermé
  // (`MeeshySocketIOHandler.broadcastMessage.test.ts`, « ne retombe PAS sur un
  // broadcast global system:message »). Le nom, lui, était resté déclaré ici, et
  // iOS comme web s'y étaient abonnés. Retiré au cycle 77.
  CONVERSATION_STATS: 'conversation:stats',
  // Pas de `CONVERSATION_ONLINE_STATS` : jamais émis, par aucune version de la
  // passerelle, et sans consommateur d'interface nulle part — le décompte des
  // présents se lit sur `presence:snapshot` et `user:status`. Le nom portait
  // pourtant un décodeur iOS, un publisher, et côté web une chaîne complète de
  // six niveaux (`presence.service` → `orchestrator` → `meeshy-socketio.
  // service` → `use-socketio-messaging` → `use-stream-safe` → `use-stream-
  // socket`) qui n'a jamais rien transporté. Retiré au cycle 77.
  CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  // Pas de `REACTION_SYNC` : l'instantané de réactions voyage dans l'ACK de
  // `CLIENT_EVENTS.REACTION_REQUEST_SYNC`, jamais en diffusion. Le déclarer ici
  // affirmait un canal serveur→client sans émetteur, et un client s'y était
  // abonné en versant l'instantané dans le seau incrémental de
  // `reaction:added`. Le nom `reaction:sync` ne subsiste que comme étiquette de
  // journal et préfixe de quota côté gateway.
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
   * --- Événements d'appel autrefois « RESERVED (no emitter yet) ---
   *
   * Cette prose énumérait six noms de ce bloc comme dépourvus d'émetteur. Elle
   * avait pourri : `call:missed`, `call:quality-alert`,
   * `call:translated-segment`, `call:transcription-active`,
   * `call:already-answered` et `call:screen-capture-alert` ont tous reçu le
   * leur depuis, sans que personne ne vienne la corriger — c'est ce que fait
   * une exemption écrite en commentaire, que rien n'exécute.
   *
   * La liste vit désormais dans `RESERVED_SERVER_EVENTS` (bas de fichier), et
   * une garde la vérifie DANS LES DEUX SENS à chaque PR. Il n'en reste que le
   * pipeline de traduction en appel.
   */
  CALL_MISSED: 'call:missed',
  CALL_QUALITY_ALERT: 'call:quality-alert',
  CALL_TRANSLATED_SEGMENT: 'call:translated-segment',
  /// Signal de présence transcription (2026-08-13) : un participant a
  /// activé/fermé son panneau — indicateur d'invitation sur l'icône des
  /// autres. Relayé estampillé par CallEventsHandler, émetteur exclu.
  CALL_TRANSCRIPTION_ACTIVE: 'call:transcription-active',
  CALL_TRANSLATION_REQUESTED: 'call:translation-requested',
  CALL_TRANSLATION_ENABLED: 'call:translation-enabled',
  CALL_TRANSCRIPTION_RESULT: 'call:transcription-result',
  CALL_ALREADY_ANSWERED: 'call:already-answered',
  CALL_SCREEN_CAPTURE_ALERT: 'call:screen-capture-alert',
  /**
   * Le serveur sort UN destinataire de l'appel — il ne dit rien de l'appel
   * lui-même, qui continue pour les autres. Émis vers la room PERSONNELLE du
   * sorti (`ROOMS.user`), jamais vers la room de l'appel.
   *
   * Unique émetteur : la fin d'appartenance
   * (`CallEventsHandler.endCallParticipationForDepartedMember`, cycle 75) —
   * quitter, être banni, être retiré, supprimer le fil pour soi. Le sorti a
   * déjà perdu le droit d'être là ; ses appareils démontent la
   * `RTCPeerConnection` et referment l'écran d'appel sur cet événement, seul
   * chemin par lequel ils l'apprennent (le verbe `call:force-leave` CLIENT,
   * qui porte le même nom en sens inverse, exige une appartenance active et
   * est donc muet précisément dans ce cas).
   *
   * Récepteurs : iOS (`MessageSocketManager` → `CallManager.callForcedLeave`,
   * qui clôt aussi la session CallKit) et web (`components/video-call/
   * CallManager`). Android ne l'écoute pas encore (`CallSignalManager
   * .INBOUND_EVENTS`) : le média y est tout de même coupé par le
   * `call:participant-left` que les pairs restants reçoivent, seul l'écran
   * d'appel du sorti survit.
   */
  CALL_FORCE_LEAVE: 'call:force-leave',
  /** Gateway pushes fresh TURN credentials to the client after a `call:request-ice-servers` event. */
  CALL_ICE_SERVERS_REFRESHED: 'call:ice-servers-refreshed',
  /**
   * L'accusé de remise et de lecture — le SEUL nom sous lequel il voyage.
   *
   * Le nom hyphène l'ENTITÉ (`read-status`) et déroge donc à la convention
   * `entity:action-word` que tout le reste de cette map respecte. La dérogation
   * est ASSUMÉE et documentée ici plutôt que corrigée : un alias correctement
   * namespacé (`message:read-status-updated`) a été dual-émis à partir du
   * 2026-07-05 pour permettre aux clients de migrer, et aucun ne l'a jamais
   * écouté — pas une ligne dans `apps/web`, `packages/MeeshySDK/Sources` ou
   * `apps/android`, à aucun commit de l'historique. Retiré au cycle 64 : le
   * renommage n'achetait que de la cosmétique de nommage, et il la faisait
   * payer en doublant le fan-out le plus fréquent de la messagerie (chaque
   * remise, chaque lecture, chaque rejeu de file hors ligne, ×2 sur le fil).
   *
   * Ne PAS rouvrir sans un consommateur client réel : le raisonnement complet,
   * y compris ce qui rendrait la migration rentable, est dans
   * `tasks/socketio-events-cleanup.md` § 3.
   */
  READ_STATUS_UPDATED: 'read-status:updated',
  MESSAGE_CONSUMED: 'message:consumed',
  PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
  /**
   * Un hôte a modifié les droits d'un visiteur SANS COMPTE dans sa conversation.
   *
   * Distinct de `participant:role-updated`, qui déplace quelqu'un dans la
   * hiérarchie (membre → modérateur). Celui-ci ne touche pas au rang : il change
   * ce qu'une personne a le droit de FAIRE, sans rien changer à ce qu'elle est.
   *
   * Porte les droits RÉSOLUS, jamais le delta écrit : un client affiche un état,
   * pas une différence — et lui faire recomposer `rights ?? permissions`
   * dupliquerait côté client une règle qui n'a qu'un seul énoncé légitime,
   * `resolveParticipantRights`.
   */
  PARTICIPANT_RIGHTS_UPDATED: 'participant:rights-updated',
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
  /**
   * A member was ADDED to the conversation (`POST /conversations/:id/participants`).
   * The symmetric counterpart of `CONVERSATION_PARTICIPANT_LEFT`, and the ONLY
   * event that carries that fact unambiguously.
   *
   * `CONVERSATION_JOINED` cannot serve here: it carries the same
   * `{ conversationId, userId }` shape for a completely different fact — the
   * self-only ack a socket receives after JOINING THE ROOM
   * (`ConversationHandler`), which every thread opening produces and which
   * changes no membership. A client counting members off `conversation:joined`
   * would inflate its count on every thread opening; that ambiguity is why no
   * client ever incremented, and why the count could only ever drift DOWN.
   */
  CONVERSATION_PARTICIPANT_JOINED: 'conversation:participant-joined',
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
  COMMENT_UPDATED: 'comment:updated',
  COMMENT_DELETED: 'comment:deleted',
  COMMENT_LIKED: 'comment:liked',
  // Jumelle descendante de `COMMENT_LIKED`, calque de `POST_UNLIKED`. Les deux
  // portent le total ABSOLU (`likeCount`) : le client écrit la valeur reçue,
  // jamais un ±1. Sans la descendante, un compteur de commentaire ne savait que
  // monter en direct — et côté iOS la valeur gonflée était PERSISTÉE.
  COMMENT_UNLIKED: 'comment:unliked',
  COMMENT_REACTION_ADDED: 'comment:reaction-added',
  COMMENT_REACTION_REMOVED: 'comment:reaction-removed',
  // Pas de `COMMENT_REACTION_SYNC` — même raison que `REACTION_SYNC` ci-dessus,
  // dont il est le frère resté en place quand celui-là a été retiré :
  // l'instantané voyage dans l'ACK de `CLIENT_EVENTS.COMMENT_REACTION_REQUEST_
  // SYNC` (`CommentReactionHandler` répond par `callback?.({ success, data })`),
  // jamais en diffusion. `CommentReactionSyncEventData` reste — c'est le type de
  // cet ACK.

  // --- Post reactions (Phase 3B) ---
  POST_REACTION_ADDED: 'post:reaction-added',
  POST_REACTION_REMOVED: 'post:reaction-removed',
  // Pas de `POST_REACTION_SYNC` — idem, `PostReactionHandler` répond par ACK.

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

/**
 * Les canaux serveur→client déclarés AVANT que leur émetteur n'atterrisse.
 *
 * Un nom qui figure ici est une promesse non tenue, et c'est assumé : le
 * contrat le fige pour que les types et les décodeurs clients s'écrivent une
 * seule fois. Un nom qui N'Y figure PAS et que la passerelle ne prononce nulle
 * part est un défaut — un client peut s'y abonner et attendre pour toujours,
 * sans qu'aucune erreur ne soit levée. `packages/shared/__tests__/ci/
 * socket-event-emitter-gate.test.ts` fait respecter exactement cette
 * distinction.
 *
 * La liste vit ICI, et non dans la garde, pour deux raisons. Réserver un canal
 * doit être un acte VISIBLE en revue, dans le fichier que l'on ouvre de toute
 * façon pour déclarer l'événement — une table d'exceptions cachée au fond d'un
 * test est un endroit où l'on dépose ce qu'on ne veut pas traiter. Et parce
 * qu'une exemption qui survit à sa raison d'être finit par couvrir un vrai
 * défaut : la garde vérifie donc AUSSI le sens inverse, et rougit si l'un de
 * ces noms reçoit enfin un émetteur sans sortir d'ici.
 *
 * Précédent : la prose « Call events RESERVED (no emitter yet) » qui tenait ce
 * rôle plus haut avait pourri sans que rien ne le signale — elle énumérait
 * encore six événements (`call:missed`, `call:quality-alert`,
 * `call:translated-segment`, `call:transcription-active`,
 * `call:already-answered`, `call:screen-capture-alert`) dont la passerelle
 * avait entre-temps implémenté l'émission.
 *
 * Ce qui reste : le pipeline de traduction EN APPEL. Les trois noms sont
 * décodés côté clients et attendent le service qui les produira.
 */
export const RESERVED_SERVER_EVENTS: ReadonlySet<string> = new Set<string>([
  SERVER_EVENTS.CALL_TRANSLATION_REQUESTED,
  SERVER_EVENTS.CALL_TRANSLATION_ENABLED,
  SERVER_EVENTS.CALL_TRANSCRIPTION_RESULT,
]);

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
  // `USER_STATUS: 'user:status'` a été retiré d'ici (cycle 60) : c'est un
  // événement SERVEUR→client (`SERVER_EVENTS.USER_STATUS`, écouté par
  // `presence.service.ts`, `websocket.service.ts`, iOS `PresenceManager`), et
  // AUCUN client ne l'émet — aucun `socket.on('user:status')` n'existe côté
  // gateway pour l'accueillir. Le déclarer dans les DEUX sens laissait croire
  // qu'un client pouvait annoncer sa propre présence, alors qu'elle est dérivée
  // par le backend (`isOnline` + `lastActiveAt`, règle 1/3/5 —
  // `packages/shared/utils/user-presence.ts`). C'était de surcroît le seul cas
  // qu'un garde « tout CLIENT_EVENTS a un handler gateway » aurait signalé sans
  // désigner un vrai défaut (audits cycles 57 et 59).
  /**
   * Transition foreground/background du device — le gateway s'en sert pour
   * router la sonnerie d'appel (socket au premier plan = event socket,
   * backgroundé = push). Émis par iOS (MessageSocketManager) et écouté dans
   * CallEventsHandler ; était un literal hors contrat (audit 2026-07-11 #6).
   */
  PRESENCE_APP_STATE: 'presence:app-state',
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
  /// Signal de présence transcription (2026-08-13) — voir SERVER_EVENTS.
  CALL_TRANSCRIPTION_ACTIVE: 'call:transcription-active',
  /**
   * --- Reserved: abandoned leader/follower transcription design ---
   * Built for an earlier "one device transcribes both streams, negotiates
   * who leads and whether to translate" architecture. The shipped design
   * (docs/superpowers/specs/2026-07-10-live-call-transcription-design.md)
   * sidesteps it entirely: each device transcribes ONLY its own microphone
   * locally and relays finals over CALL_TRANSCRIPTION_SEGMENT instead. The
   * gateway has no handler for these five and no client emits them — kept
   * declared (not deleted, matching the CALL_TRANSLATION_REQUESTED-style
   * reserved block above) so nobody assumes the gateway already relays
   * capability/role negotiation or raw audio chunks. Delete only if the
   * leader/follower design is formally abandoned rather than shelved.
   */
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
  /**
   * Rapport de télémétrie terminal, émis UNE fois au raccrochage par les trois
   * clients. Écouté, validé (`socketCallAnalyticsSchema`) et agrégé par la
   * passerelle depuis toujours — déclaré ici seulement au cycle 107.
   */
  CALL_ANALYTICS: 'call:analytics',

  // --- Location sharing ---
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

/**
 * Budget serveur de `reaction:request-sync`, par utilisateur.
 *
 * Publié ICI, et non dans le seul `SOCKET_RATE_LIMITS` de la gateway, parce
 * qu'un CLIENT en dépend désormais pour se cadencer : la réconciliation des
 * réactions au retour de la connexion émet une demande par bulle montée, et
 * une bulle ne peut pas savoir combien de voisines partagent le même budget.
 * Un client qui devine ce chiffre le devine faux dès que le serveur le change —
 * exactement la duplication que la règle « single source of truth » interdit.
 *
 * La gateway le consomme dans `SOCKET_RATE_LIMITS.REACTION_SYNC`
 * (`services/gateway/src/utils/socket-rate-limiter.ts`), qui garde son
 * `keyPrefix` : la clé Redis est une affaire de serveur, le budget non.
 */
export const REACTION_SYNC_BUDGET = {
  maxRequests: 120,
  windowMs: 60000,
} as const;

/**
 * Ce que répond un ACK dont le budget est épuisé.
 *
 * Un refus n'est PAS un échec : le serveur a répondu, et il a répondu « pas
 * maintenant ». Un client doit pouvoir les séparer pour ne pas réessayer
 * immédiatement une demande dont la fenêtre n'a pas bougé — un réessai
 * approfondit l'épuisement au lieu de le traverser. La distinction voyage donc
 * dans un littéral PARTAGÉ, jamais dans une prose que chaque client
 * re-devinerait.
 */
export const RATE_LIMIT_REFUSAL_MESSAGE = 'Rate limit exceeded';

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
  // PAS d'effectif ici, et c'est délibéré : `conversation:joined` /
  // `conversation:left` sont des accusés de ROOM (`ConversationHandler`),
  // réémis à chaque ouverture et à chaque fermeture de fil, sans qu'aucune
  // appartenance change. L'adhésion et le départ réels ont leurs propres
  // événements — `CONVERSATION_PARTICIPANT_JOINED` / `_LEFT` — et ce sont eux
  // qui portent `memberCount`.
}

/**
 * Données pour le REFUS d'une jonction de conversation (`conversation:join-error`).
 *
 * Déclaré au cycle 99. L'événement existait depuis longtemps — huit sites
 * d'émission dans `ConversationHandler`, un consommateur web et un consommateur
 * iOS — mais n'avait AUCUNE entrée ici. Ses deux consommateurs en avaient donc
 * chacun transcrit la forme en lisant le producteur, et tous deux avaient
 * conclu la même chose de travers : que l'événement signifiait « tu n'es plus
 * membre », alors que quatre de ses sept motifs sont transitoires.
 *
 * `reason` n'est pas décoratif : c'est lui qui sépare les refus qui établissent
 * la non-appartenance de ceux qui ne disent rien de l'appartenance. Un
 * consommateur DOIT le lire avant de détruire quoi que ce soit, via
 * `isMembershipDeniedJoinError()` — la seule règle, partagée.
 *
 * @see utils/conversation-join-error.ts
 */
export interface ConversationJoinErrorEventData {
  /**
   * L'identifiant TEL QUE DEMANDÉ par le client, pas l'identifiant normalisé :
   * sur les refus précoces (`invalid_payload`, `server_error`) la normalisation
   * n'a pas eu lieu, et le client doit pouvoir rapprocher le refus de la
   * demande qu'il a émise.
   */
  readonly conversationId: string;
  readonly reason: ConversationJoinErrorReason;
  readonly message: string;
}

/**
 * Données pour l'événement d'authentification
 */
/**
 * L'identité MINIMALE que l'accusé d'authentification rend au socket qui vient
 * de s'authentifier.
 *
 * Ce n'est PAS un `SocketIOUser`, et le déclarer ainsi était un mensonge de
 * contrat (cycle 101) : les deux — et seuls — émetteurs de `AUTHENTICATED`
 * (`AuthHandler._authenticateJWTUser` et `._authenticateAnonymousUser`)
 * servent exactement ces trois champs. `language` n'existe pas sur
 * `SocketIOUser` ; ses onze champs requis (`username`, `email`, `role`,
 * `isOnline`, `lastActiveAt`…) n'ont jamais voyagé sur cet événement, et un
 * participant ANONYME n'a pas de ligne `User` d'où les tirer.
 *
 * Le destinataire de cet accusé sait déjà QUI il est — il vient de présenter
 * son jeton. Ce que l'événement lui apprend, c'est sous quelle identité la
 * passerelle l'a admis (`id`), dans quelle langue elle le servira
 * (`language`), et par quel régime (`isAnonymous`).
 */
export interface AuthenticatedEventUser {
  readonly id: string;
  readonly language: string;
  readonly isAnonymous: boolean;
}

export interface AuthenticatedEventData {
  readonly success: boolean;
  readonly user?: AuthenticatedEventUser;
  readonly error?: string;
  /** `APP_VERSION` de la passerelle — émis par les deux producteurs. */
  readonly version?: string;
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
  /**
   * Déclaré `NotificationContext` — le type RÉEL du producteur — et non plus
   * `Record<string, unknown>` (cycle 105).
   *
   * L'opacité n'était pas un choix : elle n'a jamais été confrontée à
   * l'émetteur, parce que `emitWithSeq` prenait `Record<string, unknown>` et
   * que les deux sites d'appel portaient le double cast qui le dit
   * (`socketPayload as unknown as Record<string, unknown>`). Le premier typage
   * de l'émission l'a fait tomber : `NotificationContext` est une interface,
   * donc SANS signature d'index, donc jamais assignable à une carte ouverte.
   *
   * Le type vit dans ce même paquet (`types/notification.ts`) : le déclarer ne
   * fait entrer aucune dépendance, il cesse seulement de cacher ce que les
   * trois clients reçoivent déjà.
   */
  readonly context?: NotificationContext;
  readonly metadata?: NotificationMetadata;
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
  /**
   * Curseur MONOTONE par utilisateur, estampillé par `emitWithSeq`
   * (`services/gateway/src/socketio/utils/emitWithSeq.ts`) — pas une propriété
   * de la notification, une propriété du TRANSPORT.
   *
   * C'est le signal de détection de TROU du SyncEngine : un client qui reçoit
   * `_seq = N+2` après `N` sait qu'un événement lui a échappé et déclenche une
   * resynchronisation. **Les trois clients l'OBSERVENT** — web
   * (`observeSyncSeq(this.syncSeq, data?._seq)`,
   * `notification-socketio.singleton.ts`), iOS (`case seq = "_seq"` →
   * `SyncSeqTracker.observe`, `MeeshySDK/Sockets/MessageSocketManager.swift`),
   * Android (`syncSeqTracker.observe(raw.opt("_seq"))`,
   * `sdk-core/.../socket/MessageSocketManager.kt`).
   *
   * Ce paragraphe a dit « les trois le lisent » pendant que **Android le
   * jetait** : son décodeur (`Json.ignoreUnknownKeys`) déposait le champ, et la
   * preuve citée — `MessageSocketManagerNotificationTest` — n'assertait rien sur
   * `_seq` ; elle prouvait exactement l'inverse, que le décodage SURVIT au champ.
   * Une citation n'est pas une mesure : le test cité prouvait la tolérance, pas
   * la lecture. Android observe depuis que ce miroir a été écrit (cycle 108).
   *
   * **Déclaré ici parce qu'il ne l'était NULLE PART** (cycle 105). Il ne
   * voyageait que parce que `emitWithSeq` prenait
   * `payload: Record<string, unknown>` : un champ porteur, traversant trois
   * décodeurs, dont aucun contrat ne parlait — exactement le cas de `location`
   * sur `ConversationUpdatedEventData` avant qu'on ne le déclare, et la même
   * conséquence : la parité entre émetteurs ne tenait qu'à la lecture du code
   * voisin.
   *
   * Optionnel, et l'absence est SIGNIFIANTE : `emitWithSeq` dégrade
   * volontairement en émettant SANS `_seq` quand l'allocation du compteur
   * rejette ou dépasse son délai. Le client traite alors l'événement sans
   * avancer son curseur, et le trou éventuel est rattrapé au prochain `/sync`.
   */
  readonly _seq?: number;
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
 *
 * **Exception : les quatre composants du nom voyagent en GROUPE.** Dès que
 * `displayName`, `firstName`, `lastName` OU `username` change, les quatre sont
 * présents. Le nom RENDU par un client est `displayName > « Prénom Nom » >
 * username` ; un client ne stocke que le nom déjà composé, donc un delta
 * partiel (« firstName vaut désormais Bob ») est irrecomposable chez lui — il
 * lui manque toujours les autres composants. Le groupe entier lui permet
 * d'appliquer SON résolveur (`getUserDisplayName` web,
 * `APIConversationUser.name` iOS) sans qu'une quatrième copie de la règle
 * apparaisse côté serveur. La présence de `username` est donc le marqueur du
 * groupe : `avatar`/`banner` changent seuls, le nom jamais.
 *
 * `null` sur `displayName`/`firstName`/`lastName` signifie EFFACÉ, et c'est le
 * seul moyen pour le client de faire retomber le nom sur le composant suivant.
 * `username` est obligatoire côté base, donc jamais `null`.
 */
export interface UserUpdatedEventData {
  readonly userId: string;
  readonly changes: Readonly<{
    displayName?: string | null;
    avatar?: string | null;
    banner?: string | null;
    username?: string;
    firstName?: string | null;
    lastName?: string | null;
  }>;
}

/**
 * Notification marquée comme lue
 */
export interface NotificationReadEventData {
  readonly notificationId: string;
}

/**
 * Lot de notifications marquées comme lues, décrit par son PRÉDICAT.
 *
 * Aucun `count` : il ferait croire à un décrément utilisable, alors qu'un cache
 * partiel matche moins de lignes que le serveur n'en a marquées. Les compteurs
 * restent tenus par `notification:counts`, émis juste après.
 */
export interface NotificationReadBulkEventData {
  readonly scope: NotificationReadBulkScope;
}

/**
 * Notification supprimée
 */
export interface NotificationDeletedEventData {
  readonly notificationId: string;
}

/**
 * Lot de notifications SUPPRIMÉES, décrit par son PRÉDICAT.
 *
 * Aucun `count`, pour la même raison que `read-bulk` — et le client ne doit de
 * toute façon toucher à aucun compteur ici : toute ligne matchée était lue,
 * donc jamais comptée dans `unread`.
 */
export interface NotificationDeletedBulkEventData {
  readonly scope: NotificationDeletedBulkScope;
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
  readonly playPositionMs?: number;
  readonly durationMs?: number;
  readonly percentage?: number;
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
 * Données pour l'événement de statistiques de conversation
 */
export interface ConversationStatsEventData {
  readonly conversationId: string;
  readonly stats: ConversationStatsDTO;
}

/**
 * Données pour l'événement de mise à jour du compteur de messages non lus
 */
export interface ConversationUnreadUpdatedEventData {
  readonly conversationId: string;
  readonly unreadCount: number;
  /**
   * Le pont ✦ recalculé POUR CE destinataire (G-123). Le pont est PAR lecteur :
   * deux destinataires du même événement source (un `message:new`) ne portent
   * jamais le même `bridge`.
   *
   * TROIS ÉTATS, et c'est le cœur du contrat (cycle 63). Ce champ a longtemps
   * eu deux formes de fil pour exprimer trois faits, et le troisième —
   * « je n'ai pas calculé » — n'avait aucun mot. Les émetteurs qui ne
   * calculaient pas empruntaient donc le mot de « il n'y en a pas », et les
   * deux clients, qui recopient ce champ AUTORITAIREMENT, lisaient un ORDRE
   * D'EFFACEMENT là où le serveur ne voulait dire que son silence.
   *
   * | Fil | Sens | Le client doit |
   * |-----|------|----------------|
   * | objet | « voici le pont » | remplacer |
   * | `null` | « j'ai calculé : il n'y en a pas » | EFFACER |
   * | absent | « je n'ai pas calculé » | GARDER ce qu'il a |
   *
   * L'ABSENCE EST DÉSORMAIS INOFFENSIVE, et c'est délibéré : le défaut du
   * cycle 62 est né d'un émetteur qui se taisait sans savoir que son silence
   * détruisait. Un émetteur futur qui ignore tout du pont ne peut plus, par sa
   * seule omission, effacer celui d'un lecteur. L'effacement devient un ACTE
   * EXPLICITE (`bridge: null`), qu'on ne pose qu'en sachant ce qu'on dit.
   *
   * Compatibilité : `null` reproduit EXACTEMENT ce que faisaient les clients
   * déployés face à l'omission (ils effaçaient). Un client ancien reste donc
   * correct partout où l'effacement est voulu, et ne perd que le bénéfice du
   * troisième état.
   *
   * @see services/gateway/src/socketio/unreadBridgeField.ts — les quatre
   *      émetteurs et le fait que chacun déclare.
   */
  readonly bridge?: ConversationBridge | null;
}

/**
 * Données pour l'événement de mise à jour de réaction.
 *
 * C'est `ReactionUpdateEvent` (`./reaction`), pas une seconde déclaration : les
 * deux ont vécu comme jumelles structurelles dans deux fichiers qui ne se citent
 * pas, avec le risque de DÉRIVE que ça porte — `ReactionService.createUpdateEvent`
 * rend l'une, le contrat de diffusion déclarait l'autre, et rien n'obligeait les
 * deux à rester d'accord. Un alias supprime la question.
 */
export type ReactionUpdateEventData = ReactionUpdateEvent;

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
  /**
   * `User.id` de l'acteur, ou `null` quand c'est un participant ANONYME — il
   * n'a pas de ligne `User`, et `participantId` est alors sa seule identité.
   * Le cas se produit sur l'accusé de livraison automatique d'une conversation
   * ouverte par lien de partage, où les anonymes sont la population dominante.
   *
   * Un consommateur qui compare cette valeur à sa propre identité (synchro
   * multi-appareils du curseur de lecture) n'a rien à changer : `null` ne
   * correspond à personne, ce qui est le comportement voulu. `summary`, lui,
   * est porté par `conversationId` seul et reste applicable.
   */
  readonly userId: string | null;
  readonly type: 'read' | 'received';
  readonly updatedAt: Date;
  readonly summary: ReadStatusSummary;
  /**
   * Read frontier of the ACTOR at broadcast time, read from
   * `ConversationReadCursor.lastReadAt`. It lets the actor's OTHER devices sync
   * their own read cursor (multi-device read sync); a peer reading does not
   * move your own cursor, so a recipient who is not the actor MUST ignore it.
   * Read receipts are monotone, so a client applies it only when strictly newer
   * than its local cursor. `null` when the actor has no read cursor yet.
   *
   * **Qui est « l'acteur » : `userId ?? participantId`, dans cet ordre.**
   * `userId` seul ne suffit plus depuis qu'il vaut légitimement `null` pour un
   * invité de lien partagé : un client sans compte qui ne comparerait que ce
   * champ ne pourrait JAMAIS reconnaître ses propres autres appareils, et
   * perdrait la synchro de curseur que ces deux champs existent pour porter.
   * `participantId` est la ligne d'appartenance de l'acteur — non nulle pour
   * TOUTE la population, et partagée par tous les appareils d'une même identité
   * (une seule ligne `Participant` par couple conversation/identité, pour un
   * inscrit comme pour un invité).
   *
   * C'est la MÊME règle que celle qui nomme la room personnelle
   * (`personalRoomKey`, `ROOMS.user(userId ?? id)`) — une seule règle
   * d'identité d'acteur dans tout le système, pas deux. Un client à compte
   * compare son `User.id` et n'a RIEN à changer : la seconde branche ne
   * s'ouvre que là où la première est nulle.
   *
   * Present ONLY on `type: 'read'` broadcasts — the sole action that advances
   * a read cursor. ABSENT (`undefined`) on `type: 'received'` (delivery never
   * moves `lastReadAt`) and on the bulk auto-deliver broadcast
   * (`MessageHandler._autoDeliverToOnlineRecipients`), which carries only the
   * aggregate `summary` for sender checkmarks. Travels paired with
   * `unreadCount`: a consumer applies them together or not at all.
   *
   * **Et présent seulement dans la copie ADRESSÉE À L'ACTEUR.** Ces deux champs
   * ne décrivent pas la conversation mais UNE personne : à quel point elle est
   * en retard sur ce fil, et quand elle l'a rattrapé pour la dernière fois. Le
   * serveur émet donc l'événement DEUX fois sur un `read` — une copie sans ces
   * champs à l'éventail de la conversation, une copie complète à la seule room
   * personnelle de l'acteur (`ROOMS.user(userId ?? participantId)`), dont
   * l'éventail est alors exclu pour qu'aucun socket ne reçoive les deux. Un
   * pair ne les recevait de toute façon que pour les jeter, puisque le seul
   * consommateur qui les lit conditionne leur usage à « l'acteur, c'est moi » ;
   * et la préférence d'accusés de lecture qui autorise la diffusion consent à
   * « j'ai lu ton message », pas à la publication d'un arriéré.
   *
   * Rien à changer côté client : un appareil de l'acteur les reçoit toujours,
   * par le canal que ses sessions rejoignent à l'authentification. Un client
   * qui les lirait SANS vérifier l'identité de l'acteur, en revanche, cessera
   * de voir passer l'arriéré des autres — c'était le défaut, pas le contrat.
   */
  readonly lastReadAt?: Date | null;
  /**
   * Server-authoritative unread count for the ACTOR in this conversation
   * after the read/receive action. Same `userId ?? participantId` scoping and
   * same present-on-dedicated-routes / absent-on-auto-deliver semantics as
   * `lastReadAt`; applied as-is by the actor's devices when accepted. Même
   * portée d'adressage : la copie de l'acteur, jamais l'éventail.
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
  /**
   * Le participant SÉRIALISÉ (`serializeConversationParticipant`), ou `null`
   * quand la relecture du rang ne rend rien — d'où l'optionnalité, qui est
   * portée par le contrat et doit l'être par chaque décodeur client.
   *
   * **`role` porte le rôle GLOBAL** (`USER|ADMIN|…`) ; le rang DANS LA
   * CONVERSATION est `conversationRole`. Le rang à APPLIQUER reste `newRole`,
   * au premier niveau : ce bloc est un complément d'affichage, pas la décision.
   * Confondre les deux rétrograderait tout le monde en « membre ».
   *
   * Forme minimale garantie ; la charge utile porte le participant entier.
   */
  readonly participant?: {
    readonly id: string;
    readonly participantId?: string;
    readonly role?: string;
    readonly conversationRole?: string | null;
    readonly displayName?: string | null;
    readonly userId: string | null;
  } | null;
}

/**
 * Un hôte a modifié les droits d'un visiteur sans compte.
 *
 * `rights` porte l'état RÉSOLU (`rights ?? permissions`), pas le delta écrit.
 * Un client affiche un état ; lui envoyer une différence l'obligerait à
 * recomposer la résolution, donc à en tenir un second énoncé.
 *
 * Le participant est nommé par `participantId` et non par `userId` : le sujet de
 * cet événement n'a précisément pas de compte.
 */
export interface ParticipantRightsUpdatedEventData {
  readonly conversationId: string;
  readonly participantId: string;
  readonly updatedBy: string;
  readonly rights: {
    readonly canSendMessages: boolean;
    readonly canSendFiles: boolean;
    readonly canSendImages: boolean;
    readonly canSendVideos: boolean;
    readonly canSendAudios: boolean;
    readonly canSendLocations: boolean;
    readonly canSendLinks: boolean;
    readonly canViewHistory: boolean;
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
  /** `ReadingModePreference` (`types/reading-modes.ts`) : `auto` rend la main à l'orchestrateur. */
  readonly readingMode: string;
  readonly deletedForUserAt: string | null;
  readonly clearHistoryBefore: string | null;
}

/**
 * Variante "préférences user-level" : émis par les QUATRE verbes écrivains de
 * `me/preferences/{category}` (`PUT`, `PATCH`, `DELETE`) ET par la remise à
 * zéro globale `DELETE /me/preferences`, qui émet UNE FOIS PAR CATÉGORIE
 * effacée — le contrat étant per-catégorie, un événement « tout » sans
 * `category` ne tomberait dans aucune branche du discriminant côté client.
 *
 * Le client doit refetch la catégorie nommée : `usePreferences()` pose
 * `staleTime: Infinity`, donc cette invalidation est le seul chemin par lequel
 * un réglage changé sur un autre appareil atteint un onglet ouvert.
 *
 * Point unique côté gateway : `services/preferences/preferences-broadcast.ts`.
 */
export interface UserPreferencesCategoryUpdatedEventData {
  readonly userId: string;
  readonly category: string;
}

/**
 * Variante "préférences scope conversation" : émis par TOUT écrivain de
 * `UserConversationPreferences` — `PUT/DELETE /user-preferences/conversations/:id`
 * ET les routes de suppression par utilisateur (`delete-for-me`,
 * `restore-for-me`, `clear-history`), qui écrivent `deletedForUserAt` /
 * `clearHistoryBefore`. La ligne étant par UTILISATEUR et non par appareil,
 * un écrivain qui n'émet pas laisse les autres appareils sur un état périmé.
 * Côté gateway, `writeConversationPreferences` est le point unique qui
 * garantit l'incrément de `version` et cette diffusion.
 *
 * Payload complet incluant `version` pour la résolution optimistic vs socket.
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
 * One message named by a personal-visibility event, with the conversation it
 * belongs to.
 *
 * `conversationId` is not decoration: every client cache in this repo is keyed
 * by conversation, so a bare `messageId` would force a scan of every cached
 * list to find the one page holding it.
 */
export interface PersonalMessageVisibilityRef {
  readonly messageId: string;
  readonly conversationId: string;
}

/**
 * Payload of `MESSAGE_HIDDEN_FOR_ME`.
 *
 * A list, not a single id: the bulk route hides up to 100 messages in one
 * request, and one event per message would make a "clear these 100" gesture
 * cost 100 broadcasts. The single-message route emits a one-element list, so
 * clients have exactly one shape to handle.
 */
export interface MessageHiddenForMeEventData {
  readonly userId: string;
  readonly messages: readonly PersonalMessageVisibilityRef[];
  /** ISO-8601 instant the hiding was recorded. */
  readonly hiddenAt: string;
}

/** Payload of `MESSAGE_RESTORED_FOR_ME`. Same shape, opposite direction. */
export interface MessageRestoredForMeEventData {
  readonly userId: string;
  readonly messages: readonly PersonalMessageVisibilityRef[];
  /** ISO-8601 instant the restore was recorded. */
  readonly restoredAt: string;
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
  readonly content: string;
  readonly timestamp: string;
}

export interface ConversationParticipantBannedEventData {
  readonly conversationId: string;
  /** Toujours présent — voir `ConversationParticipantLeftEventData.participantId`. */
  readonly participantId?: string;
  /** `null` sans compte — voir `ConversationParticipantLeftEventData.userId`. */
  readonly userId: string | null;
  readonly bannedBy: { readonly id: string };
  readonly bannedAt: string;
  /**
   * Le lien de partage que ce bannissement a FERMÉ, quand la personne était
   * entrée par un lien. Bannir sort de la conversation ET invalide la porte
   * empruntée : sortir quelqu'un en laissant son lien ouvert ne protège de rien,
   * il suffit de le rouvrir pour revenir sous un autre pseudonyme.
   *
   * ABSENT quand il n'y avait pas de lien à fermer (créateur, membre ajouté à la
   * main) — jamais `null` : l'absence dit « aucune porte n'a été fermée ».
   */
  readonly closedShareLinkId?: string;
  /**
   * Faux quand la cible avait DÉJÀ quitté la conversation — bannir un ancien
   * membre reste possible, c'est ce qui l'empêche de revenir par un lien de
   * partage, mais ce bannissement-là ne retire aucune appartenance.
   *
   * Un compteur de membres doit suivre ce champ, jamais la seule réception de
   * l'événement. Absent des serveurs antérieurs à ce contrat : le lire comme
   * `true` y reproduit leur comportement, puisqu'ils ne bannissaient qu'en
   * retirant.
   */
  readonly membershipEnded?: boolean;
  /**
   * Effectif ACTIF APRÈS le bannissement, absolu. Quand il est là, il tranche
   * le cas ci-dessus de lui-même : bannir un ex-membre ne retire personne, donc
   * le compte est simplement inchangé. `membershipEnded` reste pour les clients
   * qui décomptent encore.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantUnbannedEventData {
  readonly conversationId: string;
  /** Toujours présent — voir `ConversationParticipantLeftEventData.participantId`. */
  readonly participantId?: string;
  /** `null` sans compte — voir `ConversationParticipantLeftEventData.userId`. */
  readonly userId: string | null;
  /**
   * Le bannissement est levé dans tous les cas ; l'appartenance n'est rendue
   * que si le bannissement l'avait prise. Faux quand la personne était partie
   * d'elle-même AVANT d'être bannie : elle redevient libre de revenir par une
   * porte d'entrée, mais n'est pas réintégrée.
   *
   * Même lecture que `membershipEnded` côté bannissement — absent ⇒ `true`.
   */
  readonly membershipRestored?: boolean;
  /**
   * Effectif ACTIF APRÈS la levée, absolu — à poser plutôt qu'à incrémenter.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantJoinedEventData {
  readonly conversationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly joinedAt: string;
  /**
   * Effectif ACTIF APRÈS l'adhésion, absolu — à POSER, pas à incrémenter.
   *
   * Un delta ne converge pas : l'événement manqué (hors room, hors ligne, trou
   * de reconnexion) laisse une dérive que rien ne rattrape, et que les deux
   * clients PERSISTENT — cache disque iOS (`schedulePersist`), `staleTime:
   * Infinity` côté web. Un total se rattrape à l'événement suivant.
   *
   * Le compte INCLUT l'arrivant, alors même que l'éventail l'écarte : son
   * propre écran reçoit l'effectif par `conversation:new`.
   *
   * Absent des serveurs antérieurs à ce contrat, où l'incrément reste le seul
   * repli disponible.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationParticipantLeftEventData {
  readonly conversationId: string;
  /**
   * L'identité TOUJOURS présente — la seule qu'un visiteur venu par un lien
   * partagé possède, puisqu'il n'a aucune ligne `User`. C'est sur ce champ, et
   * jamais sur `userId`, qu'un client retire la bonne ligne.
   *
   * Absent des serveurs antérieurs à ce contrat : un client le lit alors comme
   * `undefined` et retombe sur `userId`, ce qui reproduit son comportement
   * d'avant (les seuls départs qu'ils annonçaient étaient ceux de comptes).
   */
  readonly participantId?: string;
  /**
   * `null` quand la personne n'a PAS de compte. Ce champ déclare un `User.id` :
   * y recopier un `Participant.id` ferait passer une clé de participant pour une
   * clé d'utilisateur dans tout ce qui la consomme ensuite.
   */
  readonly userId: string | null;
  readonly displayName: string;
  readonly leftAt: string;
  /**
   * Effectif ACTIF APRÈS le départ, absolu — à POSER, pas à soustraire. Un
   * client qui décrémente ne se rattrape jamais d'un événement manqué.
   * Absent des serveurs antérieurs à ce contrat, où le décrément reste le
   * seul repli disponible.
   */
  readonly memberCount?: number;
  /**
   * Vrai quand `memberCount` est plafonné à 199 (cap d'affichage « 199+ »,
   * broadcast unique pour toute la room). À POSER avec `memberCount` ; absent
   * quand l'effectif transmis est exact.
   */
  readonly memberCountCapped?: boolean;
}

export interface ConversationUpdatedEventData {
  readonly conversationId: string;
  readonly updatedBy: { readonly id: string };
  readonly updatedAt: string;
  /**
   * Identité du message que la ligne de liste doit décrire après cet
   * événement. Membre porteur du groupe d'aperçu : c'est LUI que les trois
   * clients lisent en premier, et les autres champs du groupe ne valent que
   * pour le message qu'il nomme.
   *
   * Tri-état, et les trois branches sont distinctes :
   * - **clé ABSENTE** — cet événement ne parle pas du dernier message (un
   *   renommage, un réglage). Ne rien toucher.
   * - **`null`** — « ce lecteur n'a plus AUCUN message visible ici » : il vient
   *   de masquer pour lui le dernier qui lui restait. Seul
   *   `emitConversationPreviewUpdate` produit cette forme.
   * - **plein** — la ligne décrit ce message. Il peut être celui qu'elle
   *   décrivait déjà (édition, traduction qui atterrit) ou un AUTRE (masquage
   *   personnel, suppression pour tous) ; seule l'identité les sépare.
   */
  readonly lastMessageId?: string | null;
  /**
   * Horodatage du message nommé par `lastMessageId` — le RANG de la
   * conversation dans la liste, donc ce que le tri des trois clients lit.
   *
   * **Chaîne ISO**, comme `updatedAt` son jumeau ci-dessus. Les trois
   * émetteurs passaient l'objet `Date` de Prisma : le fil ne montrait pas la
   * différence (l'encodeur par défaut de socket.io est `JSON.stringify`, qui
   * rend exactement `toISOString()`), mais c'était le seul horodatage du
   * payload dont le type était décidé par l'encodeur au lieu d'être énoncé —
   * et tout témoin en cours de route voyait donc une `Date` là où les clients
   * reçoivent une chaîne.
   */
  readonly lastMessageAt?: string | null;
  /**
   * Texte d'aperçu du message nommé, PLAFONNÉ (`truncateMessagePreview`).
   *
   * Vide n'est pas absent : un message position-seule a un `content` vide que
   * le client compose depuis `location`. Sort de `resolveLastMessagePreviewPrism`
   * avec la carte du Prisme, sous le même plafond qu'elle — la paire est
   * indissociable par construction, un appelant ne peut pas en émettre une
   * moitié plafonnée et l'autre non.
   */
  readonly lastMessagePreview?: string | null;
  /**
   * Auteur du message nommé par `lastMessageId`.
   *
   * **Deux espaces d'ids, et le contrat ne les distingue pas.** La colonne
   * `Message.senderId` est un `Participant.id`
   * (`sender Participant @relation("MessageSender")`), et c'est ce que servent
   * le chemin REST/ZMQ et `emitConversationPreviewUpdate`. Le chemin socket
   * (`message:send`) sert un `User.id` — les deux espaces ne se télescopent
   * jamais, si bien que rien ne rougit.
   *
   * Piège ARMÉ, pas panne : aucun client n'en tire de rendu aujourd'hui. Le web
   * l'écrit dans le `Message.senderId` de sa ligne neutre, que rien ne relit ;
   * iOS le décode et ne le mappe pas. Déclaré ici pour que le prochain client
   * qui voudra l'utiliser trouve l'avertissement AVANT de résoudre un nom avec.
   * L'unifier est un changement de SÉMANTIQUE sur le chemin le plus chaud du
   * service — son propre lot, pas celui-ci.
   */
  readonly senderId?: string | null;
  /**
   * Prisme Linguistique de la ligne de liste, résolu POUR CE destinataire —
   * jumeaux des champs que `GET /conversations` pose déjà sur la conversation.
   *
   * Les trois champs d'aperçu (`lastMessagePreview` + ces deux-ci) s'appliquent
   * EN GROUPE : le client préfère la traduction à l'aperçu brut, donc poser l'un
   * sans les autres laisse la ligne rendre l'ANCIEN texte traduit après une
   * édition. `null` est une VALEUR, pas une absence — une édition remet
   * `Message.translations` à null dans la même écriture tout en gardant le même
   * `lastMessageId`, et c'est ce `null` reçu qui périme la carte du client.
   * Seul le serveur sait que la carte a été périmée ; le client ne peut pas le
   * déduire.
   */
  readonly lastMessageTranslations?: Readonly<Record<string, string>> | null;
  readonly lastMessageOriginalLanguage?: string | null;
  /**
   * Lieu partagé du dernier message, hissé depuis `metadata.location` — membre
   * du MÊME groupe d'aperçu que les trois champs ci-dessus, et soumis à la même
   * règle de groupe.
   *
   * Déclaré ici parce qu'il ne l'était nulle part : l'index signature de fin le
   * laissait voyager sans contrat, si bien que la parité entre les TROIS
   * émetteurs de ce groupe (`MessageHandler`, `MeeshySocketIOManager`,
   * `emitConversationPreviewUpdate`) ne reposait que sur la lecture du code
   * voisin. Elle a échoué exactement comme ça : le chemin REST/ZMQ l'a omis
   * pendant que les deux autres le portaient (corrigé par #3122, sans que rien
   * n'empêche la prochaine récidive — c'est ce que cette déclaration ajoute).
   *
   * **Clé ABSENTE = « ce message n'a pas de lieu »**, et non « je n'en parle
   * pas » : les clients écrivent l'épingle AVEC l'identité du message, si bien
   * que son absence efface celle du message précédent quand un texte le
   * remplace. Corollaire opposable à tout nouvel émetteur : **qui porte
   * `lastMessageId` porte le lieu du message qu'il nomme, ou aucun.**
   *
   * Forme non typée, même convention que `MessageRequest.location` : la
   * validation stricte (bornes des coordonnées, longueur des chaînes) vit dans
   * `services/gateway/src/services/location/sharedPlace.ts`, et la dupliquer
   * ici la ferait diverger.
   */
  readonly location?: unknown;
  /**
   * `true` quand le serveur a RECALCULÉ l'aperçu depuis l'état courant de la
   * base, par opposition à une poussée de message (`bump-to-top`) qui ne fait
   * que porter le message qu'on vient d'écrire.
   *
   * Ce que le champ existe pour dire : **cet aperçu peut légitimement RECULER
   * dans le temps.** Supprimer le dernier message pour tous fait redescendre la
   * ligne sur le message PRÉCÉDENT, donc plus ancien ; un lecteur qui masque
   * son propre dernier message visible se voit servir un remplaçant plus ancien
   * par construction. Les clients tiennent une garde monotone sur le groupe
   * d'aperçu — un `lastMessageAt` plus ancien y désigne un message périmé, et
   * tout le groupe est jeté — parce qu'ils ne peuvent pas distinguer, du seul
   * contenu, une diffusion arrivée dans le désordre d'un recalcul autoritatif :
   * les deux reculent, les deux nomment un autre message. Seul l'émetteur le
   * sait, et c'est ce qu'il déclare ici.
   *
   * Posé par `emitConversationPreviewUpdate` (édition, suppression pour tous,
   * traduction qui atterrit, masquage personnel) et par LUI SEUL. Les émetteurs
   * message-driven (`MessageHandler`, `MeeshySocketIOManager`) l'omettent
   * délibérément : ce sont eux que la garde monotone protège.
   *
   * Optionnel et absent par défaut — un client qui ne le lit pas garde
   * exactement le comportement d'avant.
   */
  readonly previewRecalculated?: boolean;
  /**
   * Groupe MÉTADONNÉES — l'autre moitié de l'événement, et la seule que
   * `PUT /conversations/:id` émet (`routes/conversations/core.ts`).
   *
   * Ces huit champs voyagent depuis toujours et les trois clients les lisent
   * (iOS les décode tous sur `ConversationUpdatedEvent`) ; aucun n'était
   * déclaré. Ils passaient par la signature d'index, en compagnie des quatre
   * champs porteurs du groupe d'aperçu ci-dessus.
   *
   * Ils sont posés UN PAR UN, seulement quand la requête les a changés : une
   * clé absente veut dire « ce réglage n'a pas bougé », jamais « remets-le à
   * zéro ». C'est la même règle de tri-état que le groupe d'aperçu, et c'est
   * pourquoi aucun d'eux n'est requis.
   *
   * Le payload de ce chemin ne porte AUCUNE clé `lastMessage*`, délibérément :
   * un `lastMessageTranslations: null` posé par un renommage effacerait une
   * traduction parfaitement valide sur toutes les lignes de liste.
   */
  readonly title?: string;
  readonly description?: string;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly defaultWriteRole?: string;
  readonly isAnnouncementChannel?: boolean;
  readonly slowModeSeconds?: number;
  readonly autoTranslateEnabled?: boolean;
  /*
   * PAS de `readonly [key: string]: unknown` ici, et la raison mérite d'être
   * écrite parce qu'elle n'est PAS celle qu'on croit.
   *
   * La signature d'index vivait ici pour laisser passer les douze champs
   * ci-dessus, qu'aucune ligne ne déclarait. La retirer ne fait tomber AUCUNE
   * compilation — mesuré, 0 erreur sur `packages/shared` + `services/gateway` —
   * parce que les quatre émetteurs composent tous leur charge dans une variable
   * avant de la répandre dans l'appel à `emit`, et qu'une clé venue d'un spread
   * est invisible au contrôle des propriétés excédentaires de TypeScript.
   *
   * Elle ne supprimait donc qu'un contrôle que le spread supprimait déjà. Ce
   * qui SURVIT au spread — un champ requis absent, un champ de type faux — ne
   * porte que sur les champs DÉCLARÉS : c'est la déclaration qui fait le
   * travail, pas la fermeture de la carte. Le cliquet qui garde le reste est un
   * balayage
   * (`services/gateway/src/socketio/__tests__/conversation-updated-declared-fields.ts`),
   * et il n'a de sens que tant que cette signature reste absente — avec elle,
   * tout serait déclaré d'avance et il ne pourrait plus tomber.
   */
}

export interface ConversationClosedEventData {
  readonly conversationId: string;
  readonly closedBy: string;
  readonly closedAt: string;
}

/**
 * `conversationId` et `senderId` sont OBLIGATOIRES : Socket.IO ne transporte pas
 * le nom de la room côté réception, donc la charge utile est le seul routage dont
 * dispose le client. Un message sans `conversationId` est indélivrable — aucun
 * cache ne peut l'accueillir.
 */
export interface LinkMessagePayload {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly [key: string]: unknown;
}

export interface LinkMessageNewEventData {
  readonly message: LinkMessagePayload;
}

/**
 * Corps `data` de la réponse 201 des deux routes d'envoi via lien de partage
 * (`POST /links/:identifier/messages[/auth]`).
 *
 * Il porte le MÊME message que `link:message:new`, à un champ près :
 * `clientMessageId`. C'est la seule clé qui relie le message serveur à la ligne
 * optimiste déjà affichée chez l'auteur, et elle ne revient qu'à lui — le
 * payload servi aux pairs en est dépouillé, pour qu'un tiers n'apprenne pas
 * l'espace d'ids de la file d'attente de l'expéditeur (Phase 4 §6.2, même
 * règle que le chemin nominal `message:send` / `message:new`).
 *
 * Un client qui envoie par cette route DOIT lire `message.clientMessageId`
 * pour réconcilier : sans lui, sa ligne optimiste et la copie serveur
 * coexistent et le message apparaît deux fois.
 */
export interface LinkMessageSendResponseData {
  readonly messageId: string;
  readonly message: LinkMessagePayload & { readonly clientMessageId?: string };
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
  [SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME]: (data: MessageHiddenForMeEventData) => void;
  [SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME]: (data: MessageRestoredForMeEventData) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATION]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.TYPING_START]: (data: TypingEvent) => void;
  [SERVER_EVENTS.TYPING_STOP]: (data: TypingEvent) => void;
  [SERVER_EVENTS.USER_STATUS]: (data: UserStatusEvent) => void;
  [SERVER_EVENTS.PRESENCE_SNAPSHOT]: (data: PresenceSnapshotEventData) => void;
  [SERVER_EVENTS.CONVERSATION_JOINED]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_LEFT]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_JOIN_ERROR]: (data: ConversationJoinErrorEventData) => void;
  [SERVER_EVENTS.AUTHENTICATED]: (data: AuthenticatedEventData) => void;
  [SERVER_EVENTS.AUTH_TOKEN_EXPIRED]: (data: AuthTokenExpiredEventData) => void;
  [SERVER_EVENTS.AUTH_SESSION_REVOKED]: (data: AuthSessionRevokedEventData) => void;
  [SERVER_EVENTS.ERROR]: (data: ErrorEventData) => void;
  [SERVER_EVENTS.CONVERSATION_STATS]: (data: ConversationStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED]: (data: ConversationUnreadUpdatedEventData) => void;
  [SERVER_EVENTS.REACTION_ADDED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_REMOVED]: (data: ReactionUpdateEventData) => void;
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
  [SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE]: (data: CallTranscriptionActiveBroadcast) => void;
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
  [SERVER_EVENTS.MESSAGE_CONSUMED]: (data: MessageConsumedEventData) => void;
  [SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED]: (data: ParticipantRoleUpdatedEventData) => void;
  [SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED]: (data: ParticipantRightsUpdatedEventData) => void;
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
  [SERVER_EVENTS.COMMENT_UPDATED]: (data: CommentUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_DELETED]: (data: CommentDeletedEventData) => void;
  [SERVER_EVENTS.COMMENT_LIKED]: (data: CommentLikedEventData) => void;
  [SERVER_EVENTS.COMMENT_UNLIKED]: (data: CommentUnlikedEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_ADDED]: (data: CommentReactionUpdateEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_REMOVED]: (data: CommentReactionUpdateEventData) => void;

  // Post reactions (Phase 3B)
  [SERVER_EVENTS.POST_REACTION_ADDED]: (data: PostReactionUpdateEventData) => void;
  [SERVER_EVENTS.POST_REACTION_REMOVED]: (data: PostReactionUpdateEventData) => void;

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
  [SERVER_EVENTS.NOTIFICATION_READ_BULK]: (data: NotificationReadBulkEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_DELETED_BULK]: (data: NotificationDeletedBulkEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_DELETED]: (data: NotificationDeletedEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_COUNTS]: (data: NotificationCountsEventData) => void;

  // Delivery queue — includes affected conversationIds so clients can scope invalidation
  /**
   * Fin du rejeu de la file hors ligne, au reconnect.
   *
   * **Les deux champs ne portent PAS la même population, et c'est délibéré.**
   *
   * - `count` — le nombre d'entrées RÉELLEMENT rejouées. C'est une affirmation
   *   de livraison : elle ne compte jamais une entrée que la passerelle n'a pas
   *   su diffuser (`eventType` que la table `DRAINED_EVENT` ne résout pas, ou
   *   émission qui a levé). Même règle que les accusés de réception, qui
   *   descendent de la même liste.
   * - `conversationIds` — les conversations TOUCHÉES par le drain, rejeu réussi
   *   ou entrée perdue. Plus large que `count` par construction.
   *
   * L'écart entre les deux est ce qui rend une perte de rejeu RÉCUPÉRABLE. Le
   * drain est destructif : une entrée qu'on ne sait pas diffuser sort de la
   * file sans que rien n'atteigne le client. Les messages qu'elle transportait
   * sont pourtant toujours en base — seul leur rejeu temps réel a échoué. En
   * nommant quand même la conversation, l'événement envoie le client les
   * relire ; l'omettre ferait d'un incident de transport un trou permanent.
   *
   * Un `count: 0` accompagné d'une conversation nommée est donc une forme
   * VALIDE, et se lit « rien n'a pu être rejoué, va relire celle-ci ».
   */
  [SERVER_EVENTS.PENDING_MESSAGES_DELIVERED]: (data: { count: number; conversationIds: string[] }) => void;

  // Conversation lifecycle
  [SERVER_EVENTS.CONVERSATION_UPDATED]: (data: ConversationUpdatedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_CLOSED]: (data: ConversationClosedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_DELETED]: (data: ConversationDeletedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED]: (data: ConversationParticipantJoinedEventData) => void;
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
  /** Réponse privée à une story — DM porteur du contexte de la story. */
  readonly storyReplyToId?: string;
  /** Transfert : le message source, et sa conversation si elle diffère. */
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  /**
   * Diffusion à plusieurs destinataires (PAS un transfert) : la passerelle
   * copie CÔTÉ SERVEUR les pièces jointes du message désigné, si bien que
   * l'émetteur n'envoie ni texte ni `attachmentIds`.
   */
  readonly copyAttachmentsFromMessageId?: string;
  readonly isBlurred?: boolean;
  /** ISO 8601 — la passerelle en recompose le bit EPHEMERAL. */
  readonly expiresAt?: string;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  /**
   * Lieu partagé — champ dédié, JAMAIS un `metadata` brut. La forme n'est pas
   * contrainte ici : la validation stricte vit côté passerelle
   * (`services/location/sharedPlace.ts`).
   */
  readonly location?: unknown;
  /**
   * Les mentionnés que l'ÉMETTEUR nomme, plutôt que ceux que la passerelle
   * déduit du texte.
   *
   * Ce n'est pas une commodité : c'est le seul canal qui survit au chiffrement.
   * La passerelle retombe sur l'extraction des `@username` du CONTENU quand la
   * liste est absente — mais en mode `e2ee` le client remplace `content` par le
   * littéral `[Encrypted]` avant d'émettre, si bien qu'il n'y a plus rien à
   * extraire. La liste explicite est alors la seule chose qui rattache un
   * message à ceux qu'il nomme.
   */
  readonly mentionedUserIds?: readonly string[];
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionModeOnWire;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
  readonly isEncrypted?: boolean;
}

/**
 * Le mode de chiffrement TEL QU'IL VOYAGE. La passerelle normalise la casse à
 * l'entrée (iOS émet « E2EE »), mais le jeu de valeurs est FERMÉ : ce sont les
 * trois que le schéma accepte, ni plus ni moins.
 */
export type EncryptionModeOnWire = 'e2ee' | 'server' | 'hybrid';

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
  readonly storyReplyToId?: string;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly isBlurred?: boolean;
  readonly expiresAt?: string;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  readonly location?: unknown;
  /** Même contrat que `MessageSendData.mentionedUserIds` ci-dessus. */
  readonly mentionedUserIds?: readonly string[];
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionModeOnWire;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
  readonly isEncrypted?: boolean;
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
  [CLIENT_EVENTS.AUTHENTICATE]: (data: AuthenticateData) => void;
  [CLIENT_EVENTS.REQUEST_TRANSLATION]: (data: RequestTranslationData) => void;
  /**
   * L'accusé de réception d'un `reaction:add` porte la LIGNE PERSISTÉE
   * (`ReactionData`), et non l'`ReactionUpdateEventData` du broadcast.
   *
   * Ce n'est pas un relâchement du contrat, c'est ce que cet accusé PEUT tenir.
   * `ReactionUpdateEventData` porte une `aggregation`, qui ne s'obtient qu'au
   * prix de deux lectures supplémentaires APRÈS la persistance
   * (`message.findUnique` puis `createUpdateEvent`). Or ce handler acquitte
   * délibérément dès la persistance : une défaillance transitoire de ces
   * lectures ne doit jamais retourner l'accusé en échec, sans quoi le client
   * annule une réaction déjà écrite en base. Déclarer l'agrégation ici, c'est
   * réclamer un champ que le seul émetteur ne peut produire sans abandonner
   * cette garantie de livraison — et c'est exactement pourquoi il ne l'a jamais
   * produit.
   *
   * Les familles COMMENTAIRE et POST déclarent, elles, leur `updateEvent`
   * (`comment:reaction-*`, `post:reaction-*`) : leurs handlers acquittent APRÈS
   * l'agrégation, et l'iOS décode ces accusés. Les trois familles ne sont donc
   * pas interchangeables — chacune déclare ce que SON émetteur envoie.
   *
   * Historique : la forme opaque (`SocketIOResponse<unknown>` côté handler) a
   * déjà coûté trois incidents de décodage à l'iOS — deux `malformedResponse`
   * sur les accusés post/commentaire, un `DecodingError` sur le REST
   * `/reactions` (d'où `DiscardedReactionResponse`). Le quatrième site est
   * celui-ci ; il est fermé par la déclaration, et par le fait que les
   * handlers prennent désormais CE type et non plus `unknown`.
   */
  [CLIENT_EVENTS.REACTION_ADD]: (data: ReactionAddData, callback?: (response: SocketIOResponse<ReactionData>) => void) => void;
  /**
   * Un retrait ne laisse RIEN derrière lui qui mérite le fil : `data` est
   * absent, et `never` le rend inexprimable plutôt que simplement vide.
   *
   * L'émetteur envoyait `{ message: 'Reaction removed successfully' }` et
   * `{ message: 'Reaction already absent' }` — deux phrases anglaises non
   * localisées, qu'aucun des trois clients ne lit (le web n'inspecte que
   * `success`/`error`, l'iOS passe par le REST, Android n'émet pas cet
   * événement). Dans un produit dont la promesse est de traduire tout le
   * contenu, un texte anglais en dur sur le fil est un piège pour le premier
   * client qui l'affichera.
   */
  [CLIENT_EVENTS.REACTION_REMOVE]: (data: ReactionRemoveData, callback?: (response: SocketIOResponse<never>) => void) => void;
  /**
   * La QUATRIÈME famille de réactions, et la seule qui ait toujours eu raison :
   * son handler acquitte `{ success: true }` sur TOUS ses chemins — nominal
   * comme idempotent — et laisse l'`AttachmentReactionUpdateEventData` voyager
   * sur la diffusion, qui est son seul lecteur.
   *
   * `never` grave ce qu'elle fait déjà. Il ne remplace pas `unknown` pour la
   * forme : `unknown` accepte TOUTE charge, donc n'aurait pas empêché ce site
   * de dériver vers la ligne brute ou la phrase anglaise que portaient les
   * trois autres — c'est exactement l'opacité qui les a laissées diverger.
   */
  [CLIENT_EVENTS.ATTACHMENT_REACTION_ADD]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<never>) => void) => void;
  [CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<never>) => void) => void;
  [CLIENT_EVENTS.REACTION_REQUEST_SYNC]: (messageId: string, callback?: (response: SocketIOResponse<ReactionSyncEventData>) => void) => void;
  // Les quatre `ack?` ci-dessous — INITIATE, JOIN, SIGNAL, END — étaient les
  // seuls acks REQUIS de tout le contrat (4 contre 18 optionnels). Ils
  // promettaient une chose qu'aucune des deux moitiés du fil ne tient :
  //
  //   - la passerelle déclare les QUATRE `ack?` et les appelle toutes en
  //     `ack?.(…)` (`CallEventsHandler.ts` 2453 / 2776 / 3487 / 3851) : elle est
  //     écrite pour fonctionner quand il n'y en a pas ;
  //   - et des émetteurs réels n'en envoient pas — les trois `call:end` du web,
  //     `call:join` et `call:signal` d'iOS (`MessageSocketManager.swift` 2898 /
  //     3037 / 3077 / 3086), tandis que d'autres sites du MÊME fichier iOS
  //     utilisent `emitWithAck` : l'ack est optionnel PAR CONCEPTION.
  //
  // Le prix du mensonge se lisait dans le code appelant : les quatre émissions
  // `call:signal` du web fabriquent un `() => {}` VIDE (`use-webrtc-p2p.ts` 290
  // / 329 / 674 / 761) pour satisfaire un paramètre requis que le serveur
  // n'exige pas — une cérémonie qui coûte un paquet d'ACK par candidat ICE.
  // Là où le contrat n'était pas contourné par une cérémonie, il l'était par un
  // cast : les trois `call:end` du web passent par `(socket as unknown).emit`.
  //
  // Un contrat que tout site d'appel doit contourner pour dire la vérité ne
  // gouverne plus rien. Cf. le cliquet `_CallAcksAreOptional` sous l'interface.
  [CLIENT_EVENTS.CALL_INITIATE]: (data: CallInitiateEvent, ack?: (response: CallInitiateAck) => void) => void;
  [CLIENT_EVENTS.CALL_JOIN]: (data: CallJoinEvent, ack?: (response: CallJoinAck) => void) => void;
  [CLIENT_EVENTS.CALL_LEAVE]: (data: { callId: string }) => void;
  [CLIENT_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent, ack?: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_AUDIO]: (data: CallMediaToggleClientEvent) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_VIDEO]: (data: CallMediaToggleClientEvent) => void;
  /**
   * L'ack est OPTIONNEL, et il l'est dans l'autre sens que celui de
   * `CallMediaToggleClientEvent` (cycle 107 bis) — même symptôme, résolution
   * inverse, parce que la mesure diffère.
   *
   * Là-bas l'ack a été RETIRÉ : aucun client ne l'envoyait, la passerelle ne
   * l'appelait jamais, le déclarer était une promesse creuse. Ici il est REL :
   * la passerelle l'invoque à chacune de ses sorties (`ack?.({ success })`,
   * `CallEventsHandler` `CALL_EVENTS.END`) et iOS s'en sert par ses variantes
   * `emitWithAck` (`MessageSocketManager.swift`). Mais elle le déclare `ack?:`
   * et fonctionne sans, ce dont dépendent les émetteurs SANS ack : iOS
   * (`emit("call:end", …)`), Android (`CallSignalManager.kt`) et les trois
   * sites web.
   *
   * Le déclarer REQUIS interdisait donc le motif majoritaire que la passerelle
   * soutient explicitement. Un contrat suit ce qui est, pas ce qu'on préfère.
   */
  [CLIENT_EVENTS.CALL_END]: (data: { callId: string; reason?: string }, ack?: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_HEARTBEAT]: (data: CallHeartbeatEvent) => void;
  [CLIENT_EVENTS.CALL_QUALITY_REPORT]: (data: CallQualityReportEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTING]: (data: CallReconnectingEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTED]: (data: CallReconnectedEvent) => void;
  [CLIENT_EVENTS.CALL_BACKGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_FOREGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT]: (data: CallTranscriptionSegmentEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE]: (data: CallTranscriptionActiveEvent) => void;
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
  [CLIENT_EVENTS.CALL_ANALYTICS]: (data: CallAnalyticsEvent) => void;
  [CLIENT_EVENTS.PRESENCE_APP_STATE]: (data: { foreground?: boolean }) => void;

  // Location sharing
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

/**
 * Le type de l'accusé de réception d'un événement client, LU SUR LE CONTRAT.
 *
 * Un handler de la passerelle qui écrit `callback?: (r: SocketIOResponse<X>) =>
 * void` de sa main REDÉCLARE ce que cette interface déclare déjà, et les deux
 * peuvent alors diverger sans que rien ne l'empêche — c'est précisément ce qui
 * s'est produit sur les trois familles de réactions, où les handlers portaient
 * `SocketIOResponse<unknown>` pendant que le contrat promettait une charge
 * précise. `unknown` accepte tout : aucune des deux moitiés du fil ne vérifiait
 * l'autre, et le désaccord a coûté trois incidents de décodage à l'iOS.
 *
 * `AckOf<'reaction:add'>` n'est pas une COPIE du contrat, c'est une LECTURE :
 * il n'existe plus qu'une seule déclaration, et changer la charge d'un accusé
 * fait rougir tous ses `callback(...)` au lieu de les laisser passer.
 *
 * Le `NonNullable` retire l'optionalité du paramètre (`callback?`) sans toucher
 * à la charge ; l'appel reste facultatif côté handler, c'est sa SIGNATURE qui
 * cesse de l'être.
 */
export type AckOf<E extends keyof ClientToServerEvents> =
  NonNullable<Parameters<ClientToServerEvents[E]>[1]>;

/**
 * La RÉPONSE que cet accusé transporte — `Parameters<AckOf<E>>[0]`.
 *
 * Les handlers construisent souvent la réponse dans une variable locale avant
 * de l'acquitter (`const successResponse: … = { … }; callback(successResponse)`).
 * Annotée `SocketIOResponse<unknown>`, cette locale rouvrait la porte que la
 * signature venait de fermer : elle accepte n'importe quelle charge, et le
 * `callback(successResponse)` qui suit ne compare plus rien au contrat.
 * `AckResponseOf<E>` la referme au même endroit et depuis la même source.
 */
export type AckResponseOf<E extends keyof ClientToServerEvents> =
  Parameters<AckOf<E>>[0];

/* ------------------------------------------------------------------------- *
 * Le cliquet des acks d'appel — au TYPE, sans une ligne exécutable.
 *
 * Même emplacement et même raison que ses jumeaux de la passerelle
 * (`socketio/serverEmit.ts`, `socketio/clientReceive.ts`) : les tests sont
 * exclus du `tsconfig` et l'`ignoreCodes` de `ts-jest` couvre `2322`/`2345`, si
 * bien que **la production est le seul endroit d'où un cliquet de type peut
 * mordre**. Ici, en plus, `packages/shared` type-check en BLOQUANT dans la CI.
 *
 * Ce cliquet garde une propriété que rien d'autre ne peut garder : rendre l'un
 * de ces acks à nouveau REQUIS casse la compilation ICI, à l'endroit où la
 * mesure est écrite, plutôt que chez le prochain appelant qui contournera par
 * un `() => {}` vide ou par un cast.
 *
 * EXPORTÉS, contrairement à leurs jumeaux de la passerelle : `packages/shared`
 * compile avec `noUnusedLocals`, qui refuse un alias de type local jamais
 * référencé. L'export est donc la façon de garder le cliquet ADJACENT à ce
 * qu'il garde — l'emplacement fait la moitié de son travail. Types purs, donc
 * effacés à l'exécution ; leur présence dans la surface publique ne coûte rien.
 * ------------------------------------------------------------------------- */

/** Échoue à compiler dès que `T` n'est plus `true`. */
type AssertContract<T extends true> = T;

/**
 * Émettre ces quatre événements avec la CHARGE SEULE est permis par le contrat.
 *
 * `Parameters<…>` d'un ack REQUIS est un tuple de longueur 2, auquel un tuple
 * de longueur 1 n'est pas assignable — c'est exactement l'erreur (`TS2554`,
 * « Expected 2 arguments, but got 1 ») que les sites d'appel contournaient.
 * Avec `ack?`, le tuple devient `[data, ack?]` et la ligne passe.
 *
 * Le cas ci-dessous est le plus fort des quatre : `call:end` est émis SANS ack
 * par cinq des sept émetteurs du dépôt (trois web, deux iOS).
 */
export type _CallAcksAreOptional = AssertContract<
  [
    [CallInitiateEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_INITIATE]> ? true : false,
    [CallJoinEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_JOIN]> ? true : false,
    [CallSignalEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_SIGNAL]> ? true : false,
    [{ callId: string }] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_END]> ? true : false,
  ] extends [true, true, true, true] ? true : false
>;

/**
 * Le témoin NÉGATIF, sans lequel le précédent ne prouve rien : un ack requis
 * REFUSE bien la charge seule. Sans cette ligne, un `Parameters<…>` qui
 * rendrait `any` (ou une refonte qui rendrait l'assignabilité toujours vraie)
 * laisserait `_CallAcksAreOptional` passer pour un cliquet qui garde quelque
 * chose. Un témoin qu'on n'a pas vu échouer n'est pas un témoin.
 */
export type _RequiredAckWouldRefusePayloadAlone = AssertContract<
  [{ callId: string }] extends Parameters<(data: { callId: string }, ack: () => void) => void> ? false : true
>;

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

/**
 * La charge utile de `message:new` et de `message:edited`, TELLE QUE LES
 * PRODUCTEURS L'ÉMETTENT.
 *
 * Elle a longtemps déclaré quatorze champs quand les producteurs en servaient
 * une trentaine. Ce n'est pas une imprécision sans suite : les décodeurs iOS,
 * Android et web sont écrits CONTRE ce contrat, et un champ qui n'y figure pas
 * doit être transcrit indépendamment par chacun des trois — c'est exactement
 * ainsi que `conversation:join-error` a vécu huit sites d'émission et deux
 * transcriptions client divergentes sans jamais être déclaré (cycle 99).
 *
 * Ce qui est déclaré `unknown` l'est PAR DÉCISION, pas par paresse : `replyTo`,
 * `attachments`, `translations` et `metadata` ont une forme DÉLIBÉRÉMENT
 * différente d'un transport à l'autre (cf. l'en-tête de
 * `services/gateway/src/socketio/messageNewPayload.ts`, qui énumère les écarts
 * et leur raison). Entre deux producteurs qui se contredisent, ne rien affirmer
 * est plus honnête que d'en couronner un.
 *
 * Portée de la garde, pour ne pas la surestimer : la passerelle compile en
 * `strict: false` / `strictNullChecks: false`. Déclarer un champ ici fait donc
 * tomber une émission dont la clé MANQUE ou dont le TYPE est incompatible —
 * jamais une qui sert `undefined` là où le contrat promet une valeur.
 */
export interface SocketIOMessage {
  readonly id: string;
  readonly conversationId: string;
  /**
   * `User.id` de l'expéditeur — et non son `Participant.id`, contrairement à ce
   * que cette ligne a déclaré pendant toute la vie du contrat. Les clients
   * comparent ce champ à leur propre `User.id` pour reconnaître leurs messages
   * et réconcilier la bulle optimiste entre appareils ; les producteurs le
   * résolvent par `resolveWireSenderId`, qui ne replie sur le `Participant.id`
   * que pour un expéditeur ANONYME, lequel n'en a pas d'autre.
   */
  readonly senderId: string;
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly messageSource?: string;
  /**
   * Ne voyage QUE vers les appareils de l'expéditeur — `stripClientMessageId`
   * le retire de la charge utile des pairs juste avant l'émission.
   */
  readonly clientMessageId?: string;
  readonly isEdited?: boolean;
  readonly editedAt?: Date;
  readonly deletedAt?: Date;
  readonly expiresAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly sender?: SocketIOMessageSender;

  /** Vue unique, flou, effets de bulle. */
  readonly isBlurred?: boolean;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
  readonly effectFlags?: number;

  /** Réponses, citations de post, transferts. */
  readonly replyToId?: string;
  readonly replyTo?: unknown;
  readonly storyReplyToId?: string;
  readonly postReplyTo?: unknown;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly forwardedFrom?: unknown;
  readonly forwardedFromConversation?: unknown;

  /** Prisme Linguistique et pièces jointes — formes propres au transport. */
  readonly translations?: unknown;
  readonly attachments?: unknown;

  /** Mentions : les pseudos validés en base, et leur résolution enrichie. */
  readonly validatedMentions?: readonly string[];
  readonly mentionedUsers?: readonly unknown[];

  /** Hissés depuis `metadata` par les producteurs, pour être lisibles en direct. */
  readonly location?: unknown;
  readonly trackingLinks?: readonly unknown[];

  /**
   * Enveloppe E2EE. Le FAIT du chiffrement, c'est la présence du chiffré ; le
   * chiffré sans le MODE ne dit pas sous quel régime déchiffrer.
   */
  readonly isEncrypted?: boolean;
  readonly encryptionMode?: string;
  readonly encryptedContent?: string;
  readonly encryptionMetadata?: unknown;
  readonly encryptedPayload?: unknown;

  /** Servis par le seul transport REST/ZMQ (cf. `messageNewPayload.ts`). */
  readonly originalContent?: string;
  readonly metadata?: unknown;
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

  /**
   * Nature du participant quand cet objet décrit l'AUTEUR d'un message plutôt
   * qu'un compte (`Participant.type`). C'est le discriminant qui fait foi pour
   * « cette personne a-t-elle un compte ? » — `isAnonymous` et `isMeeshyer`
   * ci-dessous ne sont que des replis hérités. Lire par `isAnonymousSender`
   * (`utils/sender-identity.ts`), jamais champ par champ.
   */
  readonly type?: 'user' | 'anonymous' | 'bot';

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
