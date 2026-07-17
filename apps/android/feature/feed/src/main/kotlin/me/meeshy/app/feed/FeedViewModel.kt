package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import javax.inject.Inject

data class FeedUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = true,
    val isLoadingMore: Boolean = false,
    /** Count of posts that arrived via `post:created` since the last acknowledge/refresh. */
    val newPostsCount: Int = 0,
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    /**
     * Per-post displayed-language override (`postId -> language code`) set by a flag
     * tap. Kept outside the cache stream so the viewer's choice survives every
     * background refresh and re-projection (instant-app: no reset on re-emit).
     */
    private val activeLanguageOverride = MutableStateFlow<Map<String, String>>(emptyMap())

    /**
     * Socket-arrived posts (`post:created`) that sit above the cache-projected feed,
     * plus the "new posts" banner count. Kept outside the cache stream so a just-arrived
     * post is never erased by a background refresh (the protective realtime-head merge).
     */
    private val realtimeHead = MutableStateFlow(FeedRealtimeHead())

    /** The raw posts currently displayed — the flag-tap handler resolves against these. */
    private var latestPosts: List<ApiPost> = emptyList()

    /** The cache-projected posts alone (excludes the realtime head), kept across re-emits. */
    private var latestCachePosts: List<ApiPost> = emptyList()

    init {
        viewModelScope.launch {
            combine(
                postRepository.feedStream(
                    onSyncError = { error ->
                        _state.update {
                            it.copy(errorMessage = error.message, isSyncing = false, showSkeleton = false)
                        }
                    },
                ),
                sessionRepository.currentUser,
                postRepository.feedHasMore,
                activeLanguageOverride,
                realtimeHead,
            ) { result, user, hasMore, overrides, head -> FeedInputs(result, user, hasMore, overrides, head) }
                .collect { (result, user, hasMore, overrides, head) ->
                    val cachePosts = result.postsOrNull() ?: latestCachePosts
                    latestCachePosts = cachePosts
                    val cacheIds = cachePosts.mapTo(HashSet()) { it.id }

                    // Prune buffered posts the cache has surfaced (memory hygiene) and release
                    // like overlays the cache has caught up to; the display work below already
                    // keeps buffered posts from double-rendering.
                    val prunedHead = FeedRealtimeReducer.reconcile(head, cacheIds)
                    val reconciledLikes = FeedRealtimeReducer.reconcileLikes(prunedHead, cachePosts)
                    val reconciled = FeedRealtimeReducer.reconcileBookmarks(reconciledLikes, cachePosts)
                    if (reconciled !== head) realtimeHead.value = reconciled

                    // Tombstoned posts (live `post:deleted`) are hidden from both the head and
                    // the cache-projected list until a refresh drops them from the cache. Live
                    // like overlays (`post:liked`/`post:unliked`) and bookmark overlays
                    // (`post:bookmarked`) override the cache count/own-state.
                    val removed = reconciled.removedIds
                    val likes = reconciled.likes
                    val bookmarks = reconciled.bookmarks
                    val visibleCache = cachePosts
                        .let { if (removed.isEmpty()) it else it.filterNot { p -> p.id in removed } }
                        .withLikeOverlays(likes)
                        .withBookmarkOverlays(bookmarks)
                    val visibleRealtime = reconciled.posts
                        .filterNot { it.id in cacheIds || it.id in removed }
                        .withLikeOverlays(likes)
                        .withBookmarkOverlays(bookmarks)
                    latestPosts = visibleRealtime + visibleCache
                    _state.update {
                        it.project(
                            result = result,
                            cachePosts = visibleCache,
                            realtimePosts = visibleRealtime,
                            user = user,
                            mediaBaseUrl = config.socketUrl,
                            overrides = overrides,
                            newPostsCount = reconciled.newPostsCount,
                        ).copy(hasMore = hasMore)
                    }
                }
        }
        viewModelScope.launch {
            socialSocket.postCreated.collect { payload ->
                val cacheIds = latestCachePosts.mapTo(HashSet()) { it.id }
                realtimeHead.update { FeedRealtimeReducer.accept(it, payload.post, cacheIds) }
            }
        }
        viewModelScope.launch {
            socialSocket.postDeleted.collect { payload ->
                realtimeHead.update { FeedRealtimeReducer.remove(it, payload.postId) }
            }
        }
        viewModelScope.launch {
            socialSocket.postLiked.collect { payload ->
                val mine = if (payload.userId == currentUserId()) true else null
                realtimeHead.update { FeedRealtimeReducer.like(it, payload.postId, payload.likesCount, mine) }
            }
        }
        viewModelScope.launch {
            socialSocket.postUnliked.collect { payload ->
                val mine = if (payload.userId == currentUserId()) false else null
                realtimeHead.update { FeedRealtimeReducer.like(it, payload.postId, payload.likesCount, mine) }
            }
        }
        viewModelScope.launch {
            socialSocket.postBookmarked.collect { payload ->
                realtimeHead.update {
                    FeedRealtimeReducer.bookmark(it, payload.postId, payload.bookmarkCount, payload.bookmarked)
                }
            }
        }
    }

    /**
     * The signed-in user's id, or null for an anonymous session — used to tell the
     * viewer's own `post:liked`/`post:unliked` echo (flip `isLiked`) from another
     * user's like (count only). Mirrors the iOS `data.userId == currentUser.id` guard.
     */
    private fun currentUserId(): String? = sessionRepository.currentUser.value?.id

    /**
     * Tap on the "new posts" banner (scroll-to-top): clear the banner count. The posts
     * already sit at the head, so only the counter resets. Port of iOS `acknowledgeNewPosts`.
     */
    fun acknowledgeNewPosts() {
        realtimeHead.update { FeedRealtimeReducer.acknowledge(it) }
    }

    /**
     * Tap on a post's Prisme language-flag chip: switch the post's displayed
     * language, or revert to the default resolution when the chip is already active.
     * The pure [LanguageFlagTapResolver] owns the decision (SSOT with chat); here we
     * only apply it to the per-post override map. A read-only content strip never
     * surfaces a content-less language, so [LanguageFlagTapResolver.Result.RequestTranslation]
     * is inert until an on-demand post-translation path lands.
     */
    fun onPostFlagTap(postId: String, code: String) {
        val post = latestPosts.firstOrNull { it.id == postId } ?: return
        val preferences = sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = FeedPostBuilder.resolveActiveCode(post, preferences, activeLanguageOverride.value[postId]),
            originalLanguage = post.originalLanguage,
            translations = post.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate ->
                activeLanguageOverride.update { it + (postId to result.code) }
            LanguageFlagTapResolver.Result.Revert ->
                activeLanguageOverride.update { it - postId }
            is LanguageFlagTapResolver.Result.RequestTranslation -> Unit
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * Infinite-scroll trigger (port of FeedViewModel.loadMoreIfNeeded): once the
     * given post is within [LOAD_MORE_THRESHOLD] of the tail and more pages remain,
     * fetch the next page. Re-entrancy is guarded by [FeedUiState.isLoadingMore];
     * failures are swallowed so the user can simply scroll again.
     */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        if (!current.hasMore || current.isLoadingMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                postRepository.loadMore()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun refresh() {
        realtimeHead.update { FeedRealtimeReducer.clear(it) }
        _state.update { it.copy(errorMessage = null, isSyncing = true) }
        viewModelScope.launch {
            try {
                postRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message, isSyncing = false) }
            }
        }
    }

    fun toggleLike(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.toggleLike(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    fun toggleBookmark(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.toggleBookmark(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

/** The combined inputs of the feed projection (Kotlin has no built-in Quintuple). */
private data class FeedInputs(
    val result: CacheResult<List<ApiPost>>,
    val user: MeeshyUser?,
    val hasMore: Boolean,
    val overrides: Map<String, String>,
    val head: FeedRealtimeHead,
)

/**
 * Overlay each post's live like state (absolute count + viewer-own flip) when a
 * `post:liked`/`post:unliked` overlay targets it. An absent overlay leaves the post
 * untouched; a `null` [LikeOverlay.mine] keeps the cache's `isLikedByMe` (another user's
 * like), so only the count moves. Returns the same list when no overlay applies.
 */
private fun List<ApiPost>.withLikeOverlays(likes: Map<String, LikeOverlay>): List<ApiPost> {
    if (likes.isEmpty()) return this
    return map { post ->
        val overlay = likes[post.id] ?: return@map post
        post.copy(
            likeCount = overlay.count,
            isLikedByMe = overlay.mine ?: post.isLikedByMe,
        )
    }
}

/**
 * Overlay each post's live bookmark state (absolute count + viewer-own flip) when a
 * `post:bookmarked` overlay targets it. An absent overlay leaves the post untouched.
 * Because the event is personal, both the count and `isBookmarkedByMe` are authoritative.
 * Returns the same list when no overlay applies.
 */
private fun List<ApiPost>.withBookmarkOverlays(bookmarks: Map<String, BookmarkOverlay>): List<ApiPost> {
    if (bookmarks.isEmpty()) return this
    return map { post ->
        val overlay = bookmarks[post.id] ?: return@map post
        post.copy(
            bookmarkCount = overlay.count,
            isBookmarkedByMe = overlay.mine,
        )
    }
}

/** The posts a cache result carries, or null when it holds none (keep the prior list). */
private fun CacheResult<List<ApiPost>>.postsOrNull(): List<ApiPost>? = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value
    CacheResult.Empty -> emptyList()
}

private fun Map<String, ApiPostTranslationEntry>?.toTranslationRows():
    List<LanguageResolver.TranslationLike> =
    this?.map { (code, entry) -> PostTranslationRow(code, entry.text) }.orEmpty()

private data class PostTranslationRow(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

private fun List<ApiPost>.toPresentations(
    preferences: LanguageResolver.ContentLanguagePreferences,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
): List<FeedPostPresentation> =
    map { FeedPostBuilder.build(it, preferences, mediaBaseUrl, activeLanguageCode = overrides[it.id]) }

/**
 * Projects the cache result plus the real-time head into the UI state. Realtime posts
 * (already filtered to be disjoint from the cache) are prepended to the cache-projected
 * list; skeleton shows only when there is genuinely nothing to display.
 */
private fun FeedUiState.project(
    result: CacheResult<List<ApiPost>>,
    cachePosts: List<ApiPost>,
    realtimePosts: List<ApiPost>,
    user: MeeshyUser?,
    mediaBaseUrl: String,
    overrides: Map<String, String>,
    newPostsCount: Int,
): FeedUiState {
    val prefs = user ?: EmptyContentPreferences
    val projected = realtimePosts.toPresentations(prefs, mediaBaseUrl, overrides) +
        cachePosts.toPresentations(prefs, mediaBaseUrl, overrides)
    val clearedError = if (result is CacheResult.Fresh) null else errorMessage
    val isSyncing = when (result) {
        is CacheResult.Fresh -> false
        is CacheResult.Stale -> true
        is CacheResult.Syncing -> true
        CacheResult.Empty -> false
    }
    val showSkeleton = when (result) {
        is CacheResult.Fresh, is CacheResult.Stale -> false
        is CacheResult.Syncing, CacheResult.Empty -> projected.isEmpty() && clearedError == null
    }
    return copy(
        posts = projected,
        isSyncing = isSyncing,
        showSkeleton = showSkeleton,
        errorMessage = clearedError,
        newPostsCount = newPostsCount,
    )
}
