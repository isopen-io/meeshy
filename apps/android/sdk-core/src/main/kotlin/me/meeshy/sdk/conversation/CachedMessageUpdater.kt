package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

/**
 * The read-modify-write of one cached message row, shared by the collaborators that mutate a
 * message in place ([MessageMutationWriter] for the optimistic edits and reaction deltas,
 * [MessageEnrichmentWriter] for translations and transcriptions). Room stays the single
 * source: the row is decoded, transformed and re-encoded inside one transaction.
 */
internal class CachedMessageUpdater(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val fence: AccountFence?,
) {

    /** Le compte auquel appartient l'événement ou le geste qui écrit MAINTENANT (#13560) ; `null` sans garde. */
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /** The cached message [messageId], or `null` when no row exists. */
    suspend fun find(messageId: String): ApiMessage? {
        val row = MessageIdReconciliation.locate(database, messageId) ?: return null
        return MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
    }

    /**
     * Applies [transform] to the cached message and writes it back. Returns the transformed
     * message, or `null` when the row is unknown or — with [requireSynced] — still an
     * optimistic local row the gateway does not know yet.
     */
    suspend fun update(
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? = update(ticket(), messageId, requireSynced, transform)

    /** [update] sous [ticket], pris AVANT la requête dont la réponse écrit la ligne (#13560) : rien n'atterrit chez B. */
    suspend fun update(
        ticket: AccountTicket?,
        messageId: String,
        requireSynced: Boolean,
        transform: (ApiMessage) -> ApiMessage,
    ): ApiMessage? {
        return fence.commitOrWrite(ticket) {
            database.withTransaction {
                val row = MessageIdReconciliation.locate(database, messageId) ?: return@withTransaction null
                if (requireSynced && row.sendState != null) return@withTransaction null
                val current = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
                val updated = transform(current)
                // A transform that returns its input unchanged (an inert socket update, e.g.
                // a duplicate translation) skips the redundant Room write + re-encode.
                if (updated !== current) {
                    messageDao.upsertAll(listOf(MessageEntityFactory.refreshed(row, updated).bumped()))
                }
                updated
            }
        }
    }
}
