package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import javax.inject.Inject

data class StoriesUiState(
    val tray: StoryTrayPresentation = StoryTrayPresentation(self = null, others = emptyList()),
    val isLoading: Boolean = false,
)

@HiltViewModel
class StoriesViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(StoriesUiState())
    val state: StateFlow<StoriesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            try {
                when (val result = storyRepository.list()) {
                    is NetworkResult.Success -> {
                        val currentUserId = sessionRepository.currentUserId
                        val groups = result.data.toStoryGroups(currentUserId = currentUserId)
                        val tray = StoryTrayBuilder.build(
                            groups = groups,
                            currentUserId = currentUserId,
                            mediaBaseUrl = config.socketUrl,
                        )
                        _state.update { it.copy(tray = tray, isLoading = false) }
                    }
                    is NetworkResult.Failure -> _state.update { it.copy(isLoading = false) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _state.update { it.copy(isLoading = false) }
            }
        }
    }
}
