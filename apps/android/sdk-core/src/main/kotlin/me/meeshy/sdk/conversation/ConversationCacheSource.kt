package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a conversation revalidation fails; carries the API error message. */
internal class ConversationSyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the conversation list (ARCHITECTURE.md §4).
 * The list is cached as serialized payloads; `sync_meta` records freshness so an
 * unchanged list is not rewritten on every revalidation.
 */
internal class ConversationCacheSource(
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    private val syncMetaDao: SyncMetaDao,
    private val conversationApi: ConversationApi,
    private val clock: CacheClock,
) : SwrCacheSource<List<ApiConversation>> {

    override fun observe(): Flow<List<ApiConversation>?> =
        combine(
            conversationDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            // Cold cache (never synced) is null → CacheResult.Empty; a synced-but-
            // empty list is a real, non-null empty list → Fresh/Stale.
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    override suspend fun revalidate() {
        when (val result = apiCall { conversationApi.list() }) {
            is NetworkResult.Success -> persist(result.data)
            is NetworkResult.Failure -> throw ConversationSyncException(result.error.message)
        }
    }

    private suspend fun persist(conversations: List<ApiConversation>) {
        val now = clock.nowMillis()
        val rows = conversations.map { conversation ->
            ConversationEntity(
                id = conversation.id,
                payload = MeeshyApi.json.encodeToString(conversation),
                updatedAt = isoToEpochMillis(
                    conversation.updatedAt
                        ?: conversation.lastMessage?.createdAt
                        ?: conversation.createdAt,
                ),
                cachedAt = now,
            )
        }
        database.withTransaction {
            conversationDao.upsertAll(rows)
            conversationDao.deleteNotIn(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "conversations"
    }
}
