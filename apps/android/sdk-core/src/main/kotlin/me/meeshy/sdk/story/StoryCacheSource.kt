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
import me.meeshy.sdk.net.pagedApiCall
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

    /**
     * Pages through the feed up to [MAX_PAGES] (`MAX_PAGES * STORIES_PAGE_SIZE` = 300
     * stories, the same tray budget as iOS), following `pagination.nextCursor` while
     * `hasMore` holds. [persist] only prunes rows absent from the fetched set when the
     * window is PROVEN complete — the server said `hasMore = false` — never merely
     * because the budget ran out: an unproven partial window may upsert what it saw,
     * but must never be trusted to know what to delete. A response with no
     * `pagination` block at all (`null`) is treated as a complete single page, matching
     * the API's pre-pagination shape. Any page failing (including the first) throws
     * without persisting anything — Room already holds a complete prior tray, and
     * replacing it with an unproven partial one is worse than serving the stale one
     * a beat longer.
     */
    override suspend fun revalidate() {
        val collected = mutableListOf<ApiPost>()
        var cursor: String? = null
        var isComplete = false

        for (page in 0 until MAX_PAGES) {
            when (val result = pagedApiCall { storyApi.list(cursor, STORIES_PAGE_SIZE) }) {
                is NetworkResult.Success -> {
                    collected += result.data.data
                    val hasMore = result.data.pagination?.hasMore ?: false
                    if (!hasMore) {
                        isComplete = true
                        break
                    }
                    cursor = result.data.pagination?.nextCursor ?: break
                }
                is NetworkResult.Failure -> throw StorySyncException(result.error.message)
            }
        }

        persist(collected, prune = isComplete)
    }

    /**
     * Drops a single cached story by id (a realtime `story:deleted`). The removal is
     * authoritative — the Room-backed [observe] stream re-emits without the row, so the
     * tray repaints. An unknown id is an inert 0-row delete: Room emits nothing, so an
     * over-broadcast deletion for a story the viewer never cached causes no repaint.
     */
    suspend fun deleteLocal(storyId: String) {
        storyDao.deleteById(storyId)
    }

    private suspend fun persist(stories: List<ApiPost>, prune: Boolean) {
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
            if (prune) storyDao.deleteNotIn(rows.map { it.id })
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "stories"
        private const val STORIES_PAGE_SIZE = 50
        private const val MAX_PAGES = 6
    }
}
