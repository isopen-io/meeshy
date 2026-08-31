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
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import java.util.concurrent.CancellationException
import javax.inject.Inject

data class ReelsUiState(
    val reels: List<ReelPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ReelsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
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

    init {
        observeRealtime()
    }

    /** Loads the vertical reel thread, optionally anchored at [seed] (a reel touched in the Feed). */
    fun load(seed: String? = null) {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = postRepository.getReels(seed)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(reels = ReelBuilder.build(result.data, config.socketUrl), isLoading = false)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.error.message)
                }
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
            sessions = sessions.begin(EngagementSurface.REELS, it, clock.nowMillis())
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
    }

    private fun mine(actorId: String, liked: Boolean): Boolean? =
        if (actorId == sessionRepository.currentUserId) liked else null

    private fun applyLiveLike(reelId: String, likeCount: Int, liked: Boolean?) {
        updateReel(reelId) {
            it.copy(likeCount = likeCount.coerceAtLeast(0), isLiked = liked ?: it.isLiked)
        }
    }

    /** Like optimiste : bascule locale immediate, rollback si le reseau refuse. */
    fun toggleLike(reelId: String) {
        val before = _state.value.reels.firstOrNull { it.id == reelId } ?: return
        updateReel(reelId) {
            it.copy(
                isLiked = !before.isLiked,
                likeCount = (before.likeCount + if (before.isLiked) -1 else 1).coerceAtLeast(0),
            )
        }
        viewModelScope.launch {
            val result = if (before.isLiked) postRepository.unlike(reelId) else postRepository.like(reelId)
            if (result is NetworkResult.Failure) {
                updateReel(reelId) { it.copy(isLiked = before.isLiked, likeCount = before.likeCount) }
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
