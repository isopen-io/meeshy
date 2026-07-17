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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * The comment thread beneath a post opened full-screen — the Android take on the iOS
 * post-detail comments. Loads the first page, cursor-pages by the last comment's id,
 * and sends a new comment **optimistically**: the row appears instantly (Instant-App
 * feedback) and is either confirmed with the server row or rolled back on failure.
 *
 * Prisme parity with the feed: each comment's displayed content follows
 * [CommentProjection], so a francophone reader sees comments in French exactly as the
 * post itself. Replies (`getCommentReplies`) and comment likes are a later slice.
 */
data class PostCommentsUiState(
    val comments: List<CommentPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val isSubmitting: Boolean = false,
    val canLoadMore: Boolean = false,
    val isEmpty: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class PostCommentsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val postId: String = savedStateHandle[POST_ID_ARG] ?: ""

    private val thread = MutableStateFlow(CommentThreadState())
    private val status = MutableStateFlow(Status())
    private var pendingSeq = 0

    private val _state = MutableStateFlow(PostCommentsUiState())
    val state: StateFlow<PostCommentsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(thread, sessionRepository.currentUser, status) { t, user, st ->
                project(t, user, st)
            }.collect { projected -> _state.value = projected }
        }
        loadInitial()
    }

    /**
     * First page. A blank [postId] (a malformed route) settles to the empty state without
     * a network call; otherwise guarded so a re-entrant call after the load is a no-op.
     */
    fun loadInitial() {
        if (postId.isBlank()) {
            thread.update { it.copy(hasLoaded = true) }
            return
        }
        if (status.value.isLoading || thread.value.hasLoaded) return
        status.update { it.copy(isLoading = true, error = null) }
        fetch(cursor = null, loadingMore = false)
    }

    /** Fetch the next page — inert when there is no next page or a fetch is already in flight. */
    fun loadMore() {
        if (status.value.isLoadingMore || !thread.value.canLoadMore) return
        status.update { it.copy(isLoadingMore = true, error = null) }
        fetch(cursor = thread.value.cursor, loadingMore = true)
    }

    private fun fetch(cursor: String?, loadingMore: Boolean) {
        viewModelScope.launch {
            try {
                when (val result = postRepository.getComments(postId, cursor, PAGE_SIZE)) {
                    is NetworkResult.Success -> {
                        val page = result.data
                        val more = page.size >= PAGE_SIZE
                        val nextCursor = if (more) page.lastOrNull()?.id else null
                        thread.update { it.appended(page, nextCursor, more) }
                        status.update { it.copy(isLoading = false, isLoadingMore = false, error = null) }
                    }
                    is NetworkResult.Failure ->
                        status.update {
                            it.copy(isLoading = false, isLoadingMore = false, error = result.error.message)
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                status.update { it.copy(isLoading = false, isLoadingMore = false, error = e.message) }
            }
        }
    }

    /**
     * Send a comment. Trimmed-blank content, a blank post id, or a send already in flight
     * are inert. The row is prepended optimistically for instant feedback, then confirmed
     * with the server row or rolled back if the send fails.
     */
    fun submit(text: String) {
        val content = text.trim()
        if (content.isEmpty() || postId.isBlank() || status.value.isSubmitting) return
        val tempId = "pending-${pendingSeq++}"
        thread.update { it.optimistic(optimisticRow(tempId, content)) }
        status.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.addComment(postId, content)) {
                    is NetworkResult.Success -> {
                        thread.update { it.confirmed(tempId, result.data) }
                        status.update { it.copy(isSubmitting = false, error = null) }
                    }
                    is NetworkResult.Failure -> {
                        thread.update { it.failed(tempId) }
                        status.update { it.copy(isSubmitting = false, error = result.error.message) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                thread.update { it.failed(tempId) }
                status.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }

    private fun optimisticRow(tempId: String, content: String): ApiPostComment {
        val me = sessionRepository.currentUser.value
        return ApiPostComment(
            id = tempId,
            content = content,
            author = me?.let { ApiAuthor(id = it.id, username = it.username, displayName = it.displayName, avatar = it.avatar) },
        )
    }

    private fun project(thread: CommentThreadState, user: MeeshyUser?, st: Status): PostCommentsUiState {
        val prefs: LanguageResolver.ContentLanguagePreferences = user ?: EmptyContentPreferences
        val rows = thread.comments.map {
            CommentProjection.build(it, prefs, config.socketUrl, isPending = it.id in thread.pendingIds)
        }
        val showSkeleton = st.isLoading && !thread.hasLoaded && thread.comments.isEmpty() && st.error == null
        return PostCommentsUiState(
            comments = rows,
            isLoading = st.isLoading,
            isLoadingMore = st.isLoadingMore,
            showSkeleton = showSkeleton,
            isSubmitting = st.isSubmitting,
            canLoadMore = thread.canLoadMore,
            isEmpty = thread.hasLoaded && thread.comments.isEmpty(),
            errorMessage = st.error,
        )
    }

    companion object {
        const val POST_ID_ARG = "postId"
        private const val PAGE_SIZE = 20
    }
}

private data class Status(
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)
