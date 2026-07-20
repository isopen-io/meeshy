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
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
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
    val reactionCount: Int = 0,
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
    val reactionCount: Int = 0,
    val myReactions: Set<String> = emptySet(),
    val quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    val isOwnStory: Boolean = false,
    val currentStoryId: String? = null,
    val prefetchUrls: List<String> = emptyList(),
    val canAutoAdvance: Boolean = false,
) {
    val current: StorySlideView? get() = slides.getOrNull(index)
    val hasNext: Boolean get() = index < slides.lastIndex
    val hasPrevious: Boolean get() = index > 0
}

@HiltViewModel
class StoryViewerViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    private var playback: StoryPlayback = StoryPlayback(groups = emptyList())

    /** Optimistic reaction state per slide id, seeded lazily from the slide's count. */
    private val reactionStates = mutableMapOf<String, StoryReactionState>()

    /**
     * Image URLs whose load has resolved (succeeded or failed) on screen. Feeds
     * [StoryAutoAdvanceGate] so the countdown waits for the current slide's media
     * to paint. Persists across slides so revisiting an already-seen image never
     * re-waits.
     */
    private val resolvedImageUrls = mutableSetOf<String>()

    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()

    init {
        load()
        observeReactionDeltas()
    }

    /**
     * Reconcile other users' realtime reactions into the open viewer. A
     * `story:reacted` is a +1 and `story:unreacted` a -1 on the targeted slide;
     * the pure [StoryReactionState.applyDelta] keeps the user's OWN echo from
     * double-counting the optimistic bump from [react].
     */
    private fun observeReactionDeltas() {
        viewModelScope.launch {
            socialSocket.storyReacted.collect {
                onReactionDelta(it.storyId, it.emoji, delta = 1, actorId = it.userId)
            }
        }
        viewModelScope.launch {
            socialSocket.storyUnreacted.collect {
                onReactionDelta(it.storyId, it.emoji, delta = -1, actorId = it.userId)
            }
        }
    }

    private fun onReactionDelta(storyId: String, emoji: String, delta: Int, actorId: String) {
        val current = seededReactionState(storyId) ?: return
        val isOwn = actorId == sessionRepository.currentUserId
        val next = current.applyDelta(emoji, delta, isOwn)
        if (next == current) return
        reactionStates[storyId] = next
        emit()
    }

    private fun seededReactionState(storyId: String): StoryReactionState? {
        reactionStates[storyId]?.let { return it }
        val slide = playback.groups.firstNotNullOfOrNull { group ->
            group.slides.firstOrNull { it.id == storyId }
        } ?: return null
        return StoryReactionState(count = slide.reactionCount)
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

    /**
     * Dispatch a resolved swipe gesture into the pure playback engine: horizontal
     * swipes jump whole author groups, a downward swipe dismisses, and an
     * unresolved drag is inert (so a small drift during a tap is harmless).
     */
    fun onSwipe(action: StorySwipeAction) {
        playback = when (action) {
            StorySwipeAction.NextGroup -> playback.jumpToNextGroup()
            StorySwipeAction.PreviousGroup -> playback.jumpToPreviousGroup()
            StorySwipeAction.Dismiss -> playback.dismissed()
            StorySwipeAction.None -> return
        }
        emit()
    }

    /**
     * Report that an image URL has resolved on screen (load succeeded or failed).
     * Re-emits only when the just-resolved URL is the current slide's image, so
     * the gate flips and the countdown can start; resolutions for off-screen
     * (prefetched) slides are recorded silently.
     */
    fun onImageResolved(url: String) {
        if (!resolvedImageUrls.add(url)) return
        if (playback.currentSlide?.imageUrl == url) emit()
    }

    fun markCurrentViewed() {
        val slideId = playback.currentSlide?.id ?: return
        viewModelScope.launch {
            runCatching { storyRepository.markViewed(slideId) }
        }
    }

    /**
     * Quick-strip reaction on the current slide. The count moves optimistically;
     * a repeat of the same emoji is inert (no network); a network failure rolls
     * back to the snapshot so the UI never shows a phantom reaction.
     */
    fun react(emoji: String) {
        val slide = playback.currentSlide ?: return
        val slideId = slide.id
        val snapshot = reactionStateFor(slide)
        val optimistic = snapshot.reactedLocally(emoji)
        if (optimistic == snapshot) return
        reactionStates[slideId] = optimistic
        emit()
        viewModelScope.launch {
            try {
                if (storyRepository.react(slideId, emoji) is NetworkResult.Failure) {
                    rollback(slideId, snapshot)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                rollback(slideId, snapshot)
            }
        }
    }

    private fun rollback(slideId: String, snapshot: StoryReactionState) {
        reactionStates[slideId] = snapshot
        emit()
    }

    private fun reactionStateFor(slide: StorySlideView): StoryReactionState =
        reactionStates[slide.id] ?: StoryReactionState(count = slide.reactionCount)

    private fun emit() {
        val reaction = playback.currentSlide?.let { reactionStateFor(it) } ?: StoryReactionState()
        _state.value = StoryViewerUiState(
            authorName = playback.authorName,
            slides = playback.slides,
            index = playback.slideIndex,
            groupIndex = playback.groupIndex,
            isLoading = false,
            isDismissed = playback.isDismissed,
            reactionCount = reaction.count,
            myReactions = reaction.mine,
            isOwnStory = playback.currentGroup?.userId == sessionRepository.currentUserId,
            currentStoryId = playback.currentSlide?.id,
            prefetchUrls = StoryPrefetchPlanner.plan(playback),
            canAutoAdvance = StoryAutoAdvanceGate.shouldCountdown(playback.currentSlide, resolvedImageUrls),
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
            reactionCount = reactionCount,
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
