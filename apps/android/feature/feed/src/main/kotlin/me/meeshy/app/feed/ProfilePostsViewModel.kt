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
)

sealed interface ProfilePostsEvent {
    data class SelectFilter(val tapped: ProfilePostsFilter) : ProfilePostsEvent
    data class CardAppeared(val postId: String) : ProfilePostsEvent
}

sealed interface ProfilePostsEffect {
    data object PageFailed : ProfilePostsEffect
}

private data class ProfilePostsInternal(
    val posts: List<ApiPost> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = true,
    val hasLoaded: Boolean = false,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val filter: ProfilePostsFilter = ProfilePostsFilter.ALL,
    val window: ProfilePostsRenderWindow = ProfilePostsRenderWindow(),
    val stats: UserStats? = null,
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
) : ViewModel() {

    private var userId: String? = null
    private var loadJob: Job? = null
    private val model = MutableStateFlow(ProfilePostsInternal())
    private val _state = MutableStateFlow(ProfilePostsUiState())
    val state: StateFlow<ProfilePostsUiState> = _state.asStateFlow()
    private val effectChannel = Channel<ProfilePostsEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()
    private val projections = HashMap<String, Pair<ApiPost, FeedPostPresentation>>()
    private var projectedFor: LanguageResolver.ContentLanguagePreferences? = null

    init {
        viewModelScope.launch {
            combine(model, sessionRepository.currentUser) { data, user -> project(data, user) }
                .collect { _state.value = it }
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
        }
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
            val cached = projections[post.id]
            if (cached != null && cached.first === post) cached.second
            else FeedPostBuilder.build(post, prefs, config.apiBaseUrl).also { projections[post.id] = post to it }
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
        )
    }

    private fun samePrefs(a: LanguageResolver.ContentLanguagePreferences, b: LanguageResolver.ContentLanguagePreferences): Boolean =
        a.systemLanguage == b.systemLanguage && a.regionalLanguage == b.regionalLanguage &&
            a.customDestinationLanguage == b.customDestinationLanguage
}
