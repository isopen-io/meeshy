package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.EngagementSessions
import me.meeshy.sdk.model.EngagementSurface
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.QualifiedView
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import javax.inject.Inject

/**
 * A single post opened full-screen from the feed — the Android take on iOS `PostDetailView`.
 * Fetches the post by id, projects it through the shared [FeedPostBuilder] so the Prisme
 * language resolution matches the feed exactly, and lets the reader switch the displayed
 * language via the same per-post flag-tap rule the feed uses (SSOT with the chat bubble).
 *
 * There is no per-post cache yet, so a cold open shows a skeleton until the fetch answers;
 * a blank id (a malformed route) is surfaced as not-found rather than an endless spinner.
 *
 * The comment thread itself lives in [PostCommentsViewModel]; this VM only owns the header,
 * whose comment-count badge is kept honest by the same realtime room — a live
 * `comment:added`/`comment:deleted` for this post resyncs the badge to the server-authoritative
 * count the event carries (mirror of iOS `PostDetailViewModel` `commentAdded`/`commentDeleted`).
 */
data class PostDetailUiState(
    val post: FeedPostPresentation? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val showSkeleton: Boolean = false,
    val notFound: Boolean = false,
    val errorMessage: String? = null,
    val translatingLanguages: Set<String> = emptySet(),
    /**
     * The quote-repost composer currently open (the reader chose "Quote"), or `null` when
     * dismissed. Shares the [QuoteComposerState] value model with the feed so the sheet renders
     * identically. Mirror of iOS `PostDetailView`'s quote path — one better than iOS, which
     * offers only a content-less quote here (see [submitQuote]).
     */
    val quoteComposer: QuoteComposerState? = null,
    /**
     * Optimistic "this post is reposted" flag — set the instant the reader taps repost/quote so
     * the action reflects instantly, reverted on failure. Mirror of iOS `isPostReposted`.
     */
    val isReposted: Boolean = false,
)

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val clock: CacheClock,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val postId: String = savedStateHandle[POST_ID_ARG] ?: ""

    /**
     * Dwell bookkeeping for the post-detail surface. Held outside [_state] because it is an
     * analytics cursor, not something the UI renders (the same placement as
     * [me.meeshy.app.reels.ReelsViewModel.sessions]). The pure [EngagementSessions] machine owns
     * the *how* (monotonic dwell, qualification); this ViewModel owns the *when* — begin the moment
     * the detail opens, end when the screen leaves ([endDwellSession], driven by the screen's
     * `onDispose`) — and where the qualified view is reported.
     *
     * This is the port of iOS `PostDetailView`'s `.trackEngagement(surface: .detail)` modifier,
     * which runs *alongside* the immediate `viewPost` impression ([recordView]) rather than
     * replacing it: the impression counts the open, the dwell enriches it. Both land on the same
     * `posts/{id}/view` endpoint, and the gateway keeps them from double-counting — `creditPostView`
     * is a `(postId, userId)` singleton that increments `viewCount` once (the impression) and only
     * ever raises the stored dwell `duration` to the max it has seen (the enrichment).
     */
    private var sessions = EngagementSessions()

    private val rawPost = MutableStateFlow<ApiPost?>(null)
    private val activeCode = MutableStateFlow<String?>(null)
    private val status = MutableStateFlow(PostDetailStatus())

    /**
     * The post-detail realtime room's live overlay — server-authoritative comment count / like
     * count / viewer-own like state carried by the most recently received room event, or `null`
     * per-field when the header should reflect the fetched post's own value. A successful fetch
     * resets the whole overlay so fresh server truth always wins over a stale live value.
     */
    private data class LiveOverlay(
        val commentCount: Int? = null,
        val likeCount: Int? = null,
        val isLiked: Boolean? = null,
    )
    private val liveOverlay = MutableStateFlow(LiveOverlay())

    private val _state = MutableStateFlow(PostDetailUiState())
    val state: StateFlow<PostDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(rawPost, sessionRepository.currentUser, activeCode, status, liveOverlay) {
                post, user, active, st, overlay ->
                project(post, user, active, st, overlay)
            }.collect { projected -> _state.value = projected }
        }
        observeRealtime()
        loadInitial()
        recordView()
        beginDwell()
    }

    /**
     * Opens the dwell session for this detail-view the moment the screen appears — the clock starts
     * now, and [endDwellSession] closes it when the reader leaves. A blank route [postId] opens
     * nothing (there is no post to attribute the dwell to). Runs right after the immediate
     * [recordView] impression, mirroring iOS `PostDetailView`'s `.trackEngagement(.detail)` sitting
     * beside its `.task` view record.
     */
    private fun beginDwell() {
        if (postId.isBlank()) return
        sessions = sessions.begin(EngagementSurface.DETAIL, postId, clock.nowMillis())
    }

    /**
     * Closes the dwell session and, when it qualified (on-surface time ≥
     * [EngagementSessions.MIN_DWELL_MS]), records the measured dwell against this post. Driven by
     * the screen's `onDispose` so it runs while [viewModelScope] is still alive — the same seam
     * [me.meeshy.app.reels.ReelsScreen] uses via `setCurrentReel(null)`. Idempotent: a second call
     * (e.g. a later `onCleared`) finds no open session and records nothing. A sub-threshold glance
     * is dropped, so a reader who taps a post and immediately backs out never enriches its dwell.
     */
    fun endDwellSession() {
        val (next, view) = sessions.end(EngagementSurface.DETAIL, clock.nowMillis())
        sessions = next
        view?.let { recordDwellView(it) }
    }

    /**
     * Best-effort dwell enrichment for this post's existing view: `posts/{id}/view` with the
     * measured [QualifiedView.dwellMs]. The gateway's `creditPostView` is a `(postId, userId)`
     * singleton, so this never re-increments the view count already booked by [recordView] — it
     * only raises the stored dwell `duration` (the reco/monetisation watch-time signal) to its max.
     * Fire-and-forget, matching the [recordView] impression: a failure is analytics the reader
     * should never see fail.
     */
    private fun recordDwellView(view: QualifiedView) {
        viewModelScope.launch {
            try {
                postRepository.viewPost(view.postId, view.dwellMs.toInt())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // best-effort — matches the impression view record
            }
        }
    }

    /**
     * Fire-and-forget view record for this post, fired once per detail-view session
     * regardless of whether the post fetch itself succeeds — mirror of iOS `PostDetailView`'s
     * `.task { try? await PostService.shared.viewPost(...) }`. A blank route [postId] never
     * hits the network; a failure is silently ignored (best-effort analytics, never something
     * the reader should see fail).
     */
    private fun recordView() {
        if (postId.isBlank()) return
        viewModelScope.launch {
            try {
                postRepository.viewPost(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // best-effort — matches iOS `try?`
            }
        }
    }

    /**
     * The header's slice of the post-detail realtime room: joins [SocialSocketManager
     * .joinPostRoom] so live `comment:added`/`comment:deleted`/`post:liked`/`post:unliked` for
     * this post reach the client even when the viewer isn't otherwise implicitly subscribed via
     * a friend's feed room — resyncing the comment-count badge and like state/count to the
     * authoritative value each event carries (healing any drift from the thread VM's optimistic
     * arithmetic). A blank route [postId] never subscribes, and events for any other post are
     * ignored. Mirror of iOS `PostDetailViewModel` + `SocialSocketManager.joinPostRoom`.
     */
    private fun observeRealtime() {
        if (postId.isBlank()) return
        socialSocket.joinPostRoom(postId)
        viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                if (event.postId == postId) liveOverlay.update { it.copy(commentCount = event.commentCount) }
            }
        }
        viewModelScope.launch {
            socialSocket.commentDeleted.collect { event ->
                if (event.postId == postId) liveOverlay.update { it.copy(commentCount = event.commentCount) }
            }
        }
        viewModelScope.launch {
            socialSocket.postLiked.collect { event ->
                if (event.postId != postId) return@collect
                val mine = if (event.userId == currentUserId()) true else null
                liveOverlay.update { it.copy(likeCount = event.likesCount, isLiked = mine ?: it.isLiked) }
            }
        }
        viewModelScope.launch {
            socialSocket.postUnliked.collect { event ->
                if (event.postId != postId) return@collect
                val mine = if (event.userId == currentUserId()) false else null
                liveOverlay.update { it.copy(likeCount = event.likesCount, isLiked = mine ?: it.isLiked) }
            }
        }
    }

    /** Leaves the post-detail realtime room this VM joined in [observeRealtime]. */
    override fun onCleared() {
        if (postId.isNotBlank()) socialSocket.leavePostRoom(postId)
        super.onCleared()
    }

    private fun currentUserId(): String? = sessionRepository.currentUser.value?.id

    /**
     * First load. Guarded so a re-entrant call while a fetch is in flight or after the post
     * has already loaded is a no-op — [refresh] forces a reload. A blank [postId] (a malformed
     * route) is surfaced as not-found and never hits the network.
     */
    fun loadInitial() {
        if (postId.isBlank()) {
            status.update { it.copy(notFound = true) }
            return
        }
        if (status.value.isLoading || status.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetch()
    }

    /** Pull-to-refresh: re-fetch the post, keeping the current one visible meanwhile. */
    fun refresh() {
        if (postId.isBlank()) return
        status.update { it.copy(isRefreshing = true, error = null) }
        fetch()
    }

    private fun fetch() {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getPost(postId)) {
                    is NetworkResult.Success -> {
                        rawPost.value = result.data
                        liveOverlay.value = LiveOverlay()
                        status.update {
                            it.copy(isLoading = false, isRefreshing = false, hasLoaded = true, error = null)
                        }
                    }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isLoading = false, isRefreshing = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    /**
     * Tap on the post's Prisme language-flag chip: switch the displayed language, revert to
     * the default resolution when the chip is already active, or translate a configured-but-absent
     * language on demand and switch to it once it lands. Inert until the post has loaded. The pure
     * [LanguageFlagTapResolver] owns the decision — one rule shared with the feed and chat.
     */
    fun onFlagTap(code: String) {
        val post = rawPost.value ?: return
        val preferences: LanguageResolver.ContentLanguagePreferences =
            sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = FeedPostBuilder.resolveActiveCode(post, preferences, activeCode.value),
            originalLanguage = post.originalLanguage,
            translations = post.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate -> activeCode.value = result.code
            LanguageFlagTapResolver.Result.Revert -> activeCode.value = null
            is LanguageFlagTapResolver.Result.RequestTranslation ->
                requestOnDemandTranslation(result.targetLanguage)
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * Simple repost (no commentary) of the open post. Routed through the tested [RepostCommand]
     * SSOT, which resolves the ROOT target when the open post is itself a repost — iOS's
     * `PostDetailView.toggleDetailRepost` reposts by the raw `postId` and so embeds an empty
     * share card when re-sharing a share; Android fixes that here. Inert until the post has
     * loaded (nothing to repost).
     */
    fun repost() {
        val post = rawPost.value ?: return
        sendRepost(RepostCommand.of(post.id, post.repostOf, quote = false, commentary = null))
    }

    /**
     * Open the quote-repost composer for the open post — inert until it has loaded. Seeds a
     * [QuoteComposerState] with the source author and a trimmed content preview so the sheet
     * renders the embed. Mirror of the feed's `beginQuote`, scoped to the single open post.
     */
    fun beginQuote() {
        val post = rawPost.value ?: return
        status.update {
            it.copy(
                quoteComposer = QuoteComposerState(
                    postId = post.id,
                    sourceAuthorName = (post.author?.displayName ?: post.author?.username)
                        ?.takeIf { name -> name.isNotBlank() },
                    sourceContentPreview = post.content.orEmpty().trim(),
                ),
            )
        }
    }

    fun onQuoteTextChange(text: String) {
        status.update { st -> st.quoteComposer?.let { st.copy(quoteComposer = it.copy(text = text)) } ?: st }
    }

    fun cancelQuote() {
        status.update { it.copy(quoteComposer = null) }
    }

    /**
     * Publish the quote: repost the ROOT of the open post carrying the trimmed commentary. A
     * blank/whitespace-only commentary degrades to a simple repost (surpasses iOS, which would
     * send `content = ""`). The sheet closes immediately (iOS dismisses immediately too); a
     * failure surfaces via [PostDetailUiState.errorMessage] and reverts the optimistic flag.
     */
    fun submitQuote() {
        val composer = status.value.quoteComposer ?: return
        val post = rawPost.value ?: return
        val command = RepostCommand.of(composer.postId, post.repostOf, quote = true, commentary = composer.text)
        status.update { it.copy(quoteComposer = null) }
        sendRepost(command)
    }

    private fun sendRepost(command: RepostCommand) {
        if (status.value.isRepostInFlight) return
        status.update { it.copy(isRepostInFlight = true, isReposted = true, error = null) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.repost(command.targetId, content = command.content, isQuote = command.isQuote)) {
                    is NetworkResult.Success ->
                        status.update { it.copy(isRepostInFlight = false) }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isRepostInFlight = false, isReposted = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isRepostInFlight = false, isReposted = false, error = e.message) }
            }
        }
    }

    /**
     * The viewer tapped a configured language the post has no content for yet: translate it on
     * demand, swap the freshly-merged post into [rawPost] (so the strip's translatable chip becomes
     * a live content chip), and point [activeCode] at it so the reader lands on the translation. A
     * failed or inert translation leaves the strip untouched to retry; a second tap while the request
     * is in flight is ignored via [PostDetailStatus.translating]. Mirror of the feed card's
     * `requestOnDemandTranslation`, scoped to the single open post.
     */
    private fun requestOnDemandTranslation(targetLanguage: String) {
        val post = rawPost.value ?: return
        if (targetLanguage in status.value.translating) return
        status.update { it.copy(translating = it.translating + targetLanguage) }
        viewModelScope.launch {
            try {
                val merged = postRepository.translatePost(post, targetLanguage)
                if (merged != null) {
                    rawPost.value = merged
                    activeCode.value = targetLanguage
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(error = e.message) }
            } finally {
                status.update { it.copy(translating = it.translating - targetLanguage) }
            }
        }
    }

    private fun project(
        post: ApiPost?,
        user: MeeshyUser?,
        active: String?,
        st: PostDetailStatus,
        overlay: LiveOverlay,
    ): PostDetailUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = post?.let {
            FeedPostBuilder.build(it, prefs, config.socketUrl, activeLanguageCode = active, currentUserId = user?.id)
        }?.let { presentation ->
            presentation.copy(
                commentCount = overlay.commentCount?.coerceAtLeast(0) ?: presentation.commentCount,
                likeCount = overlay.likeCount?.coerceAtLeast(0) ?: presentation.likeCount,
                isLiked = overlay.isLiked ?: presentation.isLiked,
            )
        }
        val showSkeleton = st.isLoading && post == null && !st.notFound && st.error == null
        return PostDetailUiState(
            post = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            showSkeleton = showSkeleton,
            notFound = st.notFound,
            errorMessage = st.error,
            translatingLanguages = st.translating,
            quoteComposer = st.quoteComposer,
            isReposted = st.isReposted,
        )
    }

    companion object {
        const val POST_ID_ARG = "postId"
    }
}

private data class PostDetailStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasLoaded: Boolean = false,
    val notFound: Boolean = false,
    val error: String? = null,
    val translating: Set<String> = emptySet(),
    val quoteComposer: QuoteComposerState? = null,
    val isReposted: Boolean = false,
    val isRepostInFlight: Boolean = false,
)
