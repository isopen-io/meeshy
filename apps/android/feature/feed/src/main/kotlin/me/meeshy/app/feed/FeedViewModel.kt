package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.post.PostRepository
import javax.inject.Inject

data class FeedUiState(
    val posts: List<ApiPost> = emptyList(),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val postRepository: PostRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            postRepository.feedStream(
                onSyncError = { error ->
                    _state.update {
                        it.copy(errorMessage = error.message, isSyncing = false, showSkeleton = false)
                    }
                },
            ).collect { result ->
                _state.update { it.applyResult(result) }
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

    fun likePost(postId: String) {
        viewModelScope.launch {
            try {
                postRepository.likePost(postId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(errorMessage = e.message) }
            }
        }
    }
}

private fun FeedUiState.applyResult(result: CacheResult<List<ApiPost>>): FeedUiState = when (result) {
    is CacheResult.Fresh -> copy(posts = result.value, isSyncing = false, showSkeleton = false, errorMessage = null)
    is CacheResult.Stale -> copy(posts = result.value, isSyncing = true, showSkeleton = false)
    is CacheResult.Syncing -> copy(
        posts = result.value ?: posts,
        isSyncing = true,
        showSkeleton = result.value == null && posts.isEmpty() && errorMessage == null,
    )
    CacheResult.Empty -> copy(posts = emptyList(), isSyncing = false, showSkeleton = errorMessage == null)
}
