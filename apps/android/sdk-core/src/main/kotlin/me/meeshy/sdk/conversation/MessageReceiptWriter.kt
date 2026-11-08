package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ReadStatusSummary
import me.meeshy.sdk.model.ReceiptMergePolicy
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import me.meeshy.sdk.util.isoToEpochMillis

/**
 * Delivery and read receipts folded into the cached messages. One domain — the `read-status:
 * updated` socket summary; inbound server truth, never a local mutation, so no outbox.
 */
internal class MessageReceiptWriter(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val fence: AccountFence?,
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
        val ticket = fence?.currentTicket()
        fence.commitOrWrite(ticket) { database.withTransaction {
            val upgraded = messageDao.listForConversation(conversationId).mapNotNull { row ->
                if (row.sendState != null || row.createdAt > frontier) return@mapNotNull null
                val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                if (message.senderId != ownSenderId) return@mapNotNull null
                if (deliveryRank(message.deliveredCount, message.readCount, message.readByAllAt) >= incomingRank) {
                    return@mapNotNull null
                }
                MessageEntityFactory.refreshed(
                    row,
                    message.copy(deliveredCount = deliveredCount, readCount = readCount),
                ).bumped()
            }
            if (upgraded.isNotEmpty()) messageDao.upsertAll(upgraded)
        } }
    }

    /**
     * Applies ONE `read-status:updated` summary to the single message it describes (iOS
     * `applyReadStatusSummarySync`, #7433). Named: that message, by server or local id. Unnamed
     * (gateway older than #7433): the newest ACKNOWLEDGED message of the thread, never an in-flight
     * send. Only a row of [currentUserId] moves, only to strictly better counters, and the
     * denominator is adopted. Returns `true` only when the row actually changed, so the caller
     * publishes a refresh on a real change alone.
     */
    suspend fun applyReadStatusSummary(
        conversationId: String,
        summary: ReadStatusSummary,
        currentUserId: String,
    ): Boolean {
        if (!ReceiptMergePolicy.describes(summary)) return false
        val ticket = fence?.currentTicket()
        var changed = false
        fence.commitOrWrite(ticket) { database.withTransaction {
            val row = describedRow(conversationId, summary) ?: return@withTransaction
            val message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
            if (message.senderId != currentUserId) return@withTransaction
            val next = ReceiptMergePolicy.applying(message, with(ReceiptMergePolicy) { summary.counters })
            if (next == message) return@withTransaction
            messageDao.upsertAll(listOf(MessageEntityFactory.refreshed(row, next).bumped()))
            changed = true
        } }
        return changed
    }

    private suspend fun describedRow(conversationId: String, summary: ReadStatusSummary): MessageEntity? {
        val named = summary.messageId ?: return messageDao.latestAcknowledged(conversationId)
        val row = messageDao.findAll(listOf(named)).firstOrNull() ?: messageDao.findByServerId(named)
        return row?.takeIf { it.conversationId == conversationId }
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
