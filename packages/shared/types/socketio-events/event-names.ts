/**
 * Les NOMS du contrat Socket.IO — les deux cartes de constantes, les canaux
 * réservés, les aides de room, et la convention qui les gouverne.
 *
 * **Convention** : `entity:action-word` — deux-points et tirets, JAMAIS
 * d'underscore. Les rooms suivent `entity:${id}`. Les deux gardes qui la font
 * respecter lisent ces objets à l'EXÉCUTION, jamais le texte d'un fichier :
 * `__tests__/types/socketio-events.test.ts` (la forme de chaque nom déclaré) et
 * `__tests__/ci/socket-event-name-gate.test.ts` (les noms épelés en clair par
 * iOS et Android).
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

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
   * in sync — contrast with `CONVERSATION_CLOSED` above. Inverse:
   * `CONVERSATION_RESTORED` below.
   */
  CONVERSATION_DELETED: 'conversation:deleted',
  /**
   * Inverse of `CONVERSATION_DELETED` (`POST
   * /conversations/:id/restore-for-me`, #4344): the caller undid a per-user
   * "delete for me" — same shape, opposite direction, same audience. Broadcast
   * to the caller's **user room** (`ROOMS.user`) only, so their other devices
   * bring the conversation back too, exactly as `MESSAGE_RESTORED_FOR_ME`
   * mirrors `MESSAGE_HIDDEN_FOR_ME`.
   */
  CONVERSATION_RESTORED: 'conversation:restored',
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
  USER_PREFERENCES_COMMUNITY_REORDERED: 'user:preferences-community-reordered',

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

// ===== ÉVÉNEMENTS SOCKET.IO =====

// Types utilitaires pour les constantes
export type ServerEventNames = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
export type ClientEventNames = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];
