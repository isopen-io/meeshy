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
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.BookmarkPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * The saved-posts (bookmarked) feed — port of iOS `BookmarksViewModel`. Loads the
 * signed-in user's bookmarks cursor-page by cursor-page, projects each post through
 * the shared [FeedPostBuilder] (so the Prisme language resolution matches the main
 * feed), and un-bookmarks optimistically with rollback on failure.
 *
 * The list is the pure [BookmarksListState]; this ViewModel is the orchestration
 * layer (when to fetch, when to roll back). There is no repository-level bookmark
 * cache yet, so a cold open shows a skeleton then the first page — a follow-up will
 * add an L1 cache to serve saved posts instantly (instant-app parity with the feed).
 */
data class BookmarksUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val hasMore: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class BookmarksViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val listState = MutableStateFlow(BookmarksListState())
    private val status = MutableStateFlow(BookmarksStatus())

    private val _state = MutableStateFlow(BookmarksUiState())
    val state: StateFlow<BookmarksUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(listState, sessionRepository.currentUser, status) { list, user, st ->
                project(list, user, st)
            }.collect { projected -> _state.value = projected }
        }
        loadInitial()
    }

    /**
     * First page. Guarded so a re-entrant call (e.g. an `onAppear` re-fire) while a
     * load is in flight or after the list has already loaded is a no-op — [refresh]
     * is the way to force a reload.
     */
    fun loadInitial() {
        if (status.value.isLoading || listState.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetchFirstPage()
    }

    /**
     * Pull-to-refresh: reset the accumulation to a cold list and re-fetch the first
     * page. Mirrors iOS `refresh()` (invalidate + reload).
     */
    fun refresh() {
        listState.value = BookmarksListState()
        status.update { it.copy(isRefreshing = true, error = null) }
        fetchFirstPage()
    }

    private fun fetchFirstPage() {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getBookmarksPage(cursor = null)) {
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
     * Infinite scroll: once the given post is within [LOAD_MORE_THRESHOLD] of the tail
     * and the pure state says a page can still be fetched, load it. Re-entrancy is
     * guarded by [BookmarksStatus.isLoadingMore]; a failed page is silent (the next
     * scroll re-triggers), matching the feed.
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
                when (val result = postRepository.getBookmarksPage(cursor = list.cursor)) {
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

    /**
     * Optimistic un-bookmark: drop the post from the list instantly, persist, and
     * restore the pre-removal snapshot on failure. Port of iOS `removeBookmark`.
     * Inert when the post is not currently in the list.
     */
    fun removeBookmark(postId: String) {
        val snapshot = listState.value
        if (snapshot.posts.none { it.id == postId }) return
        listState.update { it.removed(postId) }
        viewModelScope.launch {
            try {
                val result = postRepository.removeBookmark(postId)
                if (result is NetworkResult.Failure) {
                    listState.value = snapshot
                    status.update { it.copy(error = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                listState.value = snapshot
                status.update { it.copy(error = e.message) }
            }
        }
    }

    private fun project(
        list: BookmarksListState,
        user: MeeshyUser?,
        st: BookmarksStatus,
    ): BookmarksUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val projected = list.posts.map { FeedPostBuilder.build(it, prefs, config.socketUrl) }
        val showSkeleton = st.isLoading && !list.hasLoaded && projected.isEmpty() && st.error == null
        return BookmarksUiState(
            posts = projected,
            isLoading = st.isLoading,
            isRefreshing = st.isRefreshing,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            hasMore = list.hasMore,
            errorMessage = st.error,
        )
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

private fun BookmarksListState.foldPage(page: BookmarkPage): BookmarksListState =
    appended(page.posts, page.nextCursor, page.hasMore)

private data class BookmarksStatus(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)
