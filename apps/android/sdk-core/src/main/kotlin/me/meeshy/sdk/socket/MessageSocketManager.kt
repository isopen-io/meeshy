package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.notification.NotificationCountsSocketEvent
import me.meeshy.sdk.notification.NotificationDeletedBulkSocketEvent
import me.meeshy.sdk.notification.NotificationDeletedSocketEvent
import me.meeshy.sdk.notification.NotificationReadBulkSocketEvent
import me.meeshy.sdk.notification.NotificationReadSocketEvent
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.MessageDeletedEvent
import me.meeshy.sdk.model.MessageExpiredEvent
import me.meeshy.sdk.model.MessagePinnedEvent
import me.meeshy.sdk.model.MessageUnpinnedEvent
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.AttachmentUpdatedEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.LiveLocationStartedEvent
import me.meeshy.sdk.model.LiveLocationUpdatedEvent
import me.meeshy.sdk.model.LiveLocationStoppedEvent
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Subscribes to messaging-domain Socket.IO events (ARCHITECTURE.md §3).
 * Mirrors iOS MessageSocketManager — event naming: entity:action-word (hyphens).
 *
 * Call [attach] once after socket connection is established.
 * All flows are hot SharedFlows; late subscribers miss prior events (no replay).
 */
@Singleton
class MessageSocketManager @Inject constructor(
    private val socketManager: SocketManager,
    private val json: Json,
    private val syncSeqTracker: SyncSeqTracker,
    private val router: SocketEventRouter,
) {
    internal constructor(
        socketManager: SocketManager,
        json: Json,
        syncSeqTracker: SyncSeqTracker,
    ) : this(
        socketManager, json, syncSeqTracker,
        SocketEventRouter(SocketEventRegistrar { event, callback -> socketManager.on(event, callback) }, Dispatchers.Default),
    )

    private val _messageReceived = SocketInboundRoute.subject<ApiMessage>()
    private val _messageEdited = SocketInboundRoute.subject<ApiMessage>()
    private val _messageDeleted = SocketInboundRoute.subject<MessageDeletedEvent>()
    private val _messageExpired = SocketInboundRoute.subject<MessageExpiredEvent>()
    private val _messagePinned = SocketInboundRoute.subject<MessagePinnedEvent>()
    private val _messageUnpinned = SocketInboundRoute.subject<MessageUnpinnedEvent>()
    private val _typingStarted = SocketInboundRoute.subject<TypingEvent>()
    private val _typingStopped = SocketInboundRoute.subject<TypingEvent>()
    private val _reactionAdded = SocketInboundRoute.subject<ReactionUpdateEvent>()
    private val _reactionRemoved = SocketInboundRoute.subject<ReactionUpdateEvent>()
    private val _unreadUpdated = SocketInboundRoute.subject<UnreadUpdateEvent>()
    private val _translationReceived = SocketInboundRoute.subject<TranslationEvent>()
    private val _transcriptionReady = SocketInboundRoute.subject<TranscriptionReadyEvent>()
    private val _audioTranslationReady = SocketInboundRoute.subject<AudioTranslationEvent>()
    private val _attachmentUpdated = SocketInboundRoute.subject<AttachmentUpdatedEvent>()
    private val _conversationUpdated = SocketInboundRoute.subject<ConversationUpdatedSocketEvent>()
    private val _conversationDeleted = SocketInboundRoute.subject<ConversationDeletedSocketEvent>()
    private val _conversationRestored = SocketInboundRoute.subject<ConversationRestoredSocketEvent>()
    private val _conversationClosed = SocketInboundRoute.subject<ConversationClosedSocketEvent>()
    private val _userStatus = SocketInboundRoute.subject<UserStatusEvent>()
    private val _presenceSnapshot = SocketInboundRoute.subject<PresenceSnapshotEvent>()
    private val _participantLeft = SocketInboundRoute.subject<ParticipantLeftEvent>()
    private val _participantBanned = SocketInboundRoute.subject<ParticipantBannedEvent>()
    private val _participantRoleUpdated = SocketInboundRoute.subject<ParticipantRoleUpdatedEvent>()
    private val _readStatusUpdated = SocketInboundRoute.subject<ReadStatusUpdatedEvent>()
    private val _liveLocationStarted = SocketInboundRoute.subject<LiveLocationStartedEvent>()
    private val _liveLocationUpdated = SocketInboundRoute.subject<LiveLocationUpdatedEvent>()
    private val _liveLocationStopped = SocketInboundRoute.subject<LiveLocationStoppedEvent>()
    private val _notificationReceived = SocketInboundRoute.subject<ApiNotification>()
    private val _notificationRead = SocketInboundRoute.subject<NotificationReadSocketEvent>()
    private val _notificationReadBulk = SocketInboundRoute.subject<NotificationReadBulkSocketEvent>()
    private val _notificationDeleted = SocketInboundRoute.subject<NotificationDeletedSocketEvent>()
    private val _notificationDeletedBulk = SocketInboundRoute.subject<NotificationDeletedBulkSocketEvent>()
    private val _notificationCounts = SocketInboundRoute.subject<NotificationCountsSocketEvent>()
    private val _profileDecorUpdated = SocketInboundRoute.subject<ProfileDecorUpdatedEvent>()

    val messageReceived: SharedFlow<ApiMessage> = _messageReceived.asSharedFlow()
    val messageEdited: SharedFlow<ApiMessage> = _messageEdited.asSharedFlow()
    val messageDeleted: SharedFlow<MessageDeletedEvent> = _messageDeleted.asSharedFlow()
    /**
     * `message:expired` — server-initiated twin of `messageDeleted` for a
     * self-destructing message burned by `ExpiredMessagesCleanupService`
     * rather than a user request. Same local effect (drop the bubble),
     * distinct flow so a consumer that needs to tell the two apart can.
     */
    val messageExpired: SharedFlow<MessageExpiredEvent> = _messageExpired.asSharedFlow()
    val messagePinned: SharedFlow<MessagePinnedEvent> = _messagePinned.asSharedFlow()
    val messageUnpinned: SharedFlow<MessageUnpinnedEvent> = _messageUnpinned.asSharedFlow()
    val typingStarted: SharedFlow<TypingEvent> = _typingStarted.asSharedFlow()
    val typingStopped: SharedFlow<TypingEvent> = _typingStopped.asSharedFlow()
    val reactionAdded: SharedFlow<ReactionUpdateEvent> = _reactionAdded.asSharedFlow()
    val reactionRemoved: SharedFlow<ReactionUpdateEvent> = _reactionRemoved.asSharedFlow()
    val unreadUpdated: SharedFlow<UnreadUpdateEvent> = _unreadUpdated.asSharedFlow()
    /**
     * La traduction d'un message. UN seul canal la porte, `message:translation`.
     *
     * Il y en avait deux : `message:translated` alimentait un flow
     * `translationCompleted` jumeau, dont le collecteur appliquait exactement
     * le même merge. Ce nom-là n'a jamais été émis par la passerelle — le
     * contrat le déclarait, personne ne le produisait (cycle 77).
     */
    val translationReceived: SharedFlow<TranslationEvent> = _translationReceived.asSharedFlow()
    val transcriptionReady: SharedFlow<TranscriptionReadyEvent> = _transcriptionReady.asSharedFlow()
    val audioTranslationReady: SharedFlow<AudioTranslationEvent> = _audioTranslationReady.asSharedFlow()
    val attachmentUpdated: SharedFlow<AttachmentUpdatedEvent> = _attachmentUpdated.asSharedFlow()
    val conversationUpdated: SharedFlow<ConversationUpdatedSocketEvent> = _conversationUpdated.asSharedFlow()
    val conversationDeleted: SharedFlow<ConversationDeletedSocketEvent> = _conversationDeleted.asSharedFlow()
    val conversationRestored: SharedFlow<ConversationRestoredSocketEvent> = _conversationRestored.asSharedFlow()
    val conversationClosed: SharedFlow<ConversationClosedSocketEvent> = _conversationClosed.asSharedFlow()
    val userStatus: SharedFlow<UserStatusEvent> = _userStatus.asSharedFlow()
    val presenceSnapshot: SharedFlow<PresenceSnapshotEvent> = _presenceSnapshot.asSharedFlow()
    val participantLeft: SharedFlow<ParticipantLeftEvent> = _participantLeft.asSharedFlow()
    val participantBanned: SharedFlow<ParticipantBannedEvent> = _participantBanned.asSharedFlow()
    val participantRoleUpdated: SharedFlow<ParticipantRoleUpdatedEvent> = _participantRoleUpdated.asSharedFlow()
    val readStatusUpdated: SharedFlow<ReadStatusUpdatedEvent> = _readStatusUpdated.asSharedFlow()
    val liveLocationStarted: SharedFlow<LiveLocationStartedEvent> = _liveLocationStarted.asSharedFlow()
    val liveLocationUpdated: SharedFlow<LiveLocationUpdatedEvent> = _liveLocationUpdated.asSharedFlow()
    val liveLocationStopped: SharedFlow<LiveLocationStoppedEvent> = _liveLocationStopped.asSharedFlow()

    /**
     * Real-time notifications (ARCHITECTURE.md §18) — the gateway's socket payload is the
     * durable [ApiNotification] shape plus a couple of toast-only fields (`title`/`subtitle`)
     * that [Json.ignoreUnknownKeys] silently drops, so decoding straight into [ApiNotification]
     * is safe and needs no separate wire type. Mirrors iOS
     * `MessageSocketManager.notificationReceived`.
     *
     * `_seq` is dropped by the decoder too, but it is NOT ignored: it is read off the RAW
     * payload first and handed to [SyncSeqTracker] — see [attach].
     */
    val notificationReceived: SharedFlow<ApiNotification> = _notificationReceived.asSharedFlow()

    /**
     * Notification sync family (issue notif-sync) — the OTHER four events a notification's
     * lifecycle emits besides its arrival, all plain-emitted by the gateway (no `_seq`,
     * `NotificationService.ts`'s `announceReadBulk`/`announceDeletedBulk`/`emitCountsUpdate`
     * doc-comments: estampiller ferait avancer un curseur sans lecteur). Mirrors iOS
     * `MessageSocketManager` / web `notification-socketio.singleton.ts`'s
     * `onNotificationRead`/`onNotificationReadBulk`/`onNotificationDeleted`/
     * `onNotificationDeletedBulk`/`onCounts`.
     */
    val notificationRead: SharedFlow<NotificationReadSocketEvent> = _notificationRead.asSharedFlow()
    val notificationReadBulk: SharedFlow<NotificationReadBulkSocketEvent> = _notificationReadBulk.asSharedFlow()
    val notificationDeleted: SharedFlow<NotificationDeletedSocketEvent> = _notificationDeleted.asSharedFlow()
    val notificationDeletedBulk: SharedFlow<NotificationDeletedBulkSocketEvent> = _notificationDeletedBulk.asSharedFlow()
    val notificationCounts: SharedFlow<NotificationCountsSocketEvent> = _notificationCounts.asSharedFlow()

    /** `profile:decor-updated` : le décor d'un compte a changé ; le filtrage par compte est celui du consommateur. */
    val profileDecorUpdated: SharedFlow<ProfileDecorUpdatedEvent> = _profileDecorUpdated.asSharedFlow()

    /**
     * Déclare les routes de la famille messagerie. Gelé (socket-routage-evenements-ordre-arrivee) :
     * une nouvelle famille d'événements ajoute sa propre classe et enregistre ses routes par
     * [SocketEventRouter.install], elle n'ajoute rien ici.
     */
    fun attach() {
        router.install(routes())
    }

    private fun routes(): List<SocketInboundRoute> = buildList {
        route(SocketEventNames.MESSAGE_NEW, _messageReceived)
        route(SocketEventNames.MESSAGE_EDITED, _messageEdited)
        route(SocketEventNames.MESSAGE_DELETED, _messageDeleted)
        route(SocketEventNames.MESSAGE_EXPIRED, _messageExpired)
        route(SocketEventNames.MESSAGE_PINNED, _messagePinned)
        route(SocketEventNames.MESSAGE_UNPINNED, _messageUnpinned)
        route(SocketEventNames.TYPING_START, _typingStarted)
        route(SocketEventNames.TYPING_STOP, _typingStopped)
        route(SocketEventNames.REACTION_ADDED, _reactionAdded)
        route(SocketEventNames.REACTION_REMOVED, _reactionRemoved)
        route(SocketEventNames.CONVERSATION_UNREAD_UPDATED, _unreadUpdated)
        route(SocketEventNames.MESSAGE_TRANSLATION, _translationReceived)
        route(SocketEventNames.AUDIO_TRANSCRIPTION_READY, _transcriptionReady)
        route(SocketEventNames.AUDIO_TRANSLATION_READY, _audioTranslationReady)
        route(SocketEventNames.MESSAGE_ATTACHMENT_UPDATED, _attachmentUpdated)
        route(SocketEventNames.CONVERSATION_UPDATED, _conversationUpdated)
        route(SocketEventNames.CONVERSATION_DELETED, _conversationDeleted)
        route(SocketEventNames.CONVERSATION_RESTORED, _conversationRestored)
        route(SocketEventNames.CONVERSATION_CLOSED, _conversationClosed)
        route(SocketEventNames.USER_STATUS, _userStatus)
        route(SocketEventNames.PRESENCE_SNAPSHOT, _presenceSnapshot)
        route(SocketEventNames.CONVERSATION_PARTICIPANT_LEFT, _participantLeft)
        route(SocketEventNames.CONVERSATION_PARTICIPANT_BANNED, _participantBanned)
        route(SocketEventNames.PARTICIPANT_ROLE_UPDATED, _participantRoleUpdated)
        route(SocketEventNames.READ_STATUS_UPDATED, _readStatusUpdated)
        route(SocketEventNames.LOCATION_LIVE_STARTED, _liveLocationStarted)
        route(SocketEventNames.LOCATION_LIVE_UPDATED, _liveLocationUpdated)
        route(SocketEventNames.LOCATION_LIVE_STOPPED, _liveLocationStopped)
        // SyncEngine — observer le `_seq` AVANT de livrer l'event, comme le web
        // (`notification-socketio.singleton.ts`) : un trou prouve que des
        // notifications ont été manquées. Le curseur suit le flux SERVEUR, donc il
        // avance même si le décodage échoue ensuite (un décodage raté est notre
        // bug, pas un trou d'émission) et même si aucun écran n'écoute.
        route(SocketEventNames.NOTIFICATION_NEW, _notificationReceived) { raw ->
            syncSeqTracker.observe((raw.opt(SEQ_KEY) as? Number)?.toLong())
        }
        // Plain emissions (no `_seq`) — the gateway deliberately does not stamp them, so unlike
        // SocketEventNames.NOTIFICATION_NEW above there is no cursor to observe here.
        route(SocketEventNames.NOTIFICATION_READ, _notificationRead)
        route(SocketEventNames.NOTIFICATION_READ_BULK, _notificationReadBulk)
        route(SocketEventNames.NOTIFICATION_DELETED, _notificationDeleted)
        route(SocketEventNames.NOTIFICATION_DELETED_BULK, _notificationDeletedBulk)
        route(SocketEventNames.NOTIFICATION_COUNTS, _notificationCounts)
        route(SocketEventNames.PROFILE_DECOR_UPDATED, _profileDecorUpdated)
    }

    /** Typing emission is fire-and-forget — an offline typing signal has no replay value. */
    fun emitTypingStart(conversationId: String) {
        socketManager.emit(SocketEventNames.TYPING_START, JSONObject().put("conversationId", conversationId))
    }

    fun emitTypingStop(conversationId: String) {
        socketManager.emit(SocketEventNames.TYPING_STOP, JSONObject().put("conversationId", conversationId))
    }

    private inline fun <reified T> MutableList<SocketInboundRoute>.route(
        event: String,
        subject: MutableSharedFlow<T>,
        noinline arrival: ((JSONObject) -> Unit)? = null,
    ) {
        add(SocketInboundRoute.decoding(event, json, subject, arrival))
    }

    private companion object {
        /** Transport-level per-user cursor stamped by the gateway's `emitWithSeq`. */
        const val SEQ_KEY = "_seq"
    }
}
