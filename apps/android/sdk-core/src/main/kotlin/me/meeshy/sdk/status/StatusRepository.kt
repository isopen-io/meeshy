package me.meeshy.sdk.status

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PostLikeRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.model.mood.MoodDoor
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Which mood-status feed to fetch — port of `StatusService.Mode` (StatusService.swift). */
enum class StatusFeedMode { FRIENDS, DISCOVER }

/**
 * One cursor page of mood statuses plus the pagination watermark to fetch the next.
 * Unlike the raw post page this carries already-mapped [StatusEntry]s (via the
 * `StatusMapper` SSOT), so non-statuses are dropped and the bar view-model consumes
 * domain entries directly — the Android parity improvement over iOS, which paginates
 * raw `APIPost`s and maps at the call site.
 */
data class StatusPage(
    val statuses: List<StatusEntry>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/** Mood statuses feed + mutations — port of StatusService (StatusService.swift). */
@Singleton
class StatusRepository @Inject constructor(
    private val postApi: PostApi,
    private val outbox: OutboxRepository? = null,
) {
    /**
     * A single cursor page of mood statuses for [mode], carrying the
     * `nextCursor`/`hasMore` watermark the statuses screen needs to drive its own
     * infinite scroll (there is no repository-level status cache yet — the bar
     * view-model owns accumulation, exactly like the bookmarks screen). The page's
     * posts are folded into [StatusEntry]s through the `toStatusEntries` SSOT, so
     * only real statuses survive.
     */
    suspend fun list(
        mode: StatusFeedMode = StatusFeedMode.FRIENDS,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<StatusPage> =
        foldStatusPage(
            rawApiCall {
                when (mode) {
                    StatusFeedMode.FRIENDS -> postApi.getStatuses(cursor, limit)
                    StatusFeedMode.DISCOVER -> postApi.getStatusesDiscover(cursor, limit)
                }
            },
        )

    /**
     * Publishes a mood status (`POST /posts` with `type = "STATUS"`) and folds the
     * created post into a [StatusEntry] through the same SSOT mapper the feed uses.
     * A response the mapper cannot read as a status (missing emoji/author) folds
     * into a `PARSE` [NetworkResult.Failure] rather than a silent success.
     */
    suspend fun create(
        moodEmoji: String,
        content: String? = null,
        visibility: String = "PUBLIC",
        audioUrl: String? = null,
        repostOfId: String? = null,
        viaUsername: String? = null,
        visibilityUserIds: List<String>? = null,
        mentions: List<PostMentionInput>? = null,
    ): NetworkResult<StatusEntry> {
        val request = CreatePostRequest(
            content = content,
            type = "STATUS",
            visibility = visibility,
            moodEmoji = moodEmoji,
            audioUrl = audioUrl,
            repostOfId = repostOfId,
            viaUsername = viaUsername,
            visibilityUserIds = visibilityUserIds?.takeIf { it.isNotEmpty() },
            mentions = mentions?.takeIf { it.isNotEmpty() },
        )
        val cmid = OutboxIds.cmid()
        return when (val result = apiCall { postApi.create(request, cmid) }) {
            is NetworkResult.Success ->
                result.data.toStatusEntry()?.let { NetworkResult.Success(it) }
                    ?: NetworkResult.Failure(ApiError(message = "Malformed status response", code = "PARSE"))
            is NetworkResult.Failure ->
                if (MoodDoor.queuesOnFailure(result.error.httpStatus)) queueOffline(request, cmid) ?: result else result
        }
    }

    /**
     * Sans réseau, la même ligne `CREATE_POST` (type `STATUS`) que les autres publications part au retour du réseau,
     * sous le `cmid` déjà envoyé (jamais publiée deux fois). Rend l'échec [QUEUED_OFFLINE] quand elle est en file.
     */
    private suspend fun queueOffline(request: CreatePostRequest, cmid: String): NetworkResult.Failure? {
        val queue = outbox ?: return null
        val accepted = runCatching {
            queue.enqueue(
                OutboxMutation(
                    kind = OutboxKind.CREATE_POST,
                    lane = OutboxLanes.POST,
                    targetId = cmid,
                    payload = MeeshyApi.json.encodeToString(CreatePostRequest.serializer(), request),
                    cmid = cmid,
                ),
            )
        }.getOrNull()
        return accepted?.let { NetworkResult.Failure(ApiError(message = "Mood queued", code = QUEUED_OFFLINE)) }
    }

    /**
     * Une humeur restée en file plus de 60 s (réseau absent, passerelle injoignable) revient comme brouillon : sa ligne
     * quitte la file et le composeur la rouvre — republier la remplace, jamais ne la double. `null` : rien de bloqué.
     */
    suspend fun recoverStuckMood(nowMillis: Long): StatusComposerDraftSnapshot? {
        val queue = outbox ?: return null
        val rows = runCatching { queue.pendingRows(OutboxKind.CREATE_POST) }.getOrNull().orEmpty()
        val moods = rows.mapNotNull { row ->
            val request = runCatching { MeeshyApi.json.decodeFromString(CreatePostRequest.serializer(), row.payload) }.getOrNull()
            request?.takeIf { it.type == "STATUS" }?.let { row to it }
        }
        val stuck = MoodDoor.recovery(moods.map { (row, _) -> row.cmid to row.createdAt }, nowMillis) ?: return null
        val (_, request) = moods.first { (row, _) -> row.cmid == stuck.cmidToReplace }
        queue.discard(stuck.cmidToReplace)
        return StatusComposerDraftSnapshot(
            emoji = request.moodEmoji,
            text = request.content.orEmpty(),
            visibility = request.visibility,
            updatedAtMillis = nowMillis,
        )
    }

    companion object {
        /** Le code de l'échec rendu par [create] quand l'humeur attend le retour du réseau dans la file. */
        const val QUEUED_OFFLINE = "STATUS_QUEUED_OFFLINE"
    }

    /** Deletes a mood status (`DELETE /posts/:id`). */
    suspend fun delete(statusId: String): NetworkResult<Unit> =
        apiCall { postApi.delete(statusId) }

    /**
     * Reacts to a mood status with [emoji] (`POST /posts/:id/like` carrying the
     * chosen emoji) — port of `StatusService.react`.
     */
    suspend fun react(statusId: String, emoji: String): NetworkResult<Unit> =
        apiCall { postApi.likeWithEmoji(statusId, PostLikeRequest(emoji)) }

    /**
     * Folds a raw list envelope into a [StatusPage]: a transport [NetworkResult.Failure]
     * passes through; a `success:false`/dataless envelope becomes a [NetworkResult.Failure];
     * otherwise the posts are mapped to [StatusEntry]s (non-statuses dropped) and paired
     * with the pagination watermark (`hasMore` defaulting to `false` when omitted). Mirrors
     * `PostRepository.foldPostPage`.
     */
    private fun foldStatusPage(
        result: NetworkResult<ApiResponse<List<ApiPost>>>,
    ): NetworkResult<StatusPage> =
        when (result) {
            is NetworkResult.Success -> {
                val response = result.data
                val posts = response.data
                if (!response.success || posts == null) {
                    NetworkResult.Failure(
                        ApiError(
                            message = response.error ?: response.message ?: "Unknown error",
                            code = response.code,
                        ),
                    )
                } else {
                    NetworkResult.Success(
                        StatusPage(
                            statuses = posts.toStatusEntries(),
                            nextCursor = response.pagination?.nextCursor,
                            hasMore = response.pagination?.hasMore ?: false,
                        ),
                    )
                }
            }
            is NetworkResult.Failure -> result
        }
}
