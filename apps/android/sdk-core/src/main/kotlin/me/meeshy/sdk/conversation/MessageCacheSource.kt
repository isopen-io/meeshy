package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.listConditionalResult
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a message-list revalidation fails; carries the API error message. */
internal class MessageSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for one conversation's messages
 * (ARCHITECTURE.md §4, §6). Each conversation has its own `sync_meta` key so
 * freshness is tracked per conversation.
 *
 * Optimistic local rows (`sendState` non-null) ride along with server rows and
 * are reconciled by `clientMessageId` once the server list includes them.
 */
internal class MessageCacheSource(
    private val conversationId: String,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val syncMetaDao: SyncMetaDao,
    private val messageApi: MessageApi,
    private val clock: CacheClock,
) : SwrCacheSource<List<LocalMessage>> {

    private val resourceKey = "messages:$conversationId"

    override fun observe(): Flow<List<LocalMessage>?> =
        combine(
            messageDao.observeForConversation(conversationId),
            syncMetaDao.observe(resourceKey),
        ) { rows, syncedAt ->
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { it.toLocalMessage() }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(resourceKey)

    /**
     * #5188 — the recent-message window is a single, unvarying request shape
     * per [conversationId] (no offset/limit/before — see [MessageApi.
     * listConditional]'s doc-comment), so unlike [ConversationCacheSource]'s
     * multi-page, multi-scope sweep, ONE stored [me.meeshy.core.database.
     * entity.SyncMetaEntity.etag] is always the exact validator for the next
     * call — no request-key scoping needed. A 304 means "confirmed
     * unchanged": zero body decoded, zero Room writes, `lastSyncedAt`
     * refreshed as any successful revalidation. A 304 arriving when no `ETag`
     * was held is a server anomaly (RFC 7232 defines 304 only as an answer to
     * a conditional request) and throws, rather than being silently read as
     * "unchanged" or as an empty success.
     */
    override suspend fun revalidate() {
        val currentEtag = syncMetaDao.etag(resourceKey)
        when (
            val result = messageApi.listConditionalResult(
                conversationId = conversationId,
                ifNoneMatch = currentEtag,
            )
        ) {
            is ConditionalResult.NotModified -> {
                if (currentEtag == null) {
                    throw MessageSyncException(
                        "Unexpected 304 for messages:$conversationId without If-None-Match sent",
                    )
                }
                syncMetaDao.upsert(SyncMetaEntity(resourceKey, clock.nowMillis(), null, currentEtag, null))
            }
            is ConditionalResult.Fresh -> persist(result.data, newEtag = result.etag)
            is ConditionalResult.Failure -> throw MessageSyncException(result.error.message)
        }
    }

    private suspend fun persist(messages: List<ApiMessage>, newEtag: String?) {
        val now = clock.nowMillis()
        val rows = messages.map { message ->
            MessageEntity(
                id = message.id,
                conversationId = conversationId,
                seq = null,
                payload = MeeshyApi.json.encodeToString(message),
                createdAt = isoToEpochMillis(message.createdAt),
                cachedAt = now,
            )
        }
        val ackedLocalIds = messages.mapNotNull { it.clientMessageId }
        database.withTransaction {
            messageDao.upsertAll(rows)
            if (ackedLocalIds.isNotEmpty()) messageDao.deleteByIds(ackedLocalIds)
            if (rows.isEmpty()) {
                messageDao.deleteMissing(conversationId, emptyList())
            } else {
                messageDao.deleteMissingSince(
                    conversationId,
                    rows.minOf { it.createdAt },
                    rows.map { it.id },
                )
            }
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now, null, newEtag, null))
        }
    }
}
