package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryBackgroundPalette
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.story.StoryNotificationContext
import me.meeshy.sdk.model.story.StoryNotificationTargetResolver
import me.meeshy.sdk.model.story.StoryNotificationTargetState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.toContentFetchFailure
import me.meeshy.sdk.story.StoryRepository

@Immutable
data class StoryNotificationTargetUiState(
    val target: StoryNotificationTargetState = StoryNotificationTargetState.Loading,
    val context: StoryNotificationContext,
    val backgroundHex: String,
    val nowMillis: Long,
)

sealed interface StoryNotificationTargetUiEvent {
    data object Retry : StoryNotificationTargetUiEvent
}

sealed interface StoryNotificationTargetUiEffect {
    /** Une story lisible : le lecteur s'ouvre sur CETTE story, sur la feuille que la notification désignait. */
    data class OpenViewer(
        val storyId: String,
        val action: StoryViewerInitialAction?,
        val commentId: String?,
        val parentCommentId: String?,
    ) : StoryNotificationTargetUiEffect
}

/**
 * L'écran qui s'ouvre au toucher d'une notification de story (miroir de iOS `StoryNotificationTargetViewModel`).
 * Cache-first : la story déjà détenue (dont celle que le push a préchargée dans le cache par id) répond tout de
 * suite, puis le réseau revalide en silence. Une réponse détenue n'est jamais écrasée par un échec de revalidation ;
 * 404/403 sont des réponses, le réseau et le 5xx des pannes distinctes et réessayables.
 */
@HiltViewModel
class StoryNotificationTargetViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    clock: CacheClock,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val read: (String) -> String? = { savedStateHandle.get<String>(it) }
    private val storyId: String = savedStateHandle.get<String>(StoryNotificationTargetArgs.STORY_ID).orEmpty()
    private val now = clock.nowMillis()

    private val _state = MutableStateFlow(
        StoryNotificationTargetUiState(
            context = StoryNotificationTargetArgs.decode(read, now),
            backgroundHex = StoryBackgroundPalette.randomPastelHex(),
            nowMillis = now,
        ),
    )
    val state: StateFlow<StoryNotificationTargetUiState> = _state.asStateFlow()

    private val _effects = Channel<StoryNotificationTargetUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var loading: Job? = null
    private var viewerOpened = false

    init {
        load()
    }

    fun onEvent(event: StoryNotificationTargetUiEvent) {
        when (event) {
            StoryNotificationTargetUiEvent.Retry -> load()
        }
    }

    private fun load() {
        if (loading?.isActive == true) return
        loading = viewModelScope.launch {
            cachedPost()?.let { applyPost(it) }
            when (val fresh = fetch()) {
                is Fetched.Post -> applyPost(fresh.post)
                is Fetched.Failed -> _state.update {
                    it.copy(target = StoryNotificationTargetResolver.afterFailedRevalidation(it.target, fresh.failure))
                }
            }
        }
    }

    private fun cachedPost(): ApiPost? =
        try {
            storyRepository.cachedPost(storyId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }

    private suspend fun fetch(): Fetched =
        try {
            when (val result = storyRepository.fetchPost(storyId)) {
                is NetworkResult.Success -> Fetched.Post(result.data)
                is NetworkResult.Failure -> Fetched.Failed(result.error.toContentFetchFailure())
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Fetched.Failed(failure.toContentFetchFailure())
        }

    private fun applyPost(post: ApiPost) {
        val target = StoryNotificationTargetResolver.stateFor(post, _state.value.nowMillis)
        _state.update { it.copy(target = target) }
        if (target is StoryNotificationTargetState.Active && !viewerOpened) {
            viewerOpened = true
            _effects.trySend(
                StoryNotificationTargetUiEffect.OpenViewer(
                    storyId = storyId,
                    action = StoryNotificationTargetArgs.action(read),
                    commentId = read(StoryNotificationTargetArgs.COMMENT_ID)?.takeIf { it.isNotBlank() },
                    parentCommentId = read(StoryNotificationTargetArgs.PARENT_COMMENT_ID)?.takeIf { it.isNotBlank() },
                ),
            )
        }
    }

    private sealed interface Fetched {
        data class Post(val post: ApiPost) : Fetched
        data class Failed(val failure: me.meeshy.sdk.model.ContentFetchFailure) : Fetched
    }
}
