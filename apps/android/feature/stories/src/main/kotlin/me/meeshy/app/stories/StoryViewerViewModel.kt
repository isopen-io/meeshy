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

/**
 * Viewer state, derived from the cross-group [StoryPlayback] engine. The screen
 * reads the CURRENT group's slides plus the index so its segmented progress and
 * auto-advance stay simple; group roll-over and dismissal are decided by the
 * pure engine.
 */
data class StoryViewerUiState(
    val authorName: String = "",
    val slides: List<StorySlideView> = emptyList(),
    val index: Int = 0,
    val groupIndex: Int = 0,
    val isLoading: Boolean = true,
    val isDismissed: Boolean = false,
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

    private var playback: StoryPlayback = StoryPlayback(groups = emptyList())

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
                        val groups = result.data
                            .toStoryGroups(currentUserId = sessionRepository.currentUserId)
                            .map { it.toGroupSlides() }
                        playback = StoryPlayback.startingAt(groups, userId)
                        emit()
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
        playback = playback.advance()
        emit()
    }

    fun back() {
        playback = playback.back()
        emit()
    }

    fun markCurrentViewed() {
        val slideId = playback.currentSlide?.id ?: return
        viewModelScope.launch {
            runCatching { storyRepository.markViewed(slideId) }
        }
    }

    private fun emit() {
        _state.value = StoryViewerUiState(
            authorName = playback.authorName,
            slides = playback.slides,
            index = playback.slideIndex,
            groupIndex = playback.groupIndex,
            isLoading = false,
            isDismissed = playback.isDismissed,
        )
    }

    private fun StoryGroup.toGroupSlides(): StoryGroupSlides {
        val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
        return StoryGroupSlides(
            userId = id,
            authorName = username,
            slides = stories.map { it.toSlideView(avatarColor, prefs) },
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
