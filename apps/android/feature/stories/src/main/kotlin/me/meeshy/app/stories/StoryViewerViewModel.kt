package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import javax.inject.Inject

/** A single slide projected for the viewer. Pure data. */
@Immutable
data class StorySlideView(
    val id: String,
    val text: String,
    val isTranslated: Boolean,
    val imageUrl: String?,
    val accentHex: String,
)

data class StoryViewerUiState(
    val authorName: String = "",
    val slides: List<StorySlideView> = emptyList(),
    val index: Int = 0,
    val isLoading: Boolean = true,
) {
    val current: StorySlideView? get() = slides.getOrNull(index)
    val hasNext: Boolean get() = index < slides.lastIndex
    val hasPrevious: Boolean get() = index > 0
}

@HiltViewModel
class StoryViewerViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            try {
                when (val result = storyRepository.list()) {
                    is NetworkResult.Success -> {
                        val group = result.data
                            .toStoryGroups(currentUserId = sessionRepository.currentUserId)
                            .firstOrNull { it.id == userId }
                        _state.update { it.fromGroup(group) }
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

    fun advance() {
        _state.update { if (it.hasNext) it.copy(index = it.index + 1) else it }
    }

    fun back() {
        _state.update { if (it.hasPrevious) it.copy(index = it.index - 1) else it }
    }

    fun markCurrentViewed() {
        val slideId = _state.value.current?.id ?: return
        viewModelScope.launch {
            runCatching { storyRepository.markViewed(slideId) }
        }
    }

    private fun StoryViewerUiState.fromGroup(group: StoryGroup?): StoryViewerUiState {
        if (group == null) return copy(isLoading = false, slides = emptyList())
        val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
        return copy(
            authorName = group.username,
            slides = group.stories.map { it.toSlideView(group.avatarColor, prefs) },
            index = 0,
            isLoading = false,
        )
    }

    private fun StoryItem.toSlideView(
        accentHex: String,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): StorySlideView {
        val resolved = StoryContentResolver.resolve(this, prefs)
        val image = media.firstOrNull { it.type == FeedMediaType.IMAGE && it.url != null }
            ?: media.firstOrNull { it.thumbnailUrl != null }
        val imageUrl = (image?.url ?: image?.thumbnailUrl)
            ?.let { resolveMediaUrl(it, config.socketUrl) }
        return StorySlideView(
            id = id,
            text = resolved.content,
            isTranslated = resolved.isTranslated,
            imageUrl = imageUrl,
            accentHex = accentHex,
        )
    }

    private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    companion object {
        const val USER_ID_ARG: String = "userId"
    }
}
