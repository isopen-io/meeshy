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
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostHashtagRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class HashtagResultsUiState(
    val tag: String = "",
    val posts: List<FeedPostPresentation> = emptyList(),
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    /** L'échec d'un premier chargement sans rien à montrer : l'écran offre « Réessayer ». */
    val loadFailed: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Les résultats d'un hashtag — port de `HashtagResultsViewModel` d'iOS. Cache-first : la
 * première page déjà vue s'affiche à l'ouverture (jamais de squelette dessus) et se
 * revalide en silence. Le texte de chaque post descend le Prisme par [FeedPostBuilder],
 * comme le fil. Le cœur est optimiste, avec retour à l'instantané si le serveur refuse.
 */
@HiltViewModel
class HashtagResultsViewModel @Inject constructor(
    private val hashtags: PostHashtagRepository,
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val tag: String = (savedStateHandle[TAG_ARG] ?: "").removePrefix("#").trim().lowercase()

    private val listState = MutableStateFlow(
        hashtags.cachedFirstPage(tag)?.let { PostPageListState().foldPage(it) } ?: PostPageListState(),
    )
    private val status = MutableStateFlow(HashtagStatus())

    private val _state = MutableStateFlow(HashtagResultsUiState(tag = tag))
    val state: StateFlow<HashtagResultsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status) { list, user, st ->
                project(list, user, st)
            }.collect { projected -> _state.value = projected }
        }
        revalidate(refreshing = false)
    }

    fun refresh() = revalidate(refreshing = true)

    fun retry() = revalidate(refreshing = false)

    private fun revalidate(refreshing: Boolean) {
        if (tag.isBlank() || status.value.isFetching) return
        status.update { it.copy(isFetching = true, isRefreshing = refreshing, error = null) }
        viewModelScope.launch {
            try {
                when (val result = hashtags.posts(tag, cursor = null)) {
                    is NetworkResult.Success -> listState.value = PostPageListState().foldPage(result.data)
                    is NetworkResult.Failure -> status.update { it.copy(error = result.error.message ?: "") }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(error = e.message ?: "") }
            } finally {
                status.update { it.copy(isFetching = false, isRefreshing = false) }
            }
        }
    }

    /** Défilement infini : à moins de [LOAD_MORE_THRESHOLD] cartes de la fin, la page suivante. */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore || status.value.isFetching) return

        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = hashtags.posts(tag, cursor = list.cursor)) {
                    is NetworkResult.Success -> listState.update { it.foldPage(result.data) }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Une page perdue n'est pas la fin de la liste : le prochain défilement la redemande.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun toggleLike(postId: String) {
        val snapshot = listState.value
        val wasLiked = snapshot.posts.firstOrNull { it.id == postId }?.isLikedByMe == true
        val next = snapshot.liked(postId, liked = !wasLiked)
        if (next === snapshot) return
        listState.value = next
        viewModelScope.launch {
            try {
                val result = if (wasLiked) postRepository.unlike(postId) else postRepository.like(postId)
                if (result is NetworkResult.Failure) rollbackPost(postId, snapshot, result.error.message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                rollbackPost(postId, snapshot, e.message)
            }
        }
    }

    fun toggleBookmark(postId: String) {
        val snapshot = listState.value
        val was = snapshot.posts.firstOrNull { it.id == postId }?.isBookmarkedByMe == true
        val next = snapshot.bookmarked(postId, bookmarked = !was)
        if (next === snapshot) return
        listState.value = next
        viewModelScope.launch {
            try {
                val result = if (was) postRepository.removeBookmark(postId) else postRepository.bookmark(postId)
                if (result is NetworkResult.Failure) rollbackPost(postId, snapshot, result.error.message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                rollbackPost(postId, snapshot, e.message)
            }
        }
    }

    /** Restaure le seul post touché : une page arrivée entre-temps ne doit pas être écrasée. */
    private fun rollbackPost(postId: String, snapshot: PostPageListState, message: String?) {
        val original = snapshot.posts.firstOrNull { it.id == postId } ?: return
        listState.update { current ->
            current.copy(posts = current.posts.map { if (it.id == postId) original else it })
        }
        status.update { it.copy(error = message ?: "") }
    }

    private fun project(list: PostPageListState, user: MeeshyUser?, st: HashtagStatus): HashtagResultsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map { FeedPostBuilder.build(it, prefs, config.apiBaseUrl, currentUserId = user?.id) }
        val cold = projected.isEmpty() && !list.hasLoaded
        return HashtagResultsUiState(
            tag = tag,
            posts = projected,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = cold && st.isFetching && st.error == null,
            loadFailed = cold && !st.isFetching && st.error != null,
            errorMessage = st.error?.takeIf { it.isNotEmpty() && !cold },
        )
    }

    companion object {
        const val TAG_ARG = "tag"
        private const val LOAD_MORE_THRESHOLD = 5
    }
}

private data class HashtagStatus(
    val isFetching: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
