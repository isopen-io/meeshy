package me.meeshy.sdk.post

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/** One cursor page of posts plus the pagination watermark to fetch the next. */
data class PostPage(
    val posts: List<ApiPost>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/** Bookmarked-posts page — the same cursor-page shape as any other post list. */
typealias BookmarkPage = PostPage

/**
 * Fold a raw list envelope into a [PostPage]: a transport [NetworkResult.Failure]
 * passes through; a `success:false`/dataless envelope becomes a [NetworkResult.Failure];
 * otherwise the posts plus the pagination watermark become a [PostPage] (`hasMore`
 * defaulting to `false` when the envelope omits pagination). The single page-folding
 * law shared by every cursor-paginated post list.
 */
internal fun foldPostPage(
    result: NetworkResult<ApiResponse<List<ApiPost>>>,
): NetworkResult<PostPage> =
    when (result) {
        is NetworkResult.Success -> {
            val response = result.data
            val page = response.data
            if (!response.success || page == null) {
                NetworkResult.Failure(
                    ApiError(
                        message = response.error ?: response.message ?: "Unknown error",
                        code = response.code,
                    ),
                )
            } else {
                NetworkResult.Success(
                    PostPage(
                        posts = page,
                        nextCursor = response.pagination?.nextCursor,
                        hasMore = response.pagination?.hasMore ?: false,
                    ),
                )
            }
        }
        is NetworkResult.Failure -> result
    }
