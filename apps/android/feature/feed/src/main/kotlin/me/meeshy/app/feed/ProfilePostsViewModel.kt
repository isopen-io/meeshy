package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.ImpressionSource
import me.meeshy.sdk.model.analytics.OpenOrigin
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import me.meeshy.sdk.model.profile.PostEngagementOverlay
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.post.FeedEngagementRepository
import me.meeshy.sdk.post.ImpressionBatcher
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.profile.ProfilePostKind
import me.meeshy.sdk.model.profile.ProfilePostsCounts
import me.meeshy.sdk.model.profile.ProfilePostsEmptyKind
import me.meeshy.sdk.model.profile.ProfilePostsFilter
import me.meeshy.sdk.model.profile.ProfilePostsRenderWindow
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/**
 * L'onglet Postes de la fiche (miroir de `ProfileUserPostsViewModel` iOS) : cache d'abord (fresh / stale /
 * expiré / vide se distinguent), revalidation silencieuse, filtre APPLIQUÉ AVANT la fenêtre de rendu, fenêtre
 * qui grandit par anticipation avant de demander la page réseau suivante. Le squelette ne paraît que sur
 * un cache vide.
 */
@Immutable
data class ProfilePostsUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val filter: ProfilePostsFilter = ProfilePostsFilter.ALL,
    val counts: ProfilePostsCounts = ProfilePostsCounts.EMPTY,
    val showSkeleton: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showsEndFooter: Boolean = false,
    val firstPublishedAtIso: String? = null,
    val empty: ProfilePostsEmptyKind = ProfilePostsEmptyKind.NONE,
    val currentUserId: String? = null,
    val dialog: ProfilePostDialog? = null,
)

sealed interface ProfilePostsEvent {
    data class SelectFilter(val tapped: ProfilePostsFilter) : ProfilePostsEvent
    data class CardAppeared(val postId: String) : ProfilePostsEvent
    data class Impression(val postId: String) : ProfilePostsEvent
    data class ToggleLike(val postId: String) : ProfilePostsEvent
    data class ToggleBookmark(val postId: String) : ProfilePostsEvent
    data class Repost(val postId: String) : ProfilePostsEvent
    /** « Citer » (#12234) : ouvre le compositeur de citation sur la carte touchée. */
    data class BeginQuote(val postId: String) : ProfilePostsEvent
    data class QuoteTextChanged(val text: String) : ProfilePostsEvent
    data object SubmitQuote : ProfilePostsEvent
    data class Shared(val postId: String) : ProfilePostsEvent
    data class Pin(val postId: String) : ProfilePostsEvent
    data class RequestDelete(val postId: String) : ProfilePostsEvent
    data class RequestReport(val postId: String) : ProfilePostsEvent
    data class ConfirmReport(val reason: ReportReason) : ProfilePostsEvent
    data object ConfirmDelete : ProfilePostsEvent
    data object DismissDialog : ProfilePostsEvent
    data class RequestTranslation(val postId: String, val language: String) : ProfilePostsEvent
}

sealed interface ProfilePostsEffect {
    data object PageFailed : ProfilePostsEffect
    data class Notice(val notice: FeedNotice) : ProfilePostsEffect
}

internal data class ProfilePostsInternal(
    val posts: List<ApiPost> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = true,
    val hasLoaded: Boolean = false,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val filter: ProfilePostsFilter = ProfilePostsFilter.ALL,
    val window: ProfilePostsRenderWindow = ProfilePostsRenderWindow(),
    val stats: UserStats? = null,
    val overlay: PostEngagementOverlay = PostEngagementOverlay(),
    val dialog: ProfilePostDialog? = null,
) {
    val filtered: List<ApiPost> get() = posts.filter { filter.accepts(ProfilePostKind.of(it.type)) }
}

@HiltViewModel
class ProfilePostsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val cache: UserPostsCacheRepository,
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    val toasts: FeedbackToastCenter,
    private val reports: ReportRepository,
    private val socialSocket: SocialSocketManager,
    private val engagement: FeedEngagementRepository,
) : ViewModel() {

    /** Ses propres scope et job : le vidage de `onCleared()` ne court pas contre sa propre annulation. */
    private val impressions = ImpressionBatcher(
        source = ImpressionSource.PROFILE,
        surface = ContentSurface.PROFILE,
        deliver = engagement::deliver,
    )

    private var userId: String? = null
    private var loadJob: Job? = null
    private val model = MutableStateFlow(ProfilePostsInternal())
    private val _state = MutableStateFlow(ProfilePostsUiState())
    val state: StateFlow<ProfilePostsUiState> = _state.asStateFlow()
    private val effectChannel = Channel<ProfilePostsEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()
    private val projections = HashMap<String, Projection>()
    private var projectedFor: LanguageResolver.ContentLanguagePreferences? = null

    init {
        viewModelScope.launch {
            combine(model, sessionRepository.currentUser) { data, user -> project(data, user) }
                .collect { _state.value = it }
        }
        viewModelScope.launch {
            collectProfilePostsRealtime(
                socket = socialSocket,
                profileUserId = { userId },
                currentUserId = { sessionRepository.currentUserId },
                update = { transform -> model.update(transform) },
            )
        }
    }

    /** Vide le lot d'impressions à la sortie de la liste (jamais un lot par carte). */
    fun flushImpressions() = impressions.flushNowAsync()

    override fun onCleared() {
        super.onCleared()
        impressions.flushNowAsync()
    }

    /** L'engagement d'ouverture (origine profil), émis À CHAQUE toucher : aucune fenêtre ne tait une réouverture. */
    fun recordOpen(postId: String) {
        if (postId.isEmpty()) return
        viewModelScope.launch {
            try {
                engagement.deliver(listOf(StampedSocialEvent.stamping(SocialEvent.Open(postId, OpenOrigin.PROFILE), System.currentTimeMillis())))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Une mesure manquée ne gêne jamais l'ouverture.
            }
        }
    }

    /** Lie l'onglet à [userId] ; ré-appelé pour la même personne, ne fait rien. */
    fun bind(userId: String) {
        if (userId.isBlank() || userId == this.userId) return
        this.userId = userId
        loadJob?.cancel()
        projections.clear()
        model.value = ProfilePostsInternal()
        loadJob = viewModelScope.launch { loadInitial(userId) }
        viewModelScope.launch { loadStats(userId) }
    }

    fun onEvent(event: ProfilePostsEvent) {
        when (event) {
            is ProfilePostsEvent.SelectFilter -> model.update {
                val next = it.filter.toggled(event.tapped)
                it.copy(filter = next, window = it.window.reset())
            }
            is ProfilePostsEvent.CardAppeared -> onCardAppeared(event.postId)
            is ProfilePostsEvent.Impression -> impressions.record(event.postId)
            is ProfilePostsEvent.ToggleLike -> toggleLike(event.postId)
            is ProfilePostsEvent.ToggleBookmark -> toggleBookmark(event.postId)
            is ProfilePostsEvent.Repost -> repost(event.postId, quote = false, commentary = null)
            is ProfilePostsEvent.BeginQuote -> postOf(event.postId)?.let { post ->
                model.update { it.copy(dialog = ProfilePostDialog.Quote(QuoteComposerState.quoting(post, sessionRepository.currentUser.value))) }
            }
            is ProfilePostsEvent.QuoteTextChanged -> model.update { st ->
                (st.dialog as? ProfilePostDialog.Quote)?.let { st.copy(dialog = it.copy(composer = it.composer.copy(text = event.text))) } ?: st
            }
            ProfilePostsEvent.SubmitQuote -> confirmDialog {
                (it as? ProfilePostDialog.Quote)?.let { d -> repost(d.postId, quote = true, commentary = d.composer.text) }
            }
            is ProfilePostsEvent.Shared -> shared(event.postId)
            is ProfilePostsEvent.Pin -> pin(event.postId)
            is ProfilePostsEvent.RequestDelete -> model.update { it.copy(dialog = ProfilePostDialog.ConfirmDelete(event.postId)) }
            is ProfilePostsEvent.RequestReport -> model.update { it.copy(dialog = ProfilePostDialog.ChooseReport(event.postId)) }
            ProfilePostsEvent.DismissDialog -> model.update { it.copy(dialog = null) }
            ProfilePostsEvent.ConfirmDelete -> confirmDialog { (it as? ProfilePostDialog.ConfirmDelete)?.let { d -> delete(d.postId) } }
            is ProfilePostsEvent.ConfirmReport -> confirmDialog { (it as? ProfilePostDialog.ChooseReport)?.let { d -> report(d.postId, event.reason) } }
            is ProfilePostsEvent.RequestTranslation -> requestTranslation(event.postId, event.language)
        }
    }

    private inline fun confirmDialog(act: (ProfilePostDialog?) -> Unit) {
        val pending = model.value.dialog
        model.update { it.copy(dialog = null) }
        act(pending)
    }

    private fun notice(notice: FeedNotice) {
        effectChannel.trySend(ProfilePostsEffect.Notice(notice))
    }

    private fun postOf(postId: String): ApiPost? = model.value.posts.firstOrNull { it.id == postId }

    private suspend fun <T> attempt(call: suspend () -> NetworkResult<T>?): NetworkResult<T>? =
        try {
            call()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }

    /** Le cœur se remplit tout de suite ; un refus remet l'état d'avant et le dit. */
    private fun toggleLike(postId: String) {
        val post = postOf(postId) ?: return
        val current = model.value.overlay.isLiked(post)
        model.update { it.copy(overlay = it.overlay.withLike(postId, !current)) }
        viewModelScope.launch {
            val result = attempt { if (current) postRepository.unlike(postId) else postRepository.like(postId) }
            if (result is NetworkResult.Success) return@launch
            model.update { it.copy(overlay = it.overlay.withLike(postId, current)) }
            notice(FeedNotice.LIKE_FAILED)
        }
    }

    private fun toggleBookmark(postId: String) {
        val post = postOf(postId) ?: return
        val current = model.value.overlay.isBookmarked(post)
        model.update { it.copy(overlay = it.overlay.withBookmark(postId, !current)) }
        viewModelScope.launch {
            val result = attempt { if (current) postRepository.removeBookmark(postId) else postRepository.bookmark(postId) }
            if (result is NetworkResult.Success) return@launch
            model.update { it.copy(overlay = it.overlay.withBookmark(postId, current)) }
            notice(FeedNotice.BOOKMARK_FAILED)
        }
    }

    /**
     * Append-only : la surcharge ne persiste que si le serveur confirme ; sinon elle est retirée. Une citation suit la
     * même règle, avec son commentaire (vers la RACINE, au format de la carte — [RepostCommand]).
     */
    private fun repost(postId: String, quote: Boolean, commentary: String?) {
        val post = postOf(postId) ?: return
        if (!model.value.overlay.canRepost(post)) return
        model.update { it.copy(overlay = it.overlay.withRepost(postId)) }
        val command = RepostCommand.of(postId, post.repostOf, quote = quote, commentary = commentary, cardType = post.type)
        viewModelScope.launch {
            val result = attempt {
                postRepository.repost(command.targetId, targetType = command.targetType, content = command.content, isQuote = command.isQuote)
            }
            if (result is NetworkResult.Success) {
                notice(FeedNotice.REPOSTED)
            } else {
                model.update { it.copy(overlay = it.overlay.withoutRepost(postId)) }
                notice(FeedNotice.REPOST_FAILED)
            }
        }
    }

    private fun shared(postId: String) {
        if (postOf(postId) == null) return
        model.update { it.copy(overlay = it.overlay.sharedOnce(postId)) }
        viewModelScope.launch {
            val result = attempt { postRepository.share(postId) }
            if (result !is NetworkResult.Success) model.update { it.copy(overlay = it.overlay.unsharedOnce(postId)) }
        }
    }

    private fun pin(postId: String) {
        viewModelScope.launch {
            val ok = attempt { postRepository.pinPost(postId) } is NetworkResult.Success
            notice(if (ok) FeedNotice.PINNED else FeedNotice.PIN_FAILED)
        }
    }

    /** Retrait immédiat ; un refus remet la carte À SA PLACE. */
    private fun delete(postId: String) {
        val before = model.value.posts
        val index = before.indexOfFirst { it.id == postId }
        val removed = before.getOrNull(index) ?: return
        model.update { it.copy(posts = it.posts.filterNot { p -> p.id == postId }) }
        viewModelScope.launch {
            if (attempt { postRepository.delete(postId) } is NetworkResult.Success) {
                notice(FeedNotice.DELETED)
                persistCurrent()
            } else {
                model.update { cur ->
                    if (cur.posts.any { it.id == postId }) cur
                    else cur.copy(posts = cur.posts.toMutableList().also { it.add(index.coerceAtMost(it.size), removed) })
                }
                notice(FeedNotice.DELETE_FAILED)
            }
        }
    }

    private fun report(postId: String, reason: ReportReason) {
        viewModelScope.launch {
            val sent = attempt { reports.reportPost(postId, reason, details = null) } is NetworkResult.Success
            notice(if (sent) FeedNotice.REPORTED else FeedNotice.REPORT_FAILED)
        }
    }

    /** Le drapeau de langue non chargé demande sa traduction ; la socket la range à l'arrivée. Silencieux. */
    private fun requestTranslation(postId: String, language: String) {
        viewModelScope.launch { attempt { postRepository.requestTranslation(postId, language) } }
    }

    private suspend fun persistCurrent() {
        val uid = userId ?: return
        val after = model.value
        runCatching { cache.persist(uid, UserPostsSnapshot(after.posts, after.nextCursor, after.hasMore), cache.ticket()) }
    }

    private suspend fun loadInitial(userId: String) {
        val cached = try {
            cache.cached(userId)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            CacheResult.Empty
        }
        when (cached) {
            is CacheResult.Fresh -> apply(cached.value, loaded = true)
            is CacheResult.Stale -> { apply(cached.value, loaded = true); fetch(userId, cursor = null) }
            is CacheResult.Syncing -> { cached.value?.let { apply(it, loaded = true) }; fetch(userId, cursor = null) }
            CacheResult.Empty -> {
                model.update { it.copy(isLoading = true) }
                fetch(userId, cursor = null)
                model.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun apply(snapshot: UserPostsSnapshot, loaded: Boolean) {
        model.update {
            it.copy(posts = snapshot.posts, nextCursor = snapshot.nextCursor, hasMore = snapshot.hasMore, hasLoaded = loaded)
        }
    }

    private suspend fun loadStats(userId: String) {
        try {
            val result = userRepository.getUserStats(userId)
            if (result is NetworkResult.Success) model.update { it.copy(stats = result.data) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Silencieux : le bandeau retombe sur les valeurs dérivées.
        }
    }

    /** Une page réseau ; `true` quand elle a répondu. Un échec laisse la liste et prévient d'un toast. */
    private suspend fun fetch(userId: String, cursor: String?): Boolean {
        val ticket = cache.ticket()
        val result = try {
            postRepository.getUserPostsPage(userId, cursor = cursor)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (this.userId != userId) return false
        if (result !is NetworkResult.Success) {
            effectChannel.trySend(ProfilePostsEffect.PageFailed)
            return false
        }
        val page = result.data
        model.update { current ->
            val known = current.posts.mapTo(HashSet()) { it.id }
            val merged = if (cursor == null) {
                val fetchedIds = page.posts.mapTo(HashSet()) { it.id }
                page.posts + current.posts.filter { it.id !in fetchedIds }
            } else {
                current.posts + page.posts.filter { it.id !in known }
            }
            val keepsDeeperCursor = cursor == null && current.posts.isNotEmpty()
            current.copy(
                posts = merged,
                overlay = current.overlay.reconciledWith(merged),
                nextCursor = if (keepsDeeperCursor) current.nextCursor else page.nextCursor,
                hasMore = if (keepsDeeperCursor) current.hasMore else page.hasMore,
                hasLoaded = true,
            )
        }
        val after = model.value
        runCatching { cache.persist(userId, UserPostsSnapshot(after.posts, after.nextCursor, after.hasMore), ticket) }
        return true
    }

    private fun onCardAppeared(postId: String) {
        val data = model.value
        val visible = data.filtered.take(data.window.visibleCount(data.filtered.size))
        val index = visible.indexOfFirst { it.id == postId }
        if (index < 0 || !data.window.isNearTail(index, visible.size)) return
        val armed = data.window.schedulingReveal() ?: return
        model.update { it.copy(window = armed) }
        viewModelScope.launch {
            try {
                revealOrLoadMore()
            } finally {
                model.update { it.copy(window = it.window.revealSettled()) }
            }
        }
    }

    private suspend fun revealOrLoadMore() {
        val data = model.value
        if (data.window.hasMoreToRender(data.filtered.size)) {
            model.update { it.copy(window = it.window.grown(it.filtered.size)) }
            return
        }
        val uid = userId ?: return
        if (!data.hasMore || data.isLoading || data.isLoadingMore) return
        model.update { it.copy(isLoadingMore = true) }
        val before = data.posts.size
        try {
            val ok = fetch(uid, data.nextCursor)
            if (ok && model.value.hasMore && model.value.posts.size == before) {
                model.update { it.copy(hasMore = false) }
            }
        } finally {
            model.update { it.copy(isLoadingMore = false, window = it.window.grown(it.filtered.size)) }
        }
    }

    private fun project(data: ProfilePostsInternal, user: MeeshyUser?): ProfilePostsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        if (projectedFor != null && projectedFor !== prefs && !samePrefs(projectedFor!!, prefs)) projections.clear()
        projectedFor = prefs
        val filtered = data.filtered
        val visible = filtered.take(data.window.visibleCount(filtered.size)).map { post ->
            val stamp = engagementStamp(data.overlay, post)
            val cached = projections[post.id]
            if (cached != null && cached.first === post && cached.stamp == stamp) cached.presentation
            else FeedPostBuilder.build(data.overlay.applied(post), prefs, config.apiBaseUrl)
                .also { projections[post.id] = Projection(post, stamp, it) }
        }
        val counts = ProfilePostsCounts
            .derived(data.posts.map { ProfilePostKind.of(it.type) }, data.hasMore)
            .merging(data.stats)
        return ProfilePostsUiState(
            posts = visible,
            filter = data.filter,
            counts = counts,
            showSkeleton = data.isLoading && data.posts.isEmpty(),
            isLoadingMore = data.isLoadingMore,
            showsEndFooter = data.hasLoaded && !data.hasMore && data.posts.isNotEmpty(),
            firstPublishedAtIso = data.posts.lastOrNull()?.createdAt,
            empty = ProfilePostsEmptyKind.of(data.filter, data.posts.size, filtered.size, data.hasMore, data.isLoading),
            currentUserId = user?.id,
            dialog = data.dialog,
        )
    }

    private fun samePrefs(a: LanguageResolver.ContentLanguagePreferences, b: LanguageResolver.ContentLanguagePreferences): Boolean =
        a.systemLanguage == b.systemLanguage && a.regionalLanguage == b.regionalLanguage &&
            a.customDestinationLanguage == b.customDestinationLanguage
}

private class Projection(val first: ApiPost, val stamp: List<Any?>, val presentation: FeedPostPresentation)

/** Ce qui, dans la surcharge, change le rendu d'UNE carte : la mémo n'est valide que tant qu'il est identique. */
private fun engagementStamp(overlay: PostEngagementOverlay, post: ApiPost): List<Any?> = listOf(
    overlay.isLiked(post), overlay.likeCount(post),
    overlay.isBookmarked(post), overlay.bookmarkCount(post),
    overlay.isReposted(post), overlay.repostCount(post),
    overlay.shareCount(post),
)

/** Le post tel que le lecteur doit le voir : base servie + surcharge optimiste. */
internal fun PostEngagementOverlay.applied(post: ApiPost): ApiPost = post.copy(
    isLikedByMe = isLiked(post), likeCount = likeCount(post),
    isBookmarkedByMe = isBookmarked(post), bookmarkCount = bookmarkCount(post),
    isRepostedByMe = isReposted(post), repostCount = repostCount(post),
    shareCount = shareCount(post),
)
