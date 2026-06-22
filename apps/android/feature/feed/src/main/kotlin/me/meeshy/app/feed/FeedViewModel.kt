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
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class FeedUiState(
    val posts: List<FeedPostPresentation> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = true,
    val isLoadingMore: Boolean = false,
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                postRepository.feedStream(
                    onSyncError = { error ->
                        _state.update {
                            it.copy(errorMessage = error.message, isSyncing = false, showSkeleton = false)
                        }
                    },
                ),
                sessionRepository.currentUser,
                postRepository.feedHasMore,
            ) { result, user, hasMore -> Triple(result, user, hasMore) }
                .collect { (result, user, hasMore) ->
                    _state.update { it.applyResult(result, user, config.socketUrl).copy(hasMore = hasMore) }
                }
        }
    }

    /**
     * Infinite-scroll trigger (port of FeedViewModel.loadMoreIfNeeded): once the
     * given post is within [LOAD_MORE_THRESHOLD] of the tail and more pages remain,
     * fetch the next page. Re-entrancy is guarded by [FeedUiState.isLoadingMore];
     * failures are swallowed so the user can simply scroll again.
     */
    fun loadMoreIfNeeded(postId: String) {
        val current = _state.value
        val index = current.posts.indexOfFirst { it.id == postId }
        if (index < 0 || index < current.posts.size - LOAD_MORE_THRESHOLD) return
        if (!current.hasMore || current.isLoadingMore) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                postRepository.loadMore()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun refresh() {
        _state.update { it.copy(errorMessage = null, isSyncing = true) }
        viewModelScope.launch {
            try {
                postRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message, isSyncing = false) }
            }
        }
    }

    fun toggleLike(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.toggleLike(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    private companion object {
        const val LOAD_MORE_THRESHOLD = 5
    }
}

private fun List<ApiPost>.toPresentations(
    preferences: LanguageResolver.ContentLanguagePreferences,
    mediaBaseUrl: String,
): List<FeedPostPresentation> = map { FeedPostBuilder.build(it, preferences, mediaBaseUrl) }

private fun FeedUiState.applyResult(
    result: CacheResult<List<ApiPost>>,
    user: MeeshyUser?,
    mediaBaseUrl: String,
): FeedUiState {
    val prefs = user ?: EmptyContentPreferences
    return when (result) {
        is CacheResult.Fresh -> copy(
            posts = result.value.toPresentations(prefs, mediaBaseUrl),
            isSyncing = false,
            showSkeleton = false,
            errorMessage = null,
        )
        is CacheResult.Stale -> copy(
            posts = result.value.toPresentations(prefs, mediaBaseUrl),
            isSyncing = true,
            showSkeleton = false,
        )
        is CacheResult.Syncing -> copy(
            posts = result.value?.toPresentations(prefs, mediaBaseUrl) ?: posts,
            isSyncing = true,
            showSkeleton = result.value == null && posts.isEmpty() && errorMessage == null,
        )
        CacheResult.Empty -> copy(
            posts = emptyList(),
            isSyncing = false,
            showSkeleton = errorMessage == null,
        )
    }
}

private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
