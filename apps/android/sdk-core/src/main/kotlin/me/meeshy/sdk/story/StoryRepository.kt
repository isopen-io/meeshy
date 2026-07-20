package me.meeshy.sdk.story

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.OutboxEntity
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
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
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
     * @param dependsOn the `cmid`s of the prerequisite `UPLOAD_MEDIA` rows this
     *   publish must wait for (their placeholder media ids ride in `request.mediaIds`);
     *   the drainer holds the publish until **every** one delivers, then grafts each
     *   real id in. Empty for a publish with no offline-queued media. Several entries
     *   gate the publish on multiple offline uploads at once.
     * @return the queued row's `cmid` (drives optimistic-rollback observation).
     */
    suspend fun enqueuePublish(request: CreateStoryRequest, dependsOn: List<String> = emptyList()): String? =
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_${UUID.randomUUID()}",
                payload = MeeshyApi.json.encodeToString(request),
                dependsOn = dependsOn.toSet(),
            ),
        )

    /**
     * The story-publish queue as a **single consistent snapshot** (ARCHITECTURE.md
     * §5): the live (`PENDING`/`INFLIGHT`) publishes for the optimistic self-ring
     * and the `EXHAUSTED` ones for the failure strip, both derived from **one**
     * `observeAll()` emission. Deriving them together matters: a publish that
     * transitions `PENDING → EXHAUSTED` leaves `pending` and enters `failed` in the
     * *same* emission, so a consumer can never observe a transient frame where the
     * row is in neither set (which would otherwise read as a spurious delivery).
     * Undecodable / blank-content rows are skipped defensively.
     */
    fun publishQueue(): Flow<StoryPublishQueue> =
        outboxRepository.observeAll().map { rows ->
            val storyRows = rows.filter { it.kindEnum == OutboxKind.PUBLISH_STORY }
            StoryPublishQueue(
                pending = storyRows
                    .filter { it.stateEnum in LIVE_PUBLISH_STATES }
                    .mapNotNull { it.toPendingStoryPublish() },
                failed = storyRows
                    .filter { it.stateEnum == OutboxState.EXHAUSTED }
                    .mapNotNull { it.toFailedStoryPublish() },
            )
        }

    /**
     * Live story publishes still in flight on the durable outbox, decoded for the
     * tray's optimistic self-ring — the `pending` projection of [publishQueue].
     * Only `PENDING`/`INFLIGHT` rows are surfaced; an exhausted row is **rolled
     * back** automatically, a delivered row is deleted and likewise drops out.
     */
    fun pendingPublishes(): Flow<List<PendingStoryPublish>> = publishQueue().map { it.pending }

    private fun OutboxEntity.toPendingStoryPublish(): PendingStoryPublish? {
        val request = decodeStoryPublish() ?: return null
        return PendingStoryPublish(
            tempId = targetId,
            content = request.content,
            visibility = request.visibility,
            originalLanguage = request.originalLanguage,
            createdAtMillis = createdAt,
        )
    }

    /**
     * Story publishes that **exhausted** their durable-outbox retries — the
     * `failed` projection of [publishQueue]. Each carries the `cmid` so the tray
     * can offer a user-initiated retry ([retryPublish]) or a discard
     * ([discardPublish]). Surpasses iOS, whose optimistic story silently
     * evaporates on failure with no recovery.
     */
    fun failedPublishes(): Flow<List<FailedStoryPublish>> = publishQueue().map { it.failed }

    /**
     * Revives an exhausted publish for a user-initiated retry — back to the live
     * queue with a fresh attempt budget. The caller kicks the drain worker.
     * @return `false` when the row no longer exists.
     */
    suspend fun retryPublish(cmid: String): Boolean = outboxRepository.retry(cmid)

    /** Permanently discards an exhausted publish the user no longer wants to retry. */
    suspend fun discardPublish(cmid: String) = outboxRepository.discard(cmid)

    private fun OutboxEntity.toFailedStoryPublish(): FailedStoryPublish? {
        val request = decodeStoryPublish() ?: return null
        return FailedStoryPublish(
            cmid = cmid,
            tempId = targetId,
            content = request.content,
            visibility = request.visibility,
            originalLanguage = request.originalLanguage,
            createdAtMillis = createdAt,
            failedAtMillis = updatedAt,
        )
    }

    /** A non-blank story publish decoded from this row's payload, or null if undecodable/blank. */
    private fun OutboxEntity.decodeStoryPublish(): DecodedStoryPublish? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload)
        }.getOrNull() ?: return null
        val content = request.content?.takeIf { it.isNotBlank() } ?: return null
        return DecodedStoryPublish(content, request.visibility, request.originalLanguage)
    }

    private data class DecodedStoryPublish(
        val content: String,
        val visibility: String,
        val originalLanguage: String?,
    )

    /**
     * Fetches the viewers of a story (with their optional reaction), mapping the
     * wire payload to domain [StoryViewer]s. Port of iOS
     * `StoryInteractionService.loadViewers`.
     */
    suspend fun viewers(storyId: String): NetworkResult<List<StoryViewer>> =
        apiCall { storyApi.viewers(storyId) }.map { it.viewers.map { wire -> wire.toStoryViewer() } }

    private companion object {
        /** Outbox states that still represent an un-rolled-back publish. */
        val LIVE_PUBLISH_STATES = setOf(OutboxState.PENDING, OutboxState.INFLIGHT)
    }
}
