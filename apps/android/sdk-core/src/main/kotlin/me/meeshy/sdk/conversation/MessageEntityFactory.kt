package me.meeshy.sdk.conversation

import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.util.isoToEpochMillis

/**
 * The single place a Room [MessageEntity] row is built from an [ApiMessage] — the encode half
 * whose decode half is [toLocalMessage]. The recent-window persist, the gap-backfill persist,
 * the history page, the optimistic send and the send ACK used to each spell the five columns
 * out by hand; one path means a column added to the row (or a change of the payload encoding)
 * lands everywhere at once.
 */
internal object MessageEntityFactory {

    /**
     * A server-truth row: `payload` is the whole serialized message, `createdAt` its parsed
     * instant (epoch 0 when absent), `sendState` null. [conversationId] defaults to the
     * message's own; a conversation-scoped sync passes the conversation it is filing the page
     * under.
     */
    fun cached(
        message: ApiMessage,
        cachedAt: Long,
        conversationId: String = message.conversationId,
    ): MessageEntity = MessageEntity(
        id = message.id,
        conversationId = conversationId,
        seq = null,
        payload = MeeshyApi.json.encodeToString(message),
        createdAt = isoToEpochMillis(message.createdAt),
        cachedAt = cachedAt,
    )

    /** An optimistic local row: the [cached] row tagged with its [LocalSendState]. */
    fun local(message: ApiMessage, cachedAt: Long, state: LocalSendState): MessageEntity =
        cached(message, cachedAt).copy(sendState = state.name)
}
