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
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * A single user's authored-posts feed — the Android take on iOS `UserProfileView`'s posts
 * list. Loads the profile owner's posts cursor-page by cursor-page, projects each through
 * the shared [FeedPostBuilder] so the Prisme language resolution matches the main feed, and
 * pages in more as the reader nears the tail.
 *
 * The list is the pure [PostPageListState]; this ViewModel is the orchestration layer (when
 * to fetch, when the cold skeleton stands down). Read-only: the profile posts screen has no
 * un-bookmark affordance, so no optimistic mutation lives here.
 */
data class UserPostsUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val hasMore: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class UserPostsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle[USER_ID_ARG] ?: ""

    private val listState = MutableStateFlow(PostPageListState())
    private val status = MutableStateFlow(UserPostsStatus())

    private val _state = MutableStateFlow(UserPostsUiState())
    val state: StateFlow<UserPostsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status) { list, user, st ->
                project(list, user, st)
            }.collect { projected -> _state.value = projected }
        }
        loadInitial()
    }

    /**
     * First page. Guarded so a re-entrant call while a load is in flight or after the list
     * has already loaded is a no-op — [refresh] is the way to force a reload. A blank
     * [userId] (a malformed route) never hits the network.
     */
    fun loadInitial() {
        if (userId.isBlank() || status.value.isLoading || listState.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetchFirstPage()
    }

    /** Pull-to-refresh: reset the accumulation to a cold list and re-fetch the first page. */
    fun refresh() {
        if (userId.isBlank()) return
        listState.value = PostPageListState()
        status.update { it.copy(isRefreshing = true, error = null) }
        fetchFirstPage()
    }

    private fun fetchFirstPage() {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getUserPostsPage(userId, cursor = null)) {
                    is NetworkResult.Success -> {
                        listState.update { it.foldPage(result.data) }
                        status.update { it.copy(isLoading = false, isRefreshing = false) }
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
     * Infinite scroll: once the given post is within [LOAD_MORE_THRESHOLD] of the tail and
     * the pure state says a page can still be fetched, load it. Re-entrancy is guarded by
     * [UserPostsStatus.isLoadingMore]; a failed page is silent (the next scroll re-triggers).
     */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        val list = listState.value
        if (!list.canLoadMore || status.value.isLoadingMore) return

        status.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.getUserPostsPage(userId, cursor = list.cursor)) {
                    is NetworkResult.Success -> listState.update { it.foldPage(result.data) }
                    is NetworkResult.Failure -> Unit
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                status.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    private fun project(
        list: PostPageListState,
        user: MeeshyUser?,
        st: UserPostsStatus,
    ): UserPostsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map { FeedPostBuilder.build(it, prefs, config.socketUrl) }
        val showSkeleton = st.isLoading && !list.hasLoaded && projected.isEmpty() && st.error == null
        return UserPostsUiState(
            posts = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            hasMore = list.hasMore,
            errorMessage = st.error,
        )
    }

    companion object {
        const val USER_ID_ARG = "userId"
        private const val LOAD_MORE_THRESHOLD = 5
    }
}

private data class UserPostsStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
