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
import timber.log.Timber
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
) {
    private val _messageReceived = buf<ApiMessage>()
    private val _messageEdited = buf<ApiMessage>()
    private val _messageDeleted = buf<MessageDeletedEvent>()
    private val _messageExpired = buf<MessageExpiredEvent>()
    private val _messagePinned = buf<MessagePinnedEvent>()
    private val _messageUnpinned = buf<MessageUnpinnedEvent>()
    private val _typingStarted = buf<TypingEvent>()
    private val _typingStopped = buf<TypingEvent>()
    private val _reactionAdded = buf<ReactionUpdateEvent>()
    private val _reactionRemoved = buf<ReactionUpdateEvent>()
    private val _unreadUpdated = buf<UnreadUpdateEvent>()
    private val _translationReceived = buf<TranslationEvent>()
    private val _transcriptionReady = buf<TranscriptionReadyEvent>()
    private val _audioTranslationReady = buf<AudioTranslationEvent>()
    private val _attachmentUpdated = buf<AttachmentUpdatedEvent>()
    private val _conversationUpdated = buf<ConversationUpdatedSocketEvent>()
    private val _conversationDeleted = buf<ConversationDeletedSocketEvent>()
    private val _conversationRestored = buf<ConversationRestoredSocketEvent>()
    private val _conversationClosed = buf<ConversationClosedSocketEvent>()
    private val _userStatus = buf<UserStatusEvent>()
    private val _presenceSnapshot = buf<PresenceSnapshotEvent>()
    private val _participantLeft = buf<ParticipantLeftEvent>()
    private val _participantBanned = buf<ParticipantBannedEvent>()
    private val _participantRoleUpdated = buf<ParticipantRoleUpdatedEvent>()
    private val _readStatusUpdated = buf<ReadStatusUpdatedEvent>()
    private val _liveLocationStarted = buf<LiveLocationStartedEvent>()
    private val _liveLocationUpdated = buf<LiveLocationUpdatedEvent>()
    private val _liveLocationStopped = buf<LiveLocationStoppedEvent>()
    private val _notificationReceived = buf<ApiNotification>()
    private val _notificationRead = buf<NotificationReadSocketEvent>()
    private val _notificationReadBulk = buf<NotificationReadBulkSocketEvent>()
    private val _notificationDeleted = buf<NotificationDeletedSocketEvent>()
    private val _notificationDeletedBulk = buf<NotificationDeletedBulkSocketEvent>()
    private val _notificationCounts = buf<NotificationCountsSocketEvent>()

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

    fun attach() {
        listen(SocketEventNames.MESSAGE_NEW, _messageReceived)
        listen(SocketEventNames.MESSAGE_EDITED, _messageEdited)
        listen(SocketEventNames.MESSAGE_DELETED, _messageDeleted)
        listen(SocketEventNames.MESSAGE_EXPIRED, _messageExpired)
        listen(SocketEventNames.MESSAGE_PINNED, _messagePinned)
        listen(SocketEventNames.MESSAGE_UNPINNED, _messageUnpinned)
        listen(SocketEventNames.TYPING_START, _typingStarted)
        listen(SocketEventNames.TYPING_STOP, _typingStopped)
        listen(SocketEventNames.REACTION_ADDED, _reactionAdded)
        listen(SocketEventNames.REACTION_REMOVED, _reactionRemoved)
        listen(SocketEventNames.CONVERSATION_UNREAD_UPDATED, _unreadUpdated)
        listen(SocketEventNames.MESSAGE_TRANSLATION, _translationReceived)
        listen(SocketEventNames.AUDIO_TRANSCRIPTION_READY, _transcriptionReady)
        listen(SocketEventNames.AUDIO_TRANSLATION_READY, _audioTranslationReady)
        listen(SocketEventNames.MESSAGE_ATTACHMENT_UPDATED, _attachmentUpdated)
        listen(SocketEventNames.CONVERSATION_UPDATED, _conversationUpdated)
        listen(SocketEventNames.CONVERSATION_DELETED, _conversationDeleted)
        listen(SocketEventNames.CONVERSATION_RESTORED, _conversationRestored)
        listen(SocketEventNames.CONVERSATION_CLOSED, _conversationClosed)
        listen(SocketEventNames.USER_STATUS, _userStatus)
        listen(SocketEventNames.PRESENCE_SNAPSHOT, _presenceSnapshot)
        listen(SocketEventNames.CONVERSATION_PARTICIPANT_LEFT, _participantLeft)
        listen(SocketEventNames.CONVERSATION_PARTICIPANT_BANNED, _participantBanned)
        listen(SocketEventNames.PARTICIPANT_ROLE_UPDATED, _participantRoleUpdated)
        listen(SocketEventNames.READ_STATUS_UPDATED, _readStatusUpdated)
        listen(SocketEventNames.LOCATION_LIVE_STARTED, _liveLocationStarted)
        listen(SocketEventNames.LOCATION_LIVE_UPDATED, _liveLocationUpdated)
        listen(SocketEventNames.LOCATION_LIVE_STOPPED, _liveLocationStopped)
        // SyncEngine — observer le `_seq` AVANT de livrer l'event, comme le web
        // (`notification-socketio.singleton.ts`) : un trou prouve que des
        // notifications ont été manquées. Le curseur suit le flux SERVEUR, donc il
        // avance même si le décodage échoue ensuite (un décodage raté est notre
        // bug, pas un trou d'émission) et même si aucun écran n'écoute.
        listen(SocketEventNames.NOTIFICATION_NEW, _notificationReceived) { raw ->
            syncSeqTracker.observe((raw.opt(SEQ_KEY) as? Number)?.toLong())
        }
        // Plain emissions (no `_seq`) — the gateway deliberately does not stamp them, so unlike
        // SocketEventNames.NOTIFICATION_NEW above there is no cursor to observe here.
        listen(SocketEventNames.NOTIFICATION_READ, _notificationRead)
        listen(SocketEventNames.NOTIFICATION_READ_BULK, _notificationReadBulk)
        listen(SocketEventNames.NOTIFICATION_DELETED, _notificationDeleted)
        listen(SocketEventNames.NOTIFICATION_DELETED_BULK, _notificationDeletedBulk)
        listen(SocketEventNames.NOTIFICATION_COUNTS, _notificationCounts)
    }

    /** Typing emission is fire-and-forget — an offline typing signal has no replay value. */
    fun emitTypingStart(conversationId: String) {
        socketManager.emit(SocketEventNames.TYPING_START, JSONObject().put("conversationId", conversationId))
    }

    fun emitTypingStop(conversationId: String) {
        socketManager.emit(SocketEventNames.TYPING_STOP, JSONObject().put("conversationId", conversationId))
    }

    /**
     * [onRaw] sees the untouched payload before it is decoded — the seam for transport-level
     * fields the durable model deliberately does not carry (`_seq`). It runs inside the same
     * `runCatching`, so a throw there is logged and drops the event exactly like a decode
     * failure rather than escaping into the Socket.IO callback thread.
     */
    private inline fun <reified T> listen(
        event: String,
        flow: MutableSharedFlow<T>,
        crossinline onRaw: (JSONObject) -> Unit = {},
    ) {
        socketManager.on(event) { args ->
            runCatching {
                val raw = (args.firstOrNull() as? JSONObject) ?: return@on
                onRaw(raw)
                flow.tryEmit(json.decodeFromString<T>(raw.toString()))
            }.onFailure { Timber.e(it, "Socket decode error [$event]: ${T::class.simpleName}") }
        }
    }

    private fun <T> buf(): MutableSharedFlow<T> =
        MutableSharedFlow(replay = 0, extraBufferCapacity = 64)

    private companion object {
        /** Transport-level per-user cursor stamped by the gateway's `emitWithSeq`. */
        const val SEQ_KEY = "_seq"
    }
}
