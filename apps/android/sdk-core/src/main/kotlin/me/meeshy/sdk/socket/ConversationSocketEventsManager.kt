package me.meeshy.sdk.socket

import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.AttachmentReadyEvent
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.AudioTranslationFailedEvent
import me.meeshy.sdk.model.AudioTranslationStage
import me.meeshy.sdk.model.ConversationJoinErrorEvent
import me.meeshy.sdk.model.ConversationParticipationPayload
import me.meeshy.sdk.model.ConversationRoomAck
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.ConversationStatsEvent
import me.meeshy.sdk.model.MessageArrived
import me.meeshy.sdk.model.MessageCitedPostWithdrawnEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageDeletedEvent
import me.meeshy.sdk.model.MessageExpiredEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessagePinnedEvent
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.model.MessageUnpinnedEvent
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.ParticipantRightsUpdatedEvent
import me.meeshy.sdk.model.PendingMessagesDeliveredEvent
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.model.TranslationFailedEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import timber.log.Timber

/** Ce dont la famille a besoin pour émettre : un événement, sa charge et l'accusé de la passerelle. */
fun interface SocketAckEmitter {
    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit)
}

/**
 * La famille d'événements du FIL d'une conversation, sur UN flux typé [events] (miroir des sujets
 * que `ConversationSocketHandler` consomme, iOS).
 *
 * [MessageSocketManager] est gelé (socket-routage-evenements-ordre-arrivee) : cette famille déclare
 * ses propres routes et les installe sur le MÊME [SocketEventRouter], donc la même voie série —
 * l'ordre relatif de `message:new` et de `message:countdown-started` est celui de l'arrivée. Les
 * événements déjà routés ailleurs (`message:new`, `deleted`, `expired`, `pinned`, `unpinned`) sont
 * réécoutés ici sous une forme LÉGÈRE ([MessageArrived], [MessageRemoved], [MessagePinChanged]) : ils
 * ne servent qu'à ordonner le fil, leurs flux d'origine restent la source de leurs autres lecteurs.
 *
 * Émet aussi `attachment:reaction-add` / `-remove` (réaction d'une pièce) et rend le verdict de
 * l'accusé, pour que l'appelant confirme ou défasse son geste optimiste.
 */
@Singleton
class ConversationSocketEventsManager internal constructor(
    private val router: SocketEventRouter,
    private val json: Json,
    private val emitter: SocketAckEmitter,
) : RealtimeBinding {

    @Inject
    constructor(
        socketManager: SocketManager,
        json: Json,
        router: SocketEventRouter,
    ) : this(router, json, SocketAckEmitter { event, data, ack -> socketManager.emit(event, data, ack) })

    private val installed = AtomicBoolean(false)
    private val _events = SocketInboundRoute.subject<ConversationSocketEvent>()

    /** Tous les événements de la famille, dans l'ordre d'arrivée, sans replay. */
    val events: SharedFlow<ConversationSocketEvent> = _events.asSharedFlow()

    /** Installe les routes UNE fois par session : le transport les garde d'une reconnexion à l'autre. */
    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    /** La déconnexion OUBLIE le registre du transport : la session suivante réinstalle les routes. */
    override fun detach() {
        installed.set(false)
    }

    /**
     * Émet la réaction de CE lecteur sur une pièce et rend `true` quand la passerelle l'accepte ;
     * `false` sur un refus, une socket absente ou sans réponse dans [ACK_TIMEOUT_MS].
     */
    suspend fun emitAttachmentReaction(messageId: String, attachmentId: String, emoji: String, adding: Boolean): Boolean {
        val event = if (adding) SocketEventNames.ATTACHMENT_REACTION_ADD else SocketEventNames.ATTACHMENT_REACTION_REMOVE
        val payload = JSONObject().put("attachmentId", attachmentId).put("messageId", messageId).put("emoji", emoji)
        return withTimeoutOrNull(ACK_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                emitter.emit(event, payload) { args -> if (continuation.isActive) continuation.resume(accepted(args)) }
            }
        } ?: false
    }

    private fun routes(): List<SocketInboundRoute> = threadTwins() + messageFamily() + mediaFamily() + roomFamily()

    private fun threadTwins(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.raw(SocketEventNames.MESSAGE_NEW) { raw -> arrived(raw)?.let { publish(it) } },
        route<MessageDeletedEvent>(SocketEventNames.MESSAGE_DELETED) {
            MessageRemoved(it.messageId, it.conversationId, it.deletedAt, expired = false)
        },
        route<MessageExpiredEvent>(SocketEventNames.MESSAGE_EXPIRED) {
            MessageRemoved(it.messageId, it.conversationId, deletedAt = null, expired = true)
        },
        route<MessagePinnedEvent>(SocketEventNames.MESSAGE_PINNED) {
            MessagePinChanged(it.messageId, it.conversationId, pinned = true, pinnedAt = it.pinnedAt, pinnedBy = it.pinnedBy)
        },
        route<MessageUnpinnedEvent>(SocketEventNames.MESSAGE_UNPINNED) {
            MessagePinChanged(it.messageId, it.conversationId, pinned = false)
        },
    )

    private fun messageFamily(): List<SocketInboundRoute> = listOf(
        route<MessageCountdownStartedEvent>(SocketEventNames.MESSAGE_COUNTDOWN_STARTED) { it },
        route<MessageHiddenForMeEvent>(SocketEventNames.MESSAGE_HIDDEN_FOR_ME) { it },
        route<MessageRestoredForMeEvent>(SocketEventNames.MESSAGE_RESTORED_FOR_ME) { it },
        route<MessageConsumedEvent>(SocketEventNames.MESSAGE_CONSUMED) { it },
        route<MessageViewOncePurgedEvent>(SocketEventNames.MESSAGE_VIEW_ONCE_PURGED) { it },
        route<MessageCitedPostWithdrawnEvent>(SocketEventNames.MESSAGE_CITED_POST_WITHDRAWN) { it },
        route<PendingMessagesDeliveredEvent>(SocketEventNames.MESSAGE_PENDING_DELIVERED) { it },
        route<TranslationFailedEvent>(SocketEventNames.TRANSLATION_FAILED) { it },
    )

    private fun mediaFamily(): List<SocketInboundRoute> = listOf(
        route<AttachmentReactionUpdateEvent>(SocketEventNames.ATTACHMENT_REACTION_ADDED) { it },
        route<AttachmentReactionUpdateEvent>(SocketEventNames.ATTACHMENT_REACTION_REMOVED) { it },
        route<AttachmentStatusUpdatedEvent>(SocketEventNames.ATTACHMENT_STATUS_UPDATED) { it },
        route<AttachmentReadyEvent>(SocketEventNames.ATTACHMENT_READY) { it },
        route<AudioTranslationEvent>(SocketEventNames.AUDIO_TRANSLATIONS_PROGRESSIVE) {
            AudioTranslationStage(it, completed = false)
        },
        route<AudioTranslationEvent>(SocketEventNames.AUDIO_TRANSLATIONS_COMPLETED) {
            AudioTranslationStage(it, completed = true)
        },
        route<AudioTranslationFailedEvent>(SocketEventNames.AUDIO_TRANSLATION_FAILED) { it },
        route<TranscriptionFailedEvent>(SocketEventNames.AUDIO_TRANSCRIPTION_FAILED) { it },
    )

    private fun roomFamily(): List<SocketInboundRoute> = listOf(
        route<ConversationParticipationPayload>(SocketEventNames.CONVERSATION_JOINED) {
            ConversationRoomAck(it.conversationId, it.userId, joined = true)
        },
        route<ConversationParticipationPayload>(SocketEventNames.CONVERSATION_LEFT) {
            ConversationRoomAck(it.conversationId, it.userId, joined = false)
        },
        route<ConversationJoinErrorEvent>(SocketEventNames.CONVERSATION_JOIN_ERROR) { it },
        route<ConversationStatsEvent>(SocketEventNames.CONVERSATION_STATS) { it },
        route<ParticipantRightsUpdatedEvent>(SocketEventNames.PARTICIPANT_RIGHTS_UPDATED) { it },
    )

    private inline fun <reified T> route(
        event: String,
        noinline map: (T) -> ConversationSocketEvent,
    ): SocketInboundRoute = decode(event, serializer<T>(), map)

    private fun <T> decode(
        event: String,
        serializer: KSerializer<T>,
        map: (T) -> ConversationSocketEvent,
    ): SocketInboundRoute = SocketInboundRoute.decoding(event, json, serializer) { payload -> publish(map(payload)) }

    private fun publish(event: ConversationSocketEvent) {
        if (!_events.tryEmit(event)) Timber.e("Conversation events: evenement refuse par le sujet")
    }

    private fun arrived(raw: JSONObject): MessageArrived? {
        val id = raw.text("id") ?: raw.text("_id") ?: return null
        val conversationId = raw.text("conversationId") ?: return null
        return MessageArrived(id, conversationId, raw.text("clientMessageId"))
    }

    private fun JSONObject.text(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    private fun accepted(args: Array<Any>): Boolean {
        val response = args.firstOrNull() as? JSONObject ?: return args.isEmpty()
        return response.optBoolean("success", false)
    }

    internal companion object {
        /** Au-delà, le geste optimiste est défait : la passerelle n'a pas confirmé. */
        const val ACK_TIMEOUT_MS = 5_000L
    }
}
