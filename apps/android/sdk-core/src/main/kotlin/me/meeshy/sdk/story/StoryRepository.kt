package me.meeshy.sdk.story

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.cache.cacheFirstFlow
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.model.toStoryViewer
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryLikeRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Story feed, reactions and reposts — port of StoryService (StoryService.swift). */
@Singleton
class StoryRepository @Inject constructor(
    private val storyApi: StoryApi,
    database: MeeshyDatabase,
    storyDao: StoryDao,
    syncMetaDao: SyncMetaDao,
    private val outboxRepository: OutboxRepository,
) {
    private val cacheSource = StoryCacheSource(
        database = database,
        storyDao = storyDao,
        syncMetaDao = syncMetaDao,
        storyApi = storyApi,
        clock = SystemCacheClock,
    )

    /**
     * Cache-first stories tray stream (ARCHITECTURE.md §4): the cached feed is
     * served immediately (no cold spinner when rows exist) and revalidated in
     * the background. [onSyncError] surfaces a failed background revalidation so
     * the UI can leave its cold skeleton.
     */
    fun storiesStream(
        policy: CachePolicy = CachePolicy.Stories,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiPost>>> =
        cacheFirstFlow(policy, cacheSource, onRevalidateError = onSyncError)

    /** Explicit refresh (pull-to-refresh / retry). Throws on failure. */
    suspend fun refresh() {
        cacheSource.revalidate()
    }

    suspend fun list(cursor: String? = null, limit: Int = 50): NetworkResult<List<ApiPost>> =
        apiCall { storyApi.list(cursor, limit) }

    suspend fun markViewed(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.markViewed(storyId) }

    suspend fun delete(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.delete(storyId) }

    suspend fun react(storyId: String, emoji: String): NetworkResult<Unit> =
        apiCall { storyApi.react(storyId, StoryLikeRequest(emoji)) }

    suspend fun comment(storyId: String, content: String): NetworkResult<ApiPostComment> =
        apiCall { storyApi.comment(storyId, CreateCommentRequest(content)) }

    /** Fetches the comments under a story (oldest-first ordering is the overlay's job). */
    suspend fun comments(
        storyId: String,
        cursor: String? = null,
        limit: Int = 50,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { storyApi.comments(storyId, cursor, limit) }

    suspend fun repost(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.repost(storyId, RepostPostRequest()) }

    suspend fun fetchPost(id: String): NetworkResult<ApiPost> =
        apiCall { storyApi.fetchPost(id) }

    /**
     * Durably enqueues a story publish on the outbox (ARCHITECTURE.md §5): the
     * request is persisted and delivered by `OutboxFlushWorker` on its own
     * [OutboxLanes.STORY] lane, so a slow upload never head-of-line-blocks
     * messages and the publish survives process death / offline. Each publish is
     * an independent row keyed by a fresh temp id (no coalescing across stories).
     *
     * @return the queued row's `cmid` (drives optimistic-rollback observation).
     */
    suspend fun enqueuePublish(request: CreateStoryRequest): String? =
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_${UUID.randomUUID()}",
                payload = MeeshyApi.json.encodeToString(request),
            ),
        )

    /**
     * Fetches the viewers of a story (with their optional reaction), mapping the
     * wire payload to domain [StoryViewer]s. Port of iOS
     * `StoryInteractionService.loadViewers`.
     */
    suspend fun viewers(storyId: String): NetworkResult<List<StoryViewer>> =
        apiCall { storyApi.viewers(storyId) }.map { it.viewers.map { wire -> wire.toStoryViewer() } }
}
