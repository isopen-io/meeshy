package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi

/**
 * The read-modify-write of one cached message row, shared by the collaborators that mutate a
 * message in place ([MessageMutationWriter] for the optimistic edits and reaction deltas,
 * [MessageEnrichmentWriter] for translations and transcriptions). Room stays the single
 * source: the row is decoded, transformed and re-encoded inside one transaction.
 */
internal class CachedMessageUpdater(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
) {

    /** The cached message [messageId], or `null` when no row exists. */
    suspend fun find(messageId: String): ApiMessage? {
        val row = messageDao.find(messageId) ?: return null
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
    ): ApiMessage? = database.withTransaction {
        val row = messageDao.find(messageId) ?: return@withTransaction null
        if (requireSynced && row.sendState != null) return@withTransaction null
        val current = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        val updated = transform(current)
        // A transform that returns its input unchanged (an inert socket update, e.g.
        // a duplicate translation) skips the redundant Room write + re-encode.
        if (updated !== current) {
            messageDao.upsertAll(listOf(row.copy(payload = MeeshyApi.json.encodeToString(updated))))
        }
        updated
    }
}
