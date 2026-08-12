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
    ): NetworkResult<StatusEntry> =
        when (
            val result = apiCall {
                postApi.create(
                    CreatePostRequest(
                        content = content,
                        type = "STATUS",
                        visibility = visibility,
                        moodEmoji = moodEmoji,
                        audioUrl = audioUrl,
                        repostOfId = repostOfId,
                        viaUsername = viaUsername,
                    ),
                )
            }
        ) {
            is NetworkResult.Success ->
                result.data.toStatusEntry()?.let { NetworkResult.Success(it) }
                    ?: NetworkResult.Failure(ApiError(message = "Malformed status response", code = "PARSE"))
            is NetworkResult.Failure -> result
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
