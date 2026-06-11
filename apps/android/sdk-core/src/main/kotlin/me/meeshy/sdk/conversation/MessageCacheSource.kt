package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.apiCall
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
                rows.map { row ->
                    LocalMessage(
                        message = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload),
                        sendState = row.sendState
                            ?.let { LocalSendState.valueOf(it) }
                            ?: LocalSendState.SYNCED,
                    )
                }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(resourceKey)

    override suspend fun revalidate() {
        when (val result = apiCall { messageApi.list(conversationId) }) {
            is NetworkResult.Success -> persist(result.data)
            is NetworkResult.Failure -> throw MessageSyncException(result.error.message)
        }
    }

    private suspend fun persist(messages: List<ApiMessage>) {
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
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now))
        }
    }
}
