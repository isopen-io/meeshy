package me.meeshy.sdk.story

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.util.isoToEpochMillis

/** Thrown when a stories revalidation fails; carries the API error message. */
internal class StorySyncException(message: String) : Exception(message)

/**
 * Room-backed [SwrCacheSource] for the stories feed (ARCHITECTURE.md §4).
 * Mirrors [me.meeshy.sdk.conversation.ConversationCacheSource]: each story post
 * is cached as a serialized payload, `sync_meta` records freshness so an
 * unchanged feed is not rewritten on every revalidation, and a synced-but-empty
 * feed (a real empty list) is distinguished from a cold cache (`null`).
 */
internal class StoryCacheSource(
    private val database: MeeshyDatabase,
    private val storyDao: StoryDao,
    private val syncMetaDao: SyncMetaDao,
    private val storyApi: StoryApi,
    private val clock: CacheClock,
) : SwrCacheSource<List<ApiPost>> {

    override fun observe(): Flow<List<ApiPost>?> =
        combine(
            storyDao.observeAll(),
            syncMetaDao.observe(RESOURCE_KEY),
        ) { rows, syncedAt ->
            if (rows.isEmpty() && syncedAt == null) {
                null
            } else {
                rows.map { MeeshyApi.json.decodeFromString<ApiPost>(it.payload) }
            }
        }

    override fun lastSyncedAt(): Flow<Long?> = syncMetaDao.observe(RESOURCE_KEY)

    override suspend fun revalidate() {
        when (val result = apiCall { storyApi.list(null, STORIES_PAGE_SIZE) }) {
            is NetworkResult.Success -> persist(result.data)
            is NetworkResult.Failure -> throw StorySyncException(result.error.message)
        }
    }

    private suspend fun persist(stories: List<ApiPost>) {
        val now = clock.nowMillis()
        val rows = stories.map { story ->
            StoryEntity(
                id = story.id,
                payload = MeeshyApi.json.encodeToString(story),
                createdAt = isoToEpochMillis(story.createdAt),
                cachedAt = now,
            )
        }
        database.withTransaction {
            storyDao.upsertAll(rows)
            storyDao.deleteNotIn(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "stories"
        private const val STORIES_PAGE_SIZE = 50
    }
}
