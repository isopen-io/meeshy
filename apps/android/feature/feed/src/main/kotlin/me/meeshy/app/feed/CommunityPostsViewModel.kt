package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostEngagementPatch
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UserPostsCacheRepository
import me.meeshy.sdk.post.UserPostsSnapshot
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import javax.inject.Inject

/** L'onglet Publications du détail d'une communauté, tel que l'écran le peint. */
@Immutable
data class CommunityPostsUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val showSkeleton: Boolean = false,
    val isLoadingMore: Boolean = false,
    /** La première page n'a pas répondu et rien n'est peint : l'écran le dit, avec « Réessayer ». */
    val failed: Boolean = false,
    /** La passerelle a répondu : la communauté n'a aucune publication que le lecteur peut lire. */
    val isEmpty: Boolean = false,
    val quoteComposer: QuoteComposerState? = null,
    val notice: FeedNotice? = null,
)

private data class CommunityPostsStatus(
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val failed: Boolean = false,
)

/**
 * Les publications d'une communauté (#16879, miroir de l'onglet Publications de `CommunityDetailView`
 * iOS) : la copie du disque se peint avant le réseau, une copie périmée se revalide en silence, le
 * squelette ne paraît que sur un cache vide, et un échec ne se dit que quand rien n'est peint. Les
 * gestes des cartes sont ceux du fil ([ListedPostActions]) ; les événements en direct (suppression,
 * j'aime, commentaires) suivent la liste ouverte comme celle des favoris.
 */
@HiltViewModel
class CommunityPostsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    reports: ReportRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    socialSocket: SocialSocketManager,
    private val cache: UserPostsCacheRepository,
) : ViewModel() {

    private var communityId: String? = null
    private var loadJob: Job? = null
    private var listTicket: AccountTicket? = null

    private val listState = MutableStateFlow(PostPageListState())
    private val status = MutableStateFlow(CommunityPostsStatus())

    private val _state = MutableStateFlow(CommunityPostsUiState())
    val state: StateFlow<CommunityPostsUiState> = _state.asStateFlow()

    private val actions = ListedPostActions(viewModelScope, postRepository, reports, listState, socialSocket.listedPostTranslations()) { sessionRepository.currentUser.value }

    /** Ce que font les cartes : les gestes du fil, chacun câblé. */
    val cards: ListedPostCardActions get() = actions

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status, actions.state) { list, user, st, gestures ->
                project(list, user, st, gestures)
            }.collect { _state.value = it }
        }
        followLive(socialSocket)
    }

    /** Lie l'onglet à [communityId] ; ré-appelé pour la même communauté (ou un identifiant vide), ne fait rien. */
    fun bind(communityId: String) {
        if (communityId.isBlank() || communityId == this.communityId) return
        this.communityId = communityId
        loadJob?.cancel()
        listState.value = PostPageListState()
        status.value = CommunityPostsStatus(isLoading = true)
        loadJob = viewModelScope.launch { loadInitial(communityId) }
    }

    /** « Réessayer » après un échec sans copie : relit la première page. */
    fun retry() {
        val id = communityId ?: return
        if (status.value.isLoading) return
        status.value = CommunityPostsStatus(isLoading = true)
        loadJob = viewModelScope.launch { fetchFirstPage(id, replacing = false) }
    }

    private suspend fun loadInitial(id: String) {
        val held = try {
            cache.cachedCommunity(id)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            CacheResult.Empty
        }
        val snapshot = when (held) {
            is CacheResult.Fresh -> held.value
            is CacheResult.Stale -> held.value
            is CacheResult.Syncing -> held.value
            CacheResult.Empty -> null
        }
        if (snapshot != null) {
            listTicket = cache.ticket()
            listState.value = PostPageListState(snapshot.posts, snapshot.nextCursor, snapshot.hasMore, hasLoaded = true)
            status.update { it.copy(isLoading = false) }
        }
        if (held is CacheResult.Fresh) return
        fetchFirstPage(id, replacing = snapshot != null)
    }

    /** [replacing] : une copie est déjà peinte — la page l'écrase, et un échec ne dit rien. */
    private suspend fun fetchFirstPage(id: String, replacing: Boolean) {
        val result = try {
            val ticket = cache.ticket()
            postRepository.getCommunityPostsPage(id, cursor = null).also { if (it is NetworkResult.Success) listTicket = ticket }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (result !is NetworkResult.Success) {
            status.update { it.copy(isLoading = false, failed = !replacing) }
            return
        }
        listState.value = PostPageListState().foldPage(result.data)
        status.update { it.copy(isLoading = false, failed = false) }
        persistCurrent(id)
    }

    /** Défilement infini : la page suivante part quand la fin approche ; un échec se tait (le prochain défilement relance). */
    fun loadMoreIfNeeded(postId: String) {
        val id = communityId ?: return
        val posts = _state.value.posts
        val index = posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore) return
        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                val result = postRepository.getCommunityPostsPage(id, cursor = list.cursor)
                if (result is NetworkResult.Success) {
                    listState.update { it.foldPage(result.data) }
                    persistCurrent(id)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silencieux : le prochain défilement relance.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    private suspend fun persistCurrent(id: String) {
        val list = listState.value
        if (!list.hasLoaded) return
        try {
            cache.persistCommunity(id, UserPostsSnapshot(list.posts, list.cursor, list.hasMore), listTicket)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Le disque est un confort : une écriture manquée ne change rien à l'écran.
        }
    }

    private fun followLive(socket: SocialSocketManager) {
        follow(socket.postDeleted) { list, e -> list.removed(e.postId) }
        follow(socket.postLiked) { list, e -> list.patched(e.postId) { PostEngagementPatch.liked(it, e.likesCount, mine(e.userId, true)) } }
        follow(socket.postUnliked) { list, e -> list.patched(e.postId) { PostEngagementPatch.liked(it, e.likesCount, mine(e.userId, false)) } }
        follow(socket.commentAdded) { list, e -> list.patched(e.postId) { PostEngagementPatch.commented(it, e.commentCount) } }
        follow(socket.commentDeleted) { list, e -> list.patched(e.postId) { PostEngagementPatch.commented(it, e.commentCount) } }
    }

    /** Le cœur ne suit que le geste du lecteur ; celui de n'importe qui déplace le total (loi de `PostEngagementBinding`). */
    private fun mine(actorId: String, liked: Boolean): Boolean? =
        liked.takeIf { actorId.isNotBlank() && actorId == sessionRepository.currentUser.value?.id }

    private fun <E> follow(events: Flow<E>, fold: (PostPageListState, E) -> PostPageListState) {
        viewModelScope.launch {
            events.collect { event ->
                try {
                    listState.update { fold(it, event) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Un événement illisible est ignoré : la collecte continue.
                }
            }
        }
    }

    private fun project(
        list: PostPageListState,
        user: MeeshyUser?,
        st: CommunityPostsStatus,
        gestures: ListedPostCardsState,
    ): CommunityPostsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map {
            FeedPostBuilder.build(it, prefs, config.apiBaseUrl, gestures.languageOverrides[it.id], currentUserId = user?.id)
        }
        return CommunityPostsUiState(
            posts = projected,
            showSkeleton = st.isLoading && projected.isEmpty(),
            isLoadingMore = st.isLoadingMore,
            failed = st.failed && projected.isEmpty(),
            isEmpty = list.hasLoaded && projected.isEmpty() && !st.isLoading,
            quoteComposer = gestures.quoteComposer,
            notice = gestures.notice,
        )
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}
