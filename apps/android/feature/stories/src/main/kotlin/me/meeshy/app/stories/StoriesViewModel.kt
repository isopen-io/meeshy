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
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import javax.inject.Inject

data class StoriesUiState(
    val tray: StoryTrayPresentation = StoryTrayPresentation(self = null, others = emptyList()),
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
)

/**
 * Drives the story tray from the Room-backed cache-first stream
 * ([StoryRepository.storiesStream]). Cache rows paint the tray instantly on a
 * warm start; the cold skeleton shows only on a genuinely empty cache (Instant
 * App principles). The pure [StoryTrayReducer] holds the SWR decisions.
 */
@HiltViewModel
class StoriesViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(StoriesUiState())
    val state: StateFlow<StoriesUiState> = _state.asStateFlow()

    /** Authoritative cached story list; the fallback when a sync carries no value yet. */
    private var rawStories: List<ApiPost> = emptyList()

    init {
        viewModelScope.launch {
            storyRepository.storiesStream(
                onSyncError = {
                    _state.update { it.copy(showSkeleton = false, isSyncing = false) }
                },
            ).collect { result ->
                rawStories = StoryTrayReducer.stories(result, rawStories)
                val flags = StoryTrayReducer.flags(result, rawStories.isNotEmpty())
                val currentUserId = sessionRepository.currentUserId
                val tray = StoryTrayBuilder.build(
                    groups = rawStories.toStoryGroups(currentUserId = currentUserId),
                    currentUserId = currentUserId,
                    mediaBaseUrl = config.socketUrl,
                )
                _state.update {
                    it.copy(tray = tray, isSyncing = flags.isSyncing, showSkeleton = flags.showSkeleton)
                }
            }
        }
    }

    /** Pull-to-refresh / retry. Background SWR keeps the visible tray; a failure just leaves the skeleton. */
    fun refresh() {
        viewModelScope.launch {
            try {
                storyRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _state.update { it.copy(showSkeleton = false, isSyncing = false) }
            }
        }
    }
}
