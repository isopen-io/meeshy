package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * State for the story-viewers sheet. [isEmpty] (loaded, but nobody has viewed yet)
 * is derived so the screen can pick skeleton / empty / list / error without
 * re-deriving the condition.
 */
@Immutable
data class StoryViewersUiState(
    val isLoading: Boolean = false,
    val viewers: List<StoryViewer> = emptyList(),
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = !isLoading && errorMessage == null && viewers.isEmpty()
}

/**
 * Drives the who-viewed list for one story — parity with iOS `StoryViewersSheet` +
 * `StoryInteractionService.loadViewers`, plus Instant-App discipline: the skeleton
 * shows only on a cold empty load; a refresh keeps the existing list on screen and
 * a refresh failure leaves that list intact (an error surfaces only when there was
 * nothing to show).
 */
@HiltViewModel
class StoryViewersViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryViewersUiState())
    val state: StateFlow<StoryViewersUiState> = _state.asStateFlow()

    private var loadingStoryId: String? = null

    /** Load (or silently refresh) the viewers of [storyId]. Re-entrant calls for the
     *  same id while a load is in flight are ignored. */
    fun load(storyId: String) {
        if (loadingStoryId == storyId) return
        loadingStoryId = storyId
        val hadData = _state.value.viewers.isNotEmpty()
        _state.value = _state.value.copy(isLoading = !hadData, errorMessage = null)
        viewModelScope.launch {
            try {
                when (val result = storyRepository.viewers(storyId)) {
                    is NetworkResult.Success ->
                        _state.value = StoryViewersUiState(
                            isLoading = false,
                            viewers = StoryViewersPresentation.order(result.data),
                            errorMessage = null,
                        )
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

    private fun onFailure(message: String?, hadData: Boolean) {
        _state.value =
            if (hadData) {
                _state.value.copy(isLoading = false)
            } else {
                _state.value.copy(isLoading = false, errorMessage = message ?: "Unknown error")
            }
    }
}
