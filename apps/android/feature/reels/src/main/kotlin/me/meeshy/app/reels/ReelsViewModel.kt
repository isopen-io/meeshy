package me.meeshy.app.reels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.EngagementSessions
import me.meeshy.sdk.model.EngagementSurface
import me.meeshy.sdk.model.QualifiedView
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import java.util.concurrent.CancellationException
import javax.inject.Inject

data class ReelsUiState(
    val reels: List<ReelPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ReelsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
    private val privacyPreferencesStore: PrivacyPreferencesStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ReelsUiState())
    val state: StateFlow<ReelsUiState> = _state.asStateFlow()

    /**
     * The reel currently filling the pager — it owns membership of the post room
     * (`ROOMS.post`). Held outside [_state] because it is a subscription cursor, not
     * something the UI renders.
     */
    private var currentReelId: String? = null

    /**
     * Dwell bookkeeping for the reels surface. Held outside [_state] (like
     * [currentReelId]) because it is an analytics cursor, not something the UI
     * renders. The pure [EngagementSessions] machine owns the *how* (monotonic
     * dwell, qualification); this ViewModel owns the *when* — begin on settle,
     * end on the next settle or on leaving — and where the qualified view is
     * reported (`posts/{id}/view`).
     */
    private var sessions = EngagementSessions()

    /** Cursor pagination watermark for the reel thread (port of FeedViewModel.nextCursor/hasMore). */
    private var nextCursor: String? = null
    private var hasMoreReels = true

    /**
     * The entry reel for this thread, carried across EVERY page — not just the first.
     * The gateway excludes [currentSeed] from candidates on every call it receives it
     * on (`id: { not: seedReelId }`); a page fetched without it could let that exact
     * reel resurface later in the thread, after the Feed already showed it as the
     * entry point (iOS `ReelsViewModel.fetch` mirrors this: `seedReelId` rides along
     * on every `getReels` call, reset or paginated).
     */
    private var currentSeed: String? = null

    /**
     * Gates [loadMore] until the FIRST network page has landed — otherwise a scroll that
     * outruns a still-in-flight [load] would page against a cursor that was never set,
     * racing the very call that sets it.
     */
    private var hasLoadedFirstPage = false

    init {
        observeRealtime()
    }

    /**
     * Loads the vertical reel thread, optionally anchored at [seed] (a reel touched in the
     * Feed, or the target of a notification tap). Cache-first (ARCHITECTURE.md §4): when the
     * Feed's in-memory cache already holds [seed], the thread renders from it INSTANTLY —
     * moved to the front, no spinner — while the real affinity thread loads in the background.
     * When [seed] is NOT in that cache (a notification opens a reel the Feed never rendered —
     * the common case), it is fetched explicitly by id ([loadSeedAndPrepend]) rather than
     * assumed to be in the network page: the gateway's `getReels` EXCLUDES [seed] from every
     * page it returns ("already shown by the client, entry point of the thread"), so a thread
     * opened straight from a notification would otherwise never contain the very reel the user
     * tapped. Either way, once [seed] is present in [ReelsUiState.reels] (from the cache or
     * from [loadSeedAndPrepend]), the network page is APPENDED to it (deduplicated, like
     * [loadMore]) rather than replacing it — a page that legitimately excludes [seed] must
     * never evict it from the thread.
     */
    fun load(seed: String? = null) {
        hasLoadedFirstPage = false
        nextCursor = null
        hasMoreReels = true
        currentSeed = seed

        val cachedFeed = postRepository.feedCacheSnapshot
            ?.let { ReelBuilder.build(it, config.socketUrl) }
            .orEmpty()
        val seedInCache = seed != null && cachedFeed.any { it.id == seed }
        val cached = ReelBuilder.withSeedFirst(cachedFeed, seed)
        _state.update { it.copy(reels = cached, isLoading = cached.isEmpty(), errorMessage = null) }

        if (seed != null && !seedInCache) loadSeedAndPrepend(seed)

        viewModelScope.launch {
            when (val result = postRepository.getReelsPage(seed = seed)) {
                is NetworkResult.Success -> {
                    val page = result.data
                    hasLoadedFirstPage = true
                    nextCursor = page.nextCursor
                    hasMoreReels = page.hasMore
                    val fresh = ReelBuilder.build(page.posts, config.socketUrl)
                    _state.update { current ->
                        val existingIds = current.reels.mapTo(HashSet()) { it.id }
                        val seedAlreadyPresent = seed != null && seed in existingIds
                        val reels = if (seedAlreadyPresent) {
                            current.reels + fresh.filter { it.id !in existingIds }
                        } else {
                            fresh
                        }
                        current.copy(reels = reels, isLoading = false)
                    }
                }
                is NetworkResult.Failure -> _state.update {
                    // The cache-seeded reels (if any) are left in place rather than cleared —
                    // a network failure degrades to what the Feed already had, never to blank.
                    it.copy(isLoading = false, errorMessage = if (cached.isEmpty()) result.error.message else it.errorMessage)
                }
            }
        }
    }

    /**
     * Fetches [seedId] by id and pins it at the front of the thread, for the cold-start case
     * where [load] found it absent from the Feed cache. Best-effort and order-agnostic against
     * the concurrent [load] page fetch — whichever of the two lands second still sees (and
     * dedupes against) whatever the other already wrote, since both read [ReelsUiState.reels]
     * fresh inside their own [MutableStateFlow.update] transform. A non-REEL post (filtered out
     * by [ReelBuilder.build]) or a failed fetch simply leaves the thread as the page populates it.
     */
    private fun loadSeedAndPrepend(seedId: String) {
        viewModelScope.launch {
            val result = postRepository.getPost(seedId)
            if (result !is NetworkResult.Success) return@launch
            val seedReel = ReelBuilder.build(listOf(result.data), config.socketUrl).firstOrNull() ?: return@launch
            _state.update { current ->
                if (current.reels.any { it.id == seedReel.id }) return@update current
                current.copy(reels = listOf(seedReel) + current.reels, isLoading = false)
            }
        }
    }

    /**
     * Infinite-scroll pagination (port of PostRepository.loadMore's law): fetches the page
     * after [nextCursor], deduplicates against the reels already shown, and appends it. The
     * watermark is left untouched on failure — [hasMoreReels]/[nextCursor] are only advanced
     * by a successful response, so the next scroll (or a retry) can pick up from the same
     * cursor. A no-op while the first page hasn't landed yet, while a page is already in
     * flight, or once the thread is exhausted.
     */
    fun loadMore() {
        if (!hasLoadedFirstPage || !hasMoreReels || _state.value.isLoadingMore) return
        val cursor = nextCursor ?: return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            when (val result = postRepository.getReelsPage(seed = currentSeed, cursor = cursor)) {
                is NetworkResult.Success -> {
                    val page = result.data
                    nextCursor = page.nextCursor
                    hasMoreReels = page.hasMore
                    val existingIds = _state.value.reels.mapTo(HashSet()) { it.id }
                    val appended = ReelBuilder.build(page.posts, config.socketUrl)
                        .filter { it.id !in existingIds }
                    _state.update { it.copy(reels = it.reels + appended, isLoadingMore = false) }
                }
                is NetworkResult.Failure -> _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /**
     * The reel that just settled under the pager. Moves the post-room subscription with it —
     * leave the reel we are scrolling away from, join the one we land on — mirroring iOS
     * `ReelsViewModel.currentId`'s `didSet`.
     *
     * This is what makes the like counter live at all for the reels thread: `getReels` ranks by
     * affinity and happily serves reels authored by people the viewer does NOT follow, and the
     * gateway broadcasts `post:liked`/`post:unliked` to the author's + friends' feed rooms **and**
     * to `ROOMS.post` — a room whose own doc comment names the "reel viewer" as its intended
     * occupant. Without joining, a non-friend's reel never receives a single like event.
     *
     * Idempotent, and safe to call on every settle: re-passing the same id is a no-op, and a blank
     * or absent id (an empty thread, a page index past the end) simply leaves the current room
     * without joining another.
     *
     * It also drives the dwell session: the reel we scroll away from is ended (a
     * qualified view — dwelt ≥ [EngagementSessions.MIN_DWELL_MS] — records its
     * duration), and the reel we land on begins a fresh one. Passing `null` (the
     * pager left, or ran past the end) therefore also closes the last session, so
     * a screen-dispose that calls `setCurrentReel(null)` needs no separate path.
     */
    fun setCurrentReel(reelId: String?) {
        val next = reelId?.takeIf { it.isNotBlank() }
        if (next == currentReelId) return
        currentReelId?.let { socialSocket.leavePostRoom(it) }
        endReelSession()
        currentReelId = next
        next?.let {
            socialSocket.joinPostRoom(it)
            sessions = sessions.begin(
                EngagementSurface.REELS,
                it,
                clock.nowMillis(),
                consentGranted = privacyPreferencesStore.preferences.value.allowAnalytics,
            )
        }
    }

    private fun endReelSession() {
        val (next, view) = sessions.end(EngagementSurface.REELS, clock.nowMillis())
        sessions = next
        view?.let { recordDwellView(it) }
    }

    /**
     * Best-effort dwell-aware view record (`posts/{id}/view` with its measured
     * duration) — the reels surface has no other view metric today, so this is
     * purely additive. Fire-and-forget, matching the feed/detail view records:
     * a failure is analytics the reader should never see fail.
     */
    private fun recordDwellView(view: QualifiedView) {
        viewModelScope.launch {
            try {
                postRepository.viewPost(view.postId, view.dwellMs.toInt())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // best-effort — matches the feed/detail `try?` view records
            }
        }
    }

    /** Leaves the post room the pager was sitting in, so a closed viewer stops receiving its events. */
    override fun onCleared() {
        currentReelId?.let { socialSocket.leavePostRoom(it) }
        currentReelId = null
        super.onCleared()
    }

    /**
     * Live like state for any reel in the thread. `likesCount` is the gateway's ABSOLUTE count
     * after the mutation, so applying it heals whatever drift [toggleLike]'s optimistic arithmetic
     * left behind. `isLiked` only moves when the event carries the viewer's own id — someone
     * else's like changes the count, never the heart (the `mine` convention already established by
     * `PostDetailViewModel` and `FeedViewModel`).
     */
    private fun observeRealtime() {
        viewModelScope.launch {
            socialSocket.postLiked.collect { event ->
                applyLiveLike(event.postId, event.likesCount, mine(event.userId, liked = true))
            }
        }
        viewModelScope.launch {
            socialSocket.postUnliked.collect { event ->
                applyLiveLike(event.postId, event.likesCount, mine(event.userId, liked = false))
            }
        }
        viewModelScope.launch {
            // `post:bookmarked` is a PERSONAL event — the gateway only ever broadcasts it to
            // the acting user's own room, so unlike likes there is no `mine` check: it always
            // reconciles [toggleBookmark]'s optimistic arithmetic to the gateway's ABSOLUTE
            // count, healing any drift (a second device, a racing tap).
            socialSocket.postBookmarked.collect { event ->
                updateReel(event.postId) {
                    it.copy(isBookmarked = event.bookmarked, bookmarkCount = event.bookmarkCount.coerceAtLeast(0))
                }
            }
        }
    }

    private fun mine(actorId: String, liked: Boolean): Boolean? =
        if (actorId == sessionRepository.currentUserId) liked else null

    private fun applyLiveLike(reelId: String, likeCount: Int, liked: Boolean?) {
        updateReel(reelId) {
            it.copy(likeCount = likeCount.coerceAtLeast(0), isLiked = liked ?: it.isLiked)
        }
    }

    /**
     * Like optimiste : bascule locale immediate sur la projection [ReelPresentation], puis
     * routee vers [PostRepository.toggleLike] pour que le geste soit durable (outbox
     * [me.meeshy.sdk.outbox.OutboxLanes.SOCIAL], rejoue a la reconnexion) et que le cache du
     * feed reste la seule source de l'etat. Repli sur l'appel direct + rollback local
     * uniquement quand le reel n'est pas dans le cache du feed (thread d'affinite pur).
     */
    fun toggleLike(reelId: String) {
        val before = _state.value.reels.firstOrNull { it.id == reelId } ?: return
        updateReel(reelId) {
            it.copy(
                isLiked = !before.isLiked,
                likeCount = (before.likeCount + if (before.isLiked) -1 else 1).coerceAtLeast(0),
            )
        }
        viewModelScope.launch {
            val queued = postRepository.toggleLike(reelId)
            if (queued) return@launch
            val result = if (before.isLiked) postRepository.unlike(reelId) else postRepository.like(reelId)
            if (result is NetworkResult.Failure) {
                updateReel(reelId) { it.copy(isLiked = before.isLiked, likeCount = before.likeCount) }
            }
        }
    }

    /**
     * Bookmark optimiste : bascule locale immediate sur la projection [ReelPresentation], puis
     * routee vers [PostRepository.toggleBookmark] pour que le geste soit durable (outbox
     * [me.meeshy.sdk.outbox.OutboxLanes.SOCIAL], rejoue a la reconnexion) et que le cache du
     * feed reste la seule source de l'etat. Repli sur l'appel direct + rollback local
     * uniquement quand le reel n'est pas dans le cache du feed (thread d'affinite pur).
     */
    fun toggleBookmark(reelId: String) {
        val before = _state.value.reels.firstOrNull { it.id == reelId } ?: return
        updateReel(reelId) {
            it.copy(
                isBookmarked = !before.isBookmarked,
                bookmarkCount = (before.bookmarkCount + if (before.isBookmarked) -1 else 1).coerceAtLeast(0),
            )
        }
        viewModelScope.launch {
            val queued = postRepository.toggleBookmark(reelId)
            if (queued) return@launch
            val result = if (before.isBookmarked) {
                postRepository.removeBookmark(reelId)
            } else {
                postRepository.bookmark(reelId)
            }
            if (result is NetworkResult.Failure) {
                updateReel(reelId) { it.copy(isBookmarked = before.isBookmarked, bookmarkCount = before.bookmarkCount) }
            }
        }
    }

    /** Repost simple : compteur optimiste, rollback si echec. */
    fun repost(reelId: String) {
        val before = _state.value.reels.firstOrNull { it.id == reelId } ?: return
        updateReel(reelId) { it.copy(repostCount = before.repostCount + 1) }
        viewModelScope.launch {
            if (postRepository.repost(reelId) is NetworkResult.Failure) {
                updateReel(reelId) { it.copy(repostCount = before.repostCount) }
            }
        }
    }

    /** Comptabilise un partage — l'intent systeme est parti sans attendre le reseau. */
    fun recordShare(reelId: String) {
        viewModelScope.launch { postRepository.share(reelId) }
    }

    private fun updateReel(reelId: String, transform: (ReelPresentation) -> ReelPresentation) {
        _state.update { state ->
            state.copy(reels = state.reels.map { if (it.id == reelId) transform(it) else it })
        }
    }
}
