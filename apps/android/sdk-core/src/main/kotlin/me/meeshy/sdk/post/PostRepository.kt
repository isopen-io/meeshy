package me.meeshy.sdk.post

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PostViewersResponse
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.MobileTranscriptionPayload
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PostImpressionsRequest
import me.meeshy.sdk.net.api.PostTranslationRequest
import me.meeshy.sdk.net.api.PostViewRequest
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.api.UpdatePostRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.rawApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Posts, comments, reposts and feed variants — port of PostService (PostService.swift). */
@Singleton
class PostRepository @Inject constructor(
    private val postApi: PostApi,
    private val clock: CacheClock = SystemCacheClock,
) {
    // In-memory cache for Phase 1 — Room-backed FeedEntity added in Phase 3 (ARCHITECTURE.md §13).
    private val _feedCache = MutableStateFlow<List<ApiPost>?>(null)
    private val _feedSyncedAt = MutableStateFlow<Long?>(null)

    // Cursor pagination state (port of FeedViewModel.nextCursor / hasMore).
    private var feedCursor: String? = null
    private val _feedHasMore = MutableStateFlow(true)

    /** Whether older feed pages remain to be fetched (drives the infinite-scroll trigger). */
    val feedHasMore: StateFlow<Boolean> = _feedHasMore.asStateFlow()

    /**
     * Cache-first feed stream (ARCHITECTURE.md §4). An in-memory L1 cache serves
     * stale data immediately; background revalidation is triggered on staleness.
     */
    fun feedStream(
        policy: CachePolicy = CachePolicy.Feed,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiPost>>> =
        combine(_feedCache, _feedSyncedAt) { data, syncedAt -> data to syncedAt }
            .distinctUntilChanged()
            .transformLatest { (data, syncedAt) ->
                if (data == null) {
                    emit(CacheResult.Empty)
                    revalidateFeed(onSyncError)
                    return@transformLatest
                }
                val age = syncedAt?.let { clock.nowMillis() - it } ?: Long.MAX_VALUE
                when {
                    age <= policy.freshForMillis -> emit(CacheResult.Fresh(data, age))
                    age <= policy.keepForMillis -> {
                        emit(CacheResult.Stale(data, age))
                        revalidateFeed(onSyncError)
                    }
                    else -> {
                        emit(CacheResult.Syncing(data))
                        revalidateFeed(onSyncError)
                    }
                }
            }

    suspend fun refresh() = revalidateFeed()

    /**
     * Optimistic like toggle (ARCHITECTURE.md §4). The viewer's own like state
     * (`isLikedByMe`) flips instantly with the count; the network confirms after
     * and the cache rolls back on failure. Returns true when the mutation was
     * accepted by the gateway.
     */
    suspend fun toggleLike(postId: String): Boolean {
        val target = _feedCache.value?.firstOrNull { it.id == postId } ?: return false
        val wasLiked = target.isLikedByMe == true
        applyLike(postId, liked = !wasLiked, likeCount = adjustedCount(target.likeCount, wasLiked))

        val result = if (wasLiked) apiCall { postApi.unlike(postId) } else apiCall { postApi.like(postId) }
        if (result is NetworkResult.Failure) {
            applyLike(postId, liked = wasLiked, likeCount = target.likeCount)
            return false
        }
        return true
    }

    private fun adjustedCount(current: Int?, wasLiked: Boolean): Int =
        ((current ?: 0) + if (wasLiked) -1 else 1).coerceAtLeast(0)

    private fun applyLike(postId: String, liked: Boolean, likeCount: Int?) {
        _feedCache.value = _feedCache.value?.map {
            if (it.id == postId) it.copy(isLikedByMe = liked, likeCount = likeCount) else it
        }
    }

    /**
     * Infinite-scroll pagination (port of FeedViewModel.loadMoreIfNeeded). Fetches
     * the page after the current cursor, deduplicates against the in-memory cache and
     * appends it. The freshness watermark is untouched — older pages do not make the
     * newest page fresher. Returns whether more pages remain. Silent no-op when the
     * cursor is exhausted or the network call fails (the user can scroll again).
     */
    suspend fun loadMore(): Boolean {
        val cursor = feedCursor
        if (!_feedHasMore.value || cursor == null) return false
        val current = _feedCache.value ?: return false
        return when (val result = rawApiCall { postApi.getFeed(cursor, FEED_PAGE_SIZE) }) {
            is NetworkResult.Success -> {
                val response = result.data
                val page = response.data
                if (!response.success || page == null) return false
                val existingIds = current.mapTo(HashSet()) { it.id }
                _feedCache.value = current + page.filter { it.id !in existingIds }
                feedCursor = response.pagination?.nextCursor
                _feedHasMore.value = response.pagination?.hasMore ?: false
                _feedHasMore.value
            }
            is NetworkResult.Failure -> false
        }
    }

    private suspend fun revalidateFeed(onError: (Throwable) -> Unit = {}) {
        try {
            when (val result = rawApiCall { postApi.getFeed(null, FEED_PAGE_SIZE) }) {
                is NetworkResult.Success -> {
                    val response = result.data
                    val page = response.data
                    if (!response.success || page == null) {
                        onError(Exception(response.error ?: response.message ?: "Unknown error"))
                        return
                    }
                    _feedCache.value = page
                    _feedSyncedAt.value = clock.nowMillis()
                    feedCursor = response.pagination?.nextCursor
                    _feedHasMore.value = response.pagination?.hasMore ?: false
                }
                is NetworkResult.Failure -> onError(Exception(result.error.message))
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Throwable) {
            onError(e)
        }
    }

    private companion object {
        const val FEED_PAGE_SIZE = 30
    }

    suspend fun getFeed(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getFeed(cursor, limit) }

    /**
     * Vertical reel thread (`GET /posts/feed/reels`). [seed] is a reel touched in
     * the Feed to anchor the affinity thread; null returns the default reel feed.
     */
    suspend fun getReels(
        seed: String? = null,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getReels(seed, cursor, limit) }

    suspend fun create(
        content: String? = null,
        type: String = "POST",
        visibility: String = "PUBLIC",
        moodEmoji: String? = null,
        mediaIds: List<String>? = null,
        audioUrl: String? = null,
        audioDuration: Int? = null,
        originalLanguage: String? = null,
        mobileTranscription: MobileTranscriptionPayload? = null,
        repostOfId: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.create(
                CreatePostRequest(
                    content = content,
                    type = type,
                    visibility = visibility,
                    moodEmoji = moodEmoji,
                    mediaIds = mediaIds,
                    audioUrl = audioUrl,
                    audioDuration = audioDuration,
                    originalLanguage = originalLanguage,
                    mobileTranscription = mobileTranscription,
                    repostOfId = repostOfId,
                ),
            )
        }

    suspend fun update(
        postId: String,
        content: String? = null,
        visibility: String? = null,
        moodEmoji: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall { postApi.update(postId, UpdatePostRequest(content, visibility, moodEmoji)) }

    suspend fun delete(postId: String): NetworkResult<Unit> =
        apiCall { postApi.delete(postId) }

    suspend fun getPost(postId: String): NetworkResult<ApiPost> =
        apiCall { postApi.getPost(postId) }

    suspend fun like(postId: String): NetworkResult<Unit> =
        apiCall { postApi.like(postId) }

    suspend fun unlike(postId: String): NetworkResult<Unit> =
        apiCall { postApi.unlike(postId) }

    suspend fun bookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.bookmark(postId) }

    suspend fun removeBookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.removeBookmark(postId) }

    suspend fun getBookmarks(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getBookmarks(cursor, limit) }

    suspend fun pinPost(postId: String): NetworkResult<Unit> =
        apiCall { postApi.pin(postId) }

    suspend fun unpinPost(postId: String): NetworkResult<Unit> =
        apiCall { postApi.unpin(postId) }

    suspend fun share(postId: String): NetworkResult<Unit> =
        apiCall { postApi.share(postId) }

    suspend fun repost(
        postId: String,
        targetType: PostType? = null,
        content: String? = null,
        isQuote: Boolean = false,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.repost(
                postId,
                RepostPostRequest(content = content, isQuote = isQuote, targetType = targetType?.name),
            )
        }

    suspend fun createStory(
        content: String? = null,
        storyEffects: StoryEffects? = null,
        visibility: String = "PUBLIC",
        originalLanguage: String? = null,
        mediaIds: List<String>? = null,
        repostOfId: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.createStory(
                CreateStoryRequest(
                    content = content,
                    storyEffects = storyEffects,
                    visibility = visibility,
                    originalLanguage = originalLanguage,
                    mediaIds = mediaIds,
                    repostOfId = repostOfId,
                ),
            )
        }

    suspend fun requestTranslation(postId: String, targetLanguage: String): NetworkResult<Unit> =
        apiCall { postApi.requestTranslation(postId, PostTranslationRequest(targetLanguage)) }

    suspend fun viewPost(postId: String, duration: Int? = null): NetworkResult<Unit> =
        apiCall { postApi.viewPost(postId, PostViewRequest(duration)) }

    suspend fun getPostViews(
        postId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): NetworkResult<PostViewersResponse> =
        apiCall { postApi.getPostViews(postId, limit, offset) }

    suspend fun getUserPosts(
        userId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getUserPosts(userId, cursor, limit) }

    suspend fun getCommunityPosts(
        communityId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getCommunityPosts(communityId, cursor, limit) }

    suspend fun recordImpressions(
        postIds: List<String>,
        source: String = "feed",
    ): NetworkResult<Unit> =
        apiCall { postApi.recordImpressions(PostImpressionsRequest(postIds, source)) }

    suspend fun getComments(
        postId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { postApi.getComments(postId, cursor, limit) }

    suspend fun addComment(
        postId: String,
        content: String,
        parentId: String? = null,
        effectFlags: Int? = null,
    ): NetworkResult<ApiPostComment> =
        apiCall { postApi.addComment(postId, CreateCommentRequest(content, parentId, effectFlags)) }

    suspend fun getCommentReplies(
        postId: String,
        commentId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { postApi.getCommentReplies(postId, commentId, cursor, limit) }

    suspend fun likeComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.likeComment(postId, commentId) }

    suspend fun unlikeComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.unlikeComment(postId, commentId) }

    suspend fun deleteComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.deleteComment(postId, commentId) }
}
