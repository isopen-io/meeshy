package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.util.isoToEpochMillis

/**
 * Delivery and read receipts folded into the cached messages. One domain — the `read-status:
 * updated` socket summary; inbound server truth, never a local mutation, so no outbox.
 */
internal class MessageReceiptWriter(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
) {

    /**
     * Applies a `read-status:updated` receipt to the conversation's cached
     * messages. Mirrors iOS ConversationSyncEngine.applyReadReceipt: only own,
     * server-acked messages at or before the frontier move, and only upward —
     * the gateway summary is an authoritative recount, never a downgrade.
     */
    suspend fun applyReadReceipt(
        conversationId: String,
        ownSenderId: String,
        deliveredCount: Int,
        readCount: Int,
        frontierIso: String?,
    ) {
        val incomingRank = deliveryRank(deliveredCount, readCount, readByAllAt = null)
        if (incomingRank == RANK_SENT) return
        val frontier = frontierIso?.let(::isoToEpochMillis) ?: Long.MAX_VALUE
        database.withTransaction {
            val upgraded = messageDao.listForConversation(conversationId).mapNotNull { row ->
                if (row.sendState != null || row.createdAt > frontier) return@mapNotNull null
                val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                if (message.senderId != ownSenderId) return@mapNotNull null
                if (deliveryRank(message.deliveredCount, message.readCount, message.readByAllAt) >= incomingRank) {
                    return@mapNotNull null
                }
                row.copy(
                    payload = MeeshyApi.json.encodeToString(
                        message.copy(deliveredCount = deliveredCount, readCount = readCount),
                    ),
                )
            }
            if (upgraded.isNotEmpty()) messageDao.upsertAll(upgraded)
        }
    }

    private fun deliveryRank(deliveredCount: Int, readCount: Int, readByAllAt: String?): Int = when {
        readByAllAt != null || readCount > 0 -> RANK_READ
        deliveredCount > 0 -> RANK_DELIVERED
        else -> RANK_SENT
    }

    private companion object {
        const val RANK_SENT = 0
        const val RANK_DELIVERED = 1
        const val RANK_READ = 2
    }
}
