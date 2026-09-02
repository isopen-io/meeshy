package me.meeshy.app.reels

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import java.util.UUID
import javax.inject.Inject

/**
 * State for the reel comments sheet. [isEmpty] (loaded, but no comments yet) is
 * derived so the sheet can pick skeleton / empty / list without re-deriving it.
 * [hasMore] mirrors the server's own `pagination.hasMore` for the oldest page
 * fetched so far — [ReelCommentsViewModel.loadMore] is inert once it flips false,
 * and the sheet only offers a "load more" affordance while it is true.
 */
@Immutable
data class ReelCommentsUiState(
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val comments: List<ReelCommentPresentation> = emptyList(),
    val hasMore: Boolean = false,
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = !isLoading && errorMessage == null && comments.isEmpty()
}

/**
 * Drives the comments sheet overlaid on an open reel (issue #4815) — reuses the post
 * comments wire format ([PostRepository.getComments]/[PostRepository.addComment],
 * [me.meeshy.sdk.model.ApiPostComment]) rather than inventing a reel-specific one, since a
 * REEL is a post like any other. Mirrors `StoryCommentsViewModel`'s law:
 *  - Instant-App discipline: the skeleton shows only on a cold empty load; a refresh
 *    keeps the existing list on screen and swallows a refresh failure (an error
 *    surfaces only when there was nothing to show).
 *  - Optimistic posting: the comment appears instantly (Pending), is swapped for the
 *    server row on ACK, and flips to Failed (tap-to-retry) on failure.
 *  - Realtime: other viewers' `comment:added` deltas append live, deduped by id — the
 *    reel already owns the post room while its sheet can be open ([ReelsViewModel.setCurrentReel]).
 */
@HiltViewModel
class ReelCommentsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(ReelCommentsUiState())
    val state: StateFlow<ReelCommentsUiState> = _state.asStateFlow()

    private var reelId: String? = null
    private var loadingReelId: String? = null
    private var socketJob: Job? = null

    /** Cursor for the next (older) page — the oldest loaded comment's id, per the
     *  gateway's descending `createdAt` order. `null` once the server said there is
     *  no further page, or before any page has ever loaded. */
    private var nextCursor: String? = null

    /**
     * Loads (or silently refreshes) the first page of comments of [reelId]. Re-entrant
     * calls for the same id while a load is in flight are ignored. Switching to a
     * DIFFERENT reel (the sheet reopened over another pager page while this
     * ViewModel's scope survived) resets the sheet rather than merging the new reel's
     * page against the previous one's leftover rows.
     */
    fun load(reelId: String) {
        if (this.reelId != reelId) {
            this.reelId = reelId
            nextCursor = null
            _state.value = ReelCommentsUiState()
        } else if (loadingReelId == reelId) {
            return
        }
        loadingReelId = reelId
        observeIncoming()
        val hadData = _state.value.comments.isNotEmpty()
        _state.update { it.copy(isLoading = !hadData, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.getComments(reelId, cursor = null, limit = PAGE_SIZE)) {
                    is NetworkResult.Success -> {
                        val page = result.data
                        val more = page.size >= PAGE_SIZE
                        nextCursor = if (more) page.lastOrNull()?.id else null
                        val loaded = page.map { it.toReelComment(prefs()) }
                        _state.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = null,
                                hasMore = more,
                                comments = ReelCommentsReducer.merged(it.comments, loaded),
                            )
                        }
                    }
                    is NetworkResult.Failure -> onFailure(result.error.message, hadData)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onFailure(e.message, hadData)
            } finally {
                loadingReelId = null
            }
        }
    }

    /**
     * Fetches the next (older) page and prepends it — inert when the current reel has
     * no next page, one is already in flight, or the sheet was never loaded. Failures
     * are silent (mirror of a background refresh failure): the already-shown page
     * stays exactly as it was, only [ReelCommentsUiState.isLoadingMore] clears, so a
     * flaky network never wipes what the viewer is already reading.
     */
    fun loadMore() {
        val reel = reelId ?: return
        val cursor = nextCursor ?: return
        if (_state.value.isLoadingMore || !_state.value.hasMore) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                when (val result = postRepository.getComments(reel, cursor = cursor, limit = PAGE_SIZE)) {
                    is NetworkResult.Success -> {
                        val page = result.data
                        val more = page.size >= PAGE_SIZE
                        nextCursor = if (more) page.lastOrNull()?.id else null
                        val older = page.map { it.toReelComment(prefs()) }
                        _state.update {
                            it.copy(
                                isLoadingMore = false,
                                hasMore = more,
                                comments = ReelCommentsReducer.appendedOlderPage(it.comments, older),
                            )
                        }
                    }
                    is NetworkResult.Failure -> _state.update { it.copy(isLoadingMore = false) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /** Optimistically posts [content] to the current reel (no-op when blank). */
    fun post(content: String) {
        val reel = reelId ?: return
        val trimmed = content.trim()
        if (trimmed.isEmpty()) return
        val clientId = UUID.randomUUID().toString()
        val optimistic = ReelCommentPresentation(
            id = clientId,
            clientId = clientId,
            authorName = currentAuthorName(),
            content = trimmed,
            createdAt = null,
            status = ReelCommentStatus.Pending,
        )
        _state.update { it.copy(comments = ReelCommentsReducer.posting(it.comments, optimistic)) }
        send(reel, clientId, trimmed)
    }

    /** Re-sends a previously failed optimistic comment (inert if it is not failed). */
    fun retry(clientId: String) {
        val reel = reelId ?: return
        val target = _state.value.comments.firstOrNull { it.clientId == clientId } ?: return
        if (target.status != ReelCommentStatus.Failed) return
        _state.update {
            it.copy(
                comments = it.comments.map { c ->
                    if (c.clientId == clientId) c.copy(status = ReelCommentStatus.Pending) else c
                },
            )
        }
        send(reel, clientId, target.content)
    }

    private fun send(reel: String, clientId: String, content: String) {
        viewModelScope.launch {
            try {
                when (val result = postRepository.addComment(reel, content)) {
                    is NetworkResult.Success -> {
                        val server = result.data.toReelComment(prefs())
                        _state.update {
                            it.copy(comments = ReelCommentsReducer.confirmed(it.comments, clientId, server))
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(comments = ReelCommentsReducer.failed(it.comments, clientId)) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(comments = ReelCommentsReducer.failed(it.comments, clientId)) }
            }
        }
    }

    private fun observeIncoming() {
        if (socketJob != null) return
        socketJob = viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                if (event.postId != reelId) return@collect
                val incoming = event.comment.toReelComment(prefs())
                _state.update { it.copy(comments = ReelCommentsReducer.received(it.comments, incoming)) }
            }
        }
    }

    private fun onFailure(message: String?, hadData: Boolean) {
        _state.update {
            if (hadData) {
                it.copy(isLoading = false)
            } else {
                it.copy(isLoading = false, errorMessage = message ?: "Unknown error")
            }
        }
    }

    private fun prefs(): LanguageResolver.ContentLanguagePreferences =
        sessionRepository.currentUser.value ?: EmptyContentPreferences

    private fun currentAuthorName(): String {
        val user = sessionRepository.currentUser.value ?: return ""
        return user.displayName?.takeIf { it.isNotBlank() }
            ?: user.username.takeIf { it.isNotBlank() }
            ?: ""
    }

    private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private companion object {
        /** Matches the gateway's own `GET /posts/:id/comments` default (`limit = 20`). */
        const val PAGE_SIZE = 20
    }
}
