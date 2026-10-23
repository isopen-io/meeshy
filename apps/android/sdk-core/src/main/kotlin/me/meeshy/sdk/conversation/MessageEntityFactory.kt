package me.meeshy.sdk.conversation

import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageEncryptionGuard
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.util.isoToEpochMillis

/** Un message en clair a été présenté à un fil chiffré : il n'est jamais écrit (fail-closed). */
internal class PlaintextInEncryptedThreadException(messageId: String) :
    IllegalStateException("Plaintext message $messageId refused in an end-to-end encrypted thread")

/**
 * The single place a Room [MessageEntity] row is built from an [ApiMessage] — the encode half
 * whose decode half is [toLocalMessage]. The recent-window persist, the gap-backfill persist,
 * the history page, the optimistic send and the send ACK used to each spell the five columns
 * out by hand; one path means a column added to the row (or a change of the payload encoding)
 * lands everywhere at once.
 *
 * The queryable columns (server id, sender, type, deletion, deadline, pin, encryption, counters,
 * search text) are derived from the message here and nowhere else: [refreshed] is also what the
 * in-place updaters and the backfill call, so the payload and its columns never disagree.
 */
internal object MessageEntityFactory {

    /**
     * A server-truth row: `payload` is the whole serialized message, `createdAt` its parsed
     * instant (epoch 0 when absent), `sendState` null. [conversationId] defaults to the
     * message's own; a conversation-scoped sync passes the conversation it is filing the page
     * under. A [threadEncrypted] thread refuses a plaintext message ([MessageEncryptionGuard]).
     */
    fun cached(
        message: ApiMessage,
        cachedAt: Long,
        conversationId: String = message.conversationId,
        threadEncrypted: Boolean = false,
    ): MessageEntity {
        if (MessageEncryptionGuard.verdict(threadEncrypted, message) is MessageEncryptionGuard.Verdict.Refused) {
            throw PlaintextInEncryptedThreadException(message.id)
        }
        return refreshed(
            row = MessageEntity(
                id = message.id,
                conversationId = conversationId,
                seq = null,
                payload = "",
                createdAt = isoToEpochMillis(message.createdAt),
                cachedAt = cachedAt,
                serverId = message.id,
                viewOnceOpenedAt = cachedAt.takeIf { message.isViewOnceOpenedByMe },
            ),
            message = message,
        )
    }

    /** An optimistic local row: the [cached] row tagged with its [LocalSendState], no server id yet. */
    fun local(
        message: ApiMessage,
        cachedAt: Long,
        state: LocalSendState,
        threadEncrypted: Boolean = false,
    ): MessageEntity = cached(message, cachedAt, threadEncrypted = threadEncrypted)
        .copy(sendState = state.name, serverId = null)

    /** [row] re-derived from [message]: payload and queryable columns replaced, local columns kept. */
    fun refreshed(row: MessageEntity, message: ApiMessage): MessageEntity = row.copy(
        payload = MeeshyApi.json.encodeToString(message),
        senderId = message.senderId ?: message.sender?.resolvedUserId,
        messageType = message.messageType,
        deletedAt = isoToEpochMillisOrNull(message.deletedAt),
        expiresAt = isoToEpochMillisOrNull(message.expiresAt),
        pinnedAt = isoToEpochMillisOrNull(message.pinnedAt),
        isEncrypted = message.isEncrypted == true,
        encryptionMode = message.encryptionMode,
        encryptedPayload = message.encryptedContent,
        contentText = MessageEncryptionGuard.searchableText(message),
        deliveredCount = message.deliveredCount,
        readCount = message.readCount,
        recipientCount = message.recipientCount ?: 0,
        columnsBackfilled = true,
    )
}
