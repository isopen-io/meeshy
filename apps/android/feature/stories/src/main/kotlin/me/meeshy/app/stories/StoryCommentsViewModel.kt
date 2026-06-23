package me.meeshy.app.stories

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
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.toStoryComment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import java.util.UUID
import javax.inject.Inject

/**
 * State for the story comments overlay. [isEmpty] (loaded, but no comments yet)
 * is derived so the sheet can pick skeleton / empty / list without re-deriving it.
 */
@Immutable
data class StoryCommentsUiState(
    val isLoading: Boolean = false,
    val comments: List<StoryComment> = emptyList(),
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = !isLoading && errorMessage == null && comments.isEmpty()
}

/**
 * Drives the comments overlay for one story — parity with iOS `StoryCommentsView` +
 * `StoryInteractionService` comments, surpassing it with:
 *  - Instant-App discipline: the skeleton shows only on a cold empty load; a refresh
 *    keeps the existing list on screen and swallows a refresh failure (an error
 *    surfaces only when there was nothing to show).
 *  - Optimistic posting: the comment appears instantly (Pending), is swapped for the
 *    server row on ACK, and flips to Failed (tap-to-retry) on failure — iOS posts
 *    fire-and-forget.
 *  - Realtime: other users' `comment:added` deltas append live, deduped by id.
 */
@HiltViewModel
class StoryCommentsViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryCommentsUiState())
    val state: StateFlow<StoryCommentsUiState> = _state.asStateFlow()

    private var storyId: String? = null
    private var loadingStoryId: String? = null
    private var socketJob: Job? = null

    /** Load (or silently refresh) the comments of [storyId]. Re-entrant calls for
     *  the same id while a load is in flight are ignored. */
    fun load(storyId: String) {
        if (loadingStoryId == storyId) return
        this.storyId = storyId
        loadingStoryId = storyId
        observeIncoming()
        val hadData = _state.value.comments.isNotEmpty()
        _state.update { it.copy(isLoading = !hadData, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = storyRepository.comments(storyId)) {
                    is NetworkResult.Success -> {
                        val loaded = result.data.map { it.toStoryComment(prefs()) }
                        _state.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = null,
                                comments = StoryCommentsReducer.merged(it.comments, loaded),
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
                loadingStoryId = null
            }
        }
    }

    /** Optimistically post [content] to the current story (no-op when blank). */
    fun post(content: String) {
        val story = storyId ?: return
        val trimmed = content.trim()
        if (trimmed.isEmpty()) return
        val clientId = UUID.randomUUID().toString()
        val optimistic = StoryComment(
            id = clientId,
            clientId = clientId,
            authorName = currentAuthorName(),
            avatarUrl = currentAvatarUrl(),
            content = trimmed,
            isTranslated = false,
            createdAt = null,
            status = StoryCommentStatus.Pending,
        )
        _state.update { it.copy(comments = StoryCommentsReducer.posting(it.comments, optimistic)) }
        send(story, clientId, trimmed)
    }

    /** Re-send a previously failed optimistic comment (inert if it is not failed). */
    fun retry(clientId: String) {
        val story = storyId ?: return
        val target = _state.value.comments.firstOrNull { it.clientId == clientId } ?: return
        if (target.status != StoryCommentStatus.Failed) return
        _state.update {
            it.copy(
                comments = it.comments.map { c ->
                    if (c.clientId == clientId) c.copy(status = StoryCommentStatus.Pending) else c
                },
            )
        }
        send(story, clientId, target.content)
    }

    private fun send(story: String, clientId: String, content: String) {
        viewModelScope.launch {
            try {
                when (val result = storyRepository.comment(story, content)) {
                    is NetworkResult.Success -> {
                        val server = result.data.toStoryComment(prefs())
                        _state.update {
                            it.copy(comments = StoryCommentsReducer.confirmed(it.comments, clientId, server))
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update {
                            it.copy(comments = StoryCommentsReducer.failed(it.comments, clientId))
                        }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(comments = StoryCommentsReducer.failed(it.comments, clientId))
                }
            }
        }
    }

    private fun observeIncoming() {
        if (socketJob != null) return
        socketJob = viewModelScope.launch {
            socialSocket.commentAdded.collect { event ->
                if (event.postId != storyId) return@collect
                val incoming = event.comment.toStoryComment(prefs())
                _state.update {
                    it.copy(comments = StoryCommentsReducer.received(it.comments, incoming))
                }
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

    private fun currentAvatarUrl(): String? =
        sessionRepository.currentUser.value?.avatar?.takeIf { it.isNotBlank() }

    private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }
}
