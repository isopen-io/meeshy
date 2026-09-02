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
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PostViewersResponse
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.ApiError
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
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.api.UpdatePostRequest
import me.meeshy.sdk.model.PostTranslationMerge
import me.meeshy.sdk.model.PostUpdateMerge
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/** One cursor page of posts plus the pagination watermark to fetch the next. */
data class PostPage(
    val posts: List<ApiPost>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/** Bookmarked-posts page — the same cursor-page shape as any other post list. */
typealias BookmarkPage = PostPage

/** Posts, comments, reposts and feed variants — port of PostService (PostService.swift). */
@Singleton
class PostRepository @Inject constructor(
    private val postApi: PostApi,
    private val translationApi: TranslationApi,
    private val outboxRepository: OutboxRepository,
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
     * A synchronous read of whatever the feed's in-memory cache currently holds — the
     * Reels surface's cold-start seed (ARCHITECTURE.md §4, cache-first). Opening Reels
     * from the Feed can render the video posts the Feed already loaded INSTANTLY, no
     * spinner, while the real affinity thread loads in the background. `null` when the
     * feed has never synced (a true cold start with nothing cached).
     */
    val feedCacheSnapshot: List<ApiPost>?
        get() = _feedCache.value

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
     * Optimistic, durable like toggle (ARCHITECTURE.md §4-5). The viewer's own like
     * state (`isLikedByMe`) flips instantly with the count; the mutation is then
     * handed to the outbox rather than sent directly, so it survives an offline tap
     * — [OutboxFlushWorker] replays it FIFO on the shared [OutboxLanes.SOCIAL] lane
     * on the next reconnect, coalescing a like/unlike burst on the same post down to
     * one delivery ([OutboxCoalescer]'s terminal-toggle rule). The cache is rolled
     * back only on a **definitive** failure — [rollbackLike], called by the worker
     * once the row is `EXHAUSTED` — never merely because the device is offline right
     * now. Returns `false` only when the post is not in the cache to begin with.
     */
    suspend fun toggleLike(postId: String): Boolean {
        val target = _feedCache.value?.firstOrNull { it.id == postId } ?: return false
        val wasLiked = target.isLikedByMe == true
        applyLike(postId, liked = !wasLiked, likeCount = adjustedCount(target.likeCount, wasLiked))

        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (wasLiked) OutboxKind.UNLIKE_POST else OutboxKind.LIKE_POST,
                lane = OutboxLanes.SOCIAL,
                targetId = postId,
                payload = "",
            ),
        )
        return true
    }

    /**
     * Reverts an optimistic like flip after its outbox row was permanently
     * exhausted ([OutboxFlushWorker]'s `onExhausted`) — the post analogue of
     * `BlockCache.setBlocked`'s hard-exhausted rollback. [liked] is the value to
     * revert TO (the state before the mutation was enqueued); the count is
     * recomputed as the exact inverse of the delta [toggleLike]'s [applyLike]
     * applied, via the same [adjustedCount] law. A no-op once the post has left
     * the feed cache, **or once the cache no longer carries the optimistic value
     * this rollback was meant to undo** — a realtime reconciliation
     * (`revalidateFeed`, `post:liked`) between the tap and the `EXHAUSTED` verdict
     * already replaced the optimistic count with the server's own, and applying
     * the delta a second time would double-count or flip a like the server
     * actually accepted.
     */
    fun rollbackLike(postId: String, liked: Boolean) {
        val target = _feedCache.value?.firstOrNull { it.id == postId } ?: return
        if ((target.isLikedByMe == true) != !liked) return
        applyLike(postId, liked = liked, likeCount = adjustedCount(target.likeCount, wasSet = !liked))
    }

    private fun adjustedCount(current: Int?, wasSet: Boolean): Int =
        ((current ?: 0) + if (wasSet) -1 else 1).coerceAtLeast(0)

    private fun applyLike(postId: String, liked: Boolean, likeCount: Int?) {
        _feedCache.value = _feedCache.value?.map {
            if (it.id == postId) it.copy(isLikedByMe = liked, likeCount = likeCount) else it
        }
    }

    /**
     * Optimistic, durable bookmark toggle (ARCHITECTURE.md §4-5), the bookmark
     * analogue of [toggleLike]: the viewer's own `isBookmarkedByMe` flips instantly
     * with the count, and the mutation is handed to the outbox for durable FIFO
     * replay on [OutboxLanes.SOCIAL] rather than sent directly — offline taps
     * survive, and a toggle burst on the same post coalesces to one delivery. The
     * gateway later broadcasts `post:bookmarked` (a personal event) with the
     * authoritative absolute count, which the feed reconciles. The cache is rolled
     * back only on a definitive failure, via [rollbackBookmark]. Returns `false`
     * only when the post is not in the cache to begin with.
     */
    suspend fun toggleBookmark(postId: String): Boolean {
        val target = _feedCache.value?.firstOrNull { it.id == postId } ?: return false
        val wasBookmarked = target.isBookmarkedByMe == true
        applyBookmark(
            postId,
            bookmarked = !wasBookmarked,
            bookmarkCount = adjustedCount(target.bookmarkCount, wasBookmarked),
        )

        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (wasBookmarked) OutboxKind.UNBOOKMARK_POST else OutboxKind.BOOKMARK_POST,
                lane = OutboxLanes.SOCIAL,
                targetId = postId,
                payload = "",
            ),
        )
        return true
    }

    /**
     * Reverts an optimistic bookmark flip after its outbox row was permanently
     * exhausted — the bookmark analogue of [rollbackLike], including its
     * idempotency guard: a no-op once the post has left the feed cache, or once
     * the cache no longer carries the optimistic value this rollback was meant
     * to undo (a `post:bookmarked` reconciliation already landed the server's own
     * state). [bookmarked] is the value to revert TO; the count is recomputed as
     * the inverse of the delta [toggleBookmark]'s [applyBookmark] applied.
     */
    fun rollbackBookmark(postId: String, bookmarked: Boolean) {
        val target = _feedCache.value?.firstOrNull { it.id == postId } ?: return
        if ((target.isBookmarkedByMe == true) != !bookmarked) return
        applyBookmark(
            postId,
            bookmarked = bookmarked,
            bookmarkCount = adjustedCount(target.bookmarkCount, wasSet = !bookmarked),
        )
    }

    private fun applyBookmark(postId: String, bookmarked: Boolean, bookmarkCount: Int?) {
        _feedCache.value = _feedCache.value?.map {
            if (it.id == postId) it.copy(isBookmarkedByMe = bookmarked, bookmarkCount = bookmarkCount) else it
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
        const val BOOKMARKS_PAGE_SIZE = 20
        const val USER_POSTS_PAGE_SIZE = 20
        const val NEARBY_PAGE_SIZE = 20
        const val REELS_PAGE_SIZE = 10
    }

    suspend fun getFeed(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getFeed(cursor, limit) }

    /**
     * A single cursor page of the vertical reel thread (`GET /posts/feed/reels`),
     * carrying the `nextCursor`/`hasMore` watermark. The Reels screen owns cursor
     * accumulation itself (there is no repository-level reel cache, unlike
     * [feedStream]), so it needs the watermark to drive its own infinite scroll —
     * the reel-thread sibling of [getBookmarksPage]/[getUserPostsPage], sharing the
     * same [foldPostPage] law. [seed] anchors the thread on a reel touched in the
     * Feed, and MUST be repeated on every subsequent page (not just the first) so
     * the gateway keeps excluding it from candidates — see
     * `ReelsViewModel.currentSeed`, carried across every call.
     */
    suspend fun getReelsPage(
        seed: String? = null,
        cursor: String? = null,
        limit: Int = REELS_PAGE_SIZE,
    ): NetworkResult<PostPage> =
        foldPostPage(rawApiCall { postApi.getReels(seed, cursor, limit) })

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
        location: SharedPlace? = null,
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
                    location = location,
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

    /**
     * **Non-durable.** Hits the network directly with no outbox row — unlike
     * [toggleLike], an offline call is simply lost (no replay on reconnect, no
     * rollback UI). Reels (`ReelsViewModel`) and `BookmarksViewModel` call this
     * today because their list state is not addressable through [_feedCache], the
     * only cache [toggleLike]/[rollbackLike] know how to mutate — a tracked gap,
     * not the default choice for a new like/unlike call site. Prefer [toggleLike].
     */
    suspend fun like(postId: String): NetworkResult<Unit> =
        apiCall { postApi.like(postId) }

    /** Non-durable unlike — see [like]'s KDoc. Prefer [toggleLike]. */
    suspend fun unlike(postId: String): NetworkResult<Unit> =
        apiCall { postApi.unlike(postId) }

    /**
     * **Non-durable.** Hits the network directly with no outbox row — unlike
     * [toggleBookmark], an offline call is simply lost. Same tracked gap as
     * [like]: Reels and `BookmarksViewModel` call this because their list state
     * sits outside [_feedCache]. Prefer [toggleBookmark].
     */
    suspend fun bookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.bookmark(postId) }

    /** Non-durable un-bookmark — see [bookmark]'s KDoc. Prefer [toggleBookmark]. */
    suspend fun removeBookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.removeBookmark(postId) }

    suspend fun getBookmarks(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getBookmarks(cursor, limit) }

    /**
     * A single cursor page of the signed-in user's bookmarked posts, carrying the
     * pagination watermark the plain [getBookmarks] drops. The saved-posts screen
     * owns the accumulation (there is no repository-level bookmark cache yet), so it
     * needs `nextCursor`/`hasMore` to drive its own infinite scroll. A `success:false`
     * or dataless envelope is folded into a [NetworkResult.Failure] like [apiCall].
     */
    suspend fun getBookmarksPage(
        cursor: String? = null,
        limit: Int = BOOKMARKS_PAGE_SIZE,
    ): NetworkResult<PostPage> =
        foldPostPage(rawApiCall { postApi.getBookmarks(cursor, limit) })

    /**
     * A single cursor page of the given user's authored posts (`GET /posts/user/:id`),
     * carrying the `nextCursor`/`hasMore` watermark the plain [getUserPosts] drops. The
     * user-profile posts screen owns the accumulation (there is no repository-level
     * per-user cache), so it needs the watermark to drive its own infinite scroll. A
     * `success:false` or dataless envelope folds into a [NetworkResult.Failure], exactly
     * like [getBookmarksPage].
     */
    suspend fun getUserPostsPage(
        userId: String,
        cursor: String? = null,
        limit: Int = USER_POSTS_PAGE_SIZE,
    ): NetworkResult<PostPage> =
        foldPostPage(rawApiCall { postApi.getUserPosts(userId, cursor, limit) })

    /**
     * A single cursor page of posts near ([lat], [lng]) within [radiusKm]
     * (`GET /social/posts?scope=nearby`), carrying the `nextCursor`/`hasMore` watermark
     * the same way [getBookmarksPage]/[getUserPostsPage] do. The Nearby screen owns the
     * accumulation — there is no repository-level cache for this scope, since it is
     * keyed by a coordinate rather than the signed-in user.
     */
    suspend fun getNearbyPage(
        lat: Double,
        lng: Double,
        radiusKm: Double,
        cursor: String? = null,
        limit: Int = NEARBY_PAGE_SIZE,
    ): NetworkResult<PostPage> =
        foldPostPage(rawApiCall { postApi.getNearby(lat = lat, lng = lng, radiusKm = radiusKm, cursor = cursor, limit = limit) })

    /**
     * Fold a raw list envelope into a [PostPage]: a transport [NetworkResult.Failure]
     * passes through; a `success:false`/dataless envelope becomes a [NetworkResult.Failure];
     * otherwise the posts plus the pagination watermark become a [PostPage] (`hasMore`
     * defaulting to `false` when the envelope omits pagination). The single page-folding
     * law shared by every cursor-paginated post list.
     */
    private fun foldPostPage(
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

    /**
     * On-demand translation (Prisme, pull side): the viewer tapped a configured
     * language the post has no content for yet. Blocking-translates the post's
     * original text into [targetLanguage] and upserts the result into the in-memory
     * feed cache via [PostTranslationMerge] so the open card can switch to it — the
     * map-keyed sibling of [me.meeshy.sdk.conversation.MessageRepository.requestTranslation].
     *
     * Returns `true` only when a non-blank translation was actually stored. Inert
     * (`false`, nothing stored) when the post is not in the cache, has no source
     * text, the target is blank, the network call fails, the translator returns a
     * blank string, or the translation already matches what is cached (idempotent).
     */
    suspend fun requestOnDemandTranslation(postId: String, targetLanguage: String): Boolean {
        val post = _feedCache.value?.firstOrNull { it.id == postId } ?: return false
        val merged = translatePost(post, targetLanguage) ?: return false
        _feedCache.value = _feedCache.value?.map { if (it.id == postId) merged else it }
        return true
    }

    /**
     * Realtime translation (Prisme, push side): the gateway translated a post server-side
     * and broadcast the finished [entry] over `post:translation-updated`. Folds it into the
     * in-memory feed cache via [PostTranslationMerge] so an open card re-renders in the
     * reader's preferred language the instant it lands — the push sibling of
     * [requestOnDemandTranslation], minus the translator call (the text is already done).
     *
     * Returns `true` only when the cache actually changed. Inert (`false`, nothing stored)
     * when the post is not in the cache or the merge is a no-op (blank language, blank text,
     * or the identical entry already present).
     */
    fun applyTranslationUpdate(postId: String, language: String, entry: ApiPostTranslationEntry): Boolean {
        val post = _feedCache.value?.firstOrNull { it.id == postId } ?: return false
        val merged = PostTranslationMerge.mergeTranslation(post, language, entry) ?: return false
        _feedCache.value = _feedCache.value?.map { if (it.id == postId) merged else it }
        return true
    }

    /**
     * Realtime post edit (`post:updated`, push side): the author edited a post and the
     * gateway broadcast the whole new post. Folds it onto the cached copy via
     * [PostUpdateMerge] — adopting the edit's authoritative fields while preserving the
     * reader's own like/bookmark/view/reaction state (the broadcast is unpersonalized) —
     * so an open card shows the edit in place. The whole-post sibling of
     * [applyTranslationUpdate].
     *
     * Returns `true` only when the cache actually changed. Inert (`false`, nothing stored)
     * when the post is not in the cache, or the merge is a no-op (a re-broadcast, or an
     * edit that changed nothing the reader can see).
     */
    fun applyPostUpdate(updated: ApiPost): Boolean {
        val previous = _feedCache.value?.firstOrNull { it.id == updated.id } ?: return false
        val merged = PostUpdateMerge.merge(previous, updated) ?: return false
        _feedCache.value = _feedCache.value?.map { if (it.id == updated.id) merged else it }
        return true
    }

    /**
     * On-demand translation for a post the caller already holds (the post-detail
     * surface owns its post outside the feed cache): blocking-translates [post]'s
     * original text into [targetLanguage] and returns the merged post the caller
     * can swap in. Returns `null` — inert, no state to change — for the same reasons
     * [requestOnDemandTranslation] returns `false` (blank target, no source text,
     * network failure, blank translation, or an idempotent no-op). The cache-mutating
     * [requestOnDemandTranslation] and this pull-and-return variant share the single
     * translate-then-[PostTranslationMerge] law in [translateAndMerge].
     */
    suspend fun translatePost(post: ApiPost, targetLanguage: String): ApiPost? {
        val target = targetLanguage.trim()
        val translated = translateSource(post.content, post.originalLanguage, target) ?: return null
        return PostTranslationMerge.mergeTranslation(post, target, translated)
    }

    /**
     * On-demand translation for a comment the caller already holds (the comment thread
     * owns its rows outside the feed cache): blocking-translates [comment]'s original
     * text into [targetLanguage] and returns the merged comment the caller can swap in.
     * Returns `null` — inert, no state to change — for the same reasons [translatePost]
     * does (blank target, no source text, network failure, blank translation, or an
     * idempotent no-op). The comment-keyed sibling of [translatePost]; both share the
     * single translate law in [translateSource] and the [PostTranslationMerge] upsert.
     */
    suspend fun translateComment(comment: ApiPostComment, targetLanguage: String): ApiPostComment? {
        val target = targetLanguage.trim()
        val translated = translateSource(comment.content, comment.originalLanguage, target) ?: return null
        return PostTranslationMerge.mergeTranslation(comment, target, translated)
    }

    /**
     * The shared translate law over any Prisme content: reject a blank [target] or blank
     * [source] before touching the network, then blocking-translate [source] from
     * [sourceLanguage] into [target]. Returns the non-blank translated text, or `null`
     * when nothing should be stored (blank target/source, network failure, or a blank
     * translation). Callers pass an already-trimmed [target] and fold the result into
     * their own content type via [PostTranslationMerge].
     */
    private suspend fun translateSource(
        source: String?,
        sourceLanguage: String?,
        target: String,
    ): String? {
        if (target.isEmpty()) return null
        if (source.isNullOrBlank()) return null

        val translated = when (
            val result = apiCall {
                translationApi.translate(
                    TranslateRequest(
                        text = source,
                        sourceLanguage = sourceLanguage?.trim().orEmpty(),
                        targetLanguage = target,
                    ),
                )
            }
        ) {
            is NetworkResult.Success -> result.data.translatedText
            is NetworkResult.Failure -> return null
        }
        return translated.takeUnless { it.isBlank() }
    }

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
