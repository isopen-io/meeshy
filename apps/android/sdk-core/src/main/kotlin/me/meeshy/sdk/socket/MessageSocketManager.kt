package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.MessageDeletedEvent
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

    val messageReceived: SharedFlow<ApiMessage> = _messageReceived.asSharedFlow()
    val messageEdited: SharedFlow<ApiMessage> = _messageEdited.asSharedFlow()
    val messageDeleted: SharedFlow<MessageDeletedEvent> = _messageDeleted.asSharedFlow()
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

    fun attach() {
        listen("message:new", _messageReceived)
        listen("message:edited", _messageEdited)
        listen("message:deleted", _messageDeleted)
        listen("message:pinned", _messagePinned)
        listen("message:unpinned", _messageUnpinned)
        listen("typing:start", _typingStarted)
        listen("typing:stop", _typingStopped)
        listen("reaction:added", _reactionAdded)
        listen("reaction:removed", _reactionRemoved)
        listen("conversation:unread-updated", _unreadUpdated)
        listen("message:translation", _translationReceived)
        listen("audio:transcription-ready", _transcriptionReady)
        listen("audio:translation-ready", _audioTranslationReady)
        listen("message:attachment-updated", _attachmentUpdated)
        listen("conversation:updated", _conversationUpdated)
        listen("conversation:deleted", _conversationDeleted)
        listen("conversation:restored", _conversationRestored)
        listen("conversation:closed", _conversationClosed)
        listen("user:status", _userStatus)
        listen("presence:snapshot", _presenceSnapshot)
        listen("conversation:participant-left", _participantLeft)
        listen("conversation:participant-banned", _participantBanned)
        listen("participant:role-updated", _participantRoleUpdated)
        listen("read-status:updated", _readStatusUpdated)
        listen("location:live-started", _liveLocationStarted)
        listen("location:live-updated", _liveLocationUpdated)
        listen("location:live-stopped", _liveLocationStopped)
        // SyncEngine — observer le `_seq` AVANT de livrer l'event, comme le web
        // (`notification-socketio.singleton.ts`) : un trou prouve que des
        // notifications ont été manquées. Le curseur suit le flux SERVEUR, donc il
        // avance même si le décodage échoue ensuite (un décodage raté est notre
        // bug, pas un trou d'émission) et même si aucun écran n'écoute.
        listen("notification:new", _notificationReceived) { raw ->
            syncSeqTracker.observe((raw.opt(SEQ_KEY) as? Number)?.toLong())
        }
    }

    /** Typing emission is fire-and-forget — an offline typing signal has no replay value. */
    fun emitTypingStart(conversationId: String) {
        socketManager.emit("typing:start", JSONObject().put("conversationId", conversationId))
    }

    fun emitTypingStop(conversationId: String) {
        socketManager.emit("typing:stop", JSONObject().put("conversationId", conversationId))
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
