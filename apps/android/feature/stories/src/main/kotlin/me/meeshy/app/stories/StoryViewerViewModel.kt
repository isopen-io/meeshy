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
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StoryTextObjectTranslationMerge
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.sdk.story.toStoryItem
import javax.inject.Inject

/**
 * A foreground media layer on a slide — a non-background [StoryMediaObject]
 * (video or image) composited on top of the background. Position/scale are
 * normalised canvas fractions (0..1), matching the wire model. [x]/[y]/[scale]/
 * [opacity] are the layer's *static* base transform; when the clip carries
 * [keyframes] or participates in a slide [clipTransitions] entry, call [animated]
 * with the playhead to obtain the transform for that instant. [id] matches the
 * clip against transitions; [duration] bounds its own timing window. Rotation is
 * still not applied in this projection.
 */
@Immutable
data class StoryForegroundMediaView(
    val id: String,
    val url: String,
    val isVideo: Boolean,
    val x: Double,
    val y: Double,
    val scale: Double,
    val aspectRatio: Double,
    val opacity: Double = 1.0,
    val startTime: Double = 0.0,
    val duration: Double = 0.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
    val keyframes: List<StoryKeyframe> = emptyList(),
    val clipTransitions: List<StoryClipTransition> = emptyList(),
) {
    /**
     * The layer's transform at [atSeconds] (absolute playhead). Returns `this`
     * unchanged when nothing animates — no keyframes that key a channel, no clip
     * transition this layer takes part in, AND no fadeIn/fadeOut envelope active at
     * this instant. Otherwise a copy whose [x]/[y]/[scale] follow the interpolated
     * keyframe animation (un-keyed channels holding their static base) and whose
     * [opacity] folds together, in iOS render order, the clip's own fade envelope,
     * its keyframe opacity, and any clip-transition ramp.
     *
     * Opacity precedence mirrors iOS `StoryRenderer` (`fade ?? keyframeOpacity ??
     * base`): a live [fadeIn]/[fadeOut] envelope value OVERRIDES the keyframe/static
     * opacity, and the result is then multiplied by the crossfade/dissolve ramp of
     * any transition naming this clip. Keyframe and fade times are offsets from
     * [startTime], per the timeline spec.
     *
     * A layer that participates in a transition but carries no [duration] is left
     * untouched for the transition ramp: window-clipping on a zero-length window
     * (`end == start`) would hide the clip at almost every instant. Pure — the
     * Compose canvas ticks a clock in and renders the result.
     */
    /**
     * Whether this foreground layer is drawn at [atSeconds] (absolute playhead) —
     * the sharp play-mode timing-window gate the Compose canvas consults before
     * compositing the layer. Delegates to [StoryElementVisibility]: an untimed clip
     * (duration `0`) is always visible; a timed one only inside
     * `[startTime, startTime + duration)`. Pure.
     */
    fun isVisible(atSeconds: Float): Boolean =
        StoryElementVisibility.isVisible(startTime, duration, atSeconds.toDouble())

    fun animated(atSeconds: Float): StoryForegroundMediaView {
        val resolved = StoryKeyframeResolver.resolve(
            keyframes = keyframes,
            currentTime = atSeconds,
            startTime = startTime.toFloat(),
            baseX = x,
            baseY = y,
            baseScale = scale,
            baseOpacity = opacity,
        )
        val transitions = if (duration > 0.0) {
            clipTransitions.filter { it.fromClipId == id || it.toClipId == id }
        } else {
            emptyList()
        }
        val fadeEnvelope = StoryMediaFadeResolver.fadeOpacity(
            fadeIn = fadeIn.takeIf { it > 0.0 },
            fadeOut = fadeOut.takeIf { it > 0.0 },
            startTime = startTime,
            duration = duration.takeIf { it > 0.0 },
            currentTime = atSeconds.toDouble(),
        )
        if (resolved == null && transitions.isEmpty() && fadeEnvelope == null) return this

        val base = resolved ?: ResolvedKeyframeTransform(x = x, y = y, scale = scale, opacity = opacity)
        val transitionOpacity = if (transitions.isEmpty()) {
            1.0
        } else {
            StoryClipTransitionResolver.opacity(
                mediaId = id,
                startTime = startTime,
                duration = duration,
                transitions = transitions,
                currentTime = atSeconds.toDouble(),
            )
        }
        val opacityBase = fadeEnvelope ?: base.opacity
        return copy(
            x = base.x,
            y = base.y,
            scale = base.scale,
            opacity = opacityBase * transitionOpacity,
        )
    }
}

/**
 * A single slide projected for the viewer. Pure data.
 *
 * Background media is EITHER [imageUrl] (static) OR [backgroundVideoUrl]
 * (looping video) — never both; a video background never populates [imageUrl]
 * so the viewer's `AsyncImage` branch (Coil, image-only) is never handed a
 * video URL it cannot decode. [foregroundMedia] layers extra video/image
 * objects on top; [backgroundAudioUrl]/[foregroundAudioUrl] are the resolved
 * playback URLs for the slide's background and foreground/voice audio tracks.
 */
@Immutable
data class StorySlideView(
    val id: String,
    val text: String,
    val isTranslated: Boolean,
    val imageUrl: String?,
    val accentHex: String,
    val reactionCount: Int = 0,
    val backgroundVideoUrl: String? = null,
    val backgroundLoop: Boolean = true,
    val foregroundMedia: List<StoryForegroundMediaView> = emptyList(),
    val textObjects: List<StoryTextObjectView> = emptyList(),
    val backgroundAudioUrl: String? = null,
    val foregroundAudioUrl: String? = null,
    val languageCode: String? = null,
    /**
     * How long this slide stays on screen before auto-advancing, in milliseconds.
     * Resolved once at projection time from the slide's effects via the shared
     * [StorySlideDuration] rule (author-pinned timeline duration → content-derived
     * → 6s default), so the viewer countdown honours per-slide timing instead of a
     * flat constant. Defaults to the 6s static baseline.
     */
    val autoAdvanceMillis: Int = StorySlideDuration.DEFAULT_STATIC_MS,
    /**
     * The author's colour backdrop (`StoryEffects.background`), parsed once at
     * projection time via the shared [StoryBackgroundValue] rule: a solid colour or
     * a two-colour gradient. `null` when the slide carries no background string — the
     * viewer then keeps its accent→black fallback. Painted only as the base layer when
     * the slide has no background media (media covers it), mirroring iOS's
     * `renderBackground` priority.
     */
    val background: StoryBackgroundValue? = null,
    /**
     * The framing (pan/zoom) the author applied to a background IMAGE, projected once
     * from the background media object via [StoryBackgroundObjectTransform]. iOS
     * aspect-fills the background then applies this on top (an Instagram-style "zoom
     * inside the background"); the viewer mirrors that with a `graphicsLayer` on the
     * image. [StoryBackgroundObjectTransform.IDENTITY] (the default) means a plain
     * aspect-fill — a video background or a legacy/flat story never carries one yet.
     */
    val backgroundTransform: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform.IDENTITY,
    /**
     * The ThumbHash the viewer decodes into an instant blur behind the background
     * [imageUrl] while it loads — no black flash on cold load. Resolved once at
     * projection time via [StorySlidePlaceholder] (slide-level `effects.thumbHash`
     * then the flat background image's per-media hash). `null` when the slide
     * carries no usable hash: the image then loads over the plain background with
     * no placeholder, exactly as before.
     */
    val backgroundThumbHash: String? = null,
    /**
     * The locked repost attribution shown after the author's name when this slide
     * is a repost of someone else's story (repost icon + `@handle`, no "via"),
     * resolved once at projection time via [StoryRepostAttribution]. `null` for a
     * story that is not a repost — the header then shows only the author's name.
     */
    val repostAttribution: StoryRepostAttribution? = null,
)

/**
 * One language chip of the story language bar. Pure data.
 *
 * [isTranslatable] marks a language the viewer has configured but which the story
 * has no content for yet — tapping it requests an on-demand translation rather than
 * switching the display. [isTranslating] is true while that request is in flight.
 * A present (content) chip is neither.
 */
@Immutable
data class StoryLanguageOption(
    val code: String,
    val flag: String,
    val label: String,
    val isTranslatable: Boolean = false,
    val isTranslating: Boolean = false,
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
    val availableLanguages: List<StoryLanguageOption> = emptyList(),
    val languageOverride: String? = null,
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
    private val reportRepository: ReportRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    private var playback: StoryPlayback = StoryPlayback(groups = emptyList())

    /** Optimistic reaction state per slide id, seeded lazily from the slide's count. */
    private val reactionStates = mutableMapOf<String, StoryReactionState>()

    /** Raw items by slide id — needed to re-resolve text when the language override changes. */
    private val rawItems = mutableMapOf<String, StoryItem>()

    /** Ephemeral "Exploration" override, keyed to the slide it was chosen on. */
    private var languageOverride: Pair<String, String>? = null

    /** In-flight on-demand translation requests, keyed `storyId|lang` (lowercased). */
    private val translatingLanguages = mutableSetOf<String>()

    /**
     * Image URLs whose load has resolved (succeeded or failed) on screen. Feeds
     * [StoryAutoAdvanceGate] so the countdown waits for the current slide's media
     * to paint. Persists across slides so revisiting an already-seen image never
     * re-waits.
     */
    private val resolvedImageUrls = mutableSetOf<String>()

    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()

    /**
     * The slide currently on screen — owns membership of the post room (`ROOMS.post`). Held
     * outside [_state] since it is a subscription cursor, not something the UI renders. Mirrors
     * iOS `StoryViewerView.transitionPostRoom` / Android `ReelsViewModel.setCurrentReel`.
     */
    private var currentRoomStoryId: String? = null

    init {
        load()
        observeReactionDeltas()
        observeTranslationUpdates()
        observeStoryDeletions()
        observeStoryUpdates()
    }

    /**
     * Fold a realtime `story:updated` into the open viewer. The gateway broadcasts the
     * COMPLETE edited story; the matched slide is re-projected in place through the same
     * [toSlideView] conversion the initial load used (repopulating [rawItems], the single
     * source of truth for the current-slide re-projection in [emit]), and the pure
     * [StoryPlayback.replacingSlide] swaps it while keeping the cursor on the same slot so
     * the reader's content simply refreshes. On an `engagementReset` (a content edit that
     * wiped views/reactions server-side) the per-slide [reactionStates] cache is purged so
     * the count re-seeds from the fresh story (typically 0); a metadata-only update leaves
     * any live reaction count in place. An event for a story not in this playback is inert.
     * Mirror of iOS `StoryViewModel.storyUpdated`.
     */
    private fun observeStoryUpdates() {
        viewModelScope.launch {
            socialSocket.storyUpdated.collect { event ->
                val storyId = event.story.id
                val existingSlide = playback.groups.firstNotNullOfOrNull { group ->
                    group.slides.firstOrNull { it.id == storyId }
                } ?: return@collect
                val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
                val newSlide = event.story.toStoryItem().toSlideView(existingSlide.accentHex, prefs)
                playback = playback.replacingSlide(newSlide)
                if (event.engagementReset == true) reactionStates.remove(storyId)
                emit()
            }
        }
    }

    /**
     * Fold a realtime `story:deleted` out of the open viewer. The pure
     * [StoryPlayback.removingSlide] drops the matched slide (and an emptied author
     * group), re-anchoring the cursor so the reader keeps watching surviving content;
     * [emit] re-projects and dismisses when nothing remains. An event for a story not
     * in this playback changes nothing. The per-slide caches keyed by story id
     * ([rawItems], [reactionStates]) are purged so a deleted id leaves no stale
     * projection behind. Mirror of iOS `storyDeleted` (`purgeDeadStories`).
     */
    private fun observeStoryDeletions() {
        viewModelScope.launch {
            socialSocket.storyDeleted.collect { event ->
                val next = playback.removingSlide(event.storyId)
                if (next == playback) return@collect
                playback = next
                rawItems.remove(event.storyId)
                reactionStates.remove(event.storyId)
                emit()
            }
        }
    }

    /**
     * Fold realtime overlay translations into the open viewer. The gateway
     * broadcasts `story:translation-updated` after translating a story's on-canvas
     * text object; the pure [StoryTextObjectTranslationMerge.merge] upserts the new
     * languages into the cached item, and [emit] re-projects the current slide so a
     * reader whose preferred language just became available reads it at once — no
     * tap, no refetch (parity with iOS `storyTranslationUpdated`). An event for an
     * unknown story, or one whose merge is a no-op, changes nothing.
     */
    private fun observeTranslationUpdates() {
        viewModelScope.launch {
            socialSocket.storyTranslationUpdated.collect { event ->
                val item = rawItems[event.postId] ?: return@collect
                val merged = StoryTextObjectTranslationMerge.merge(item, event.textObjectIndex, event.translations)
                if (merged == item) return@collect
                rawItems[event.postId] = merged
                emit()
            }
        }
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

    /** Leaves the post room the viewer was sitting in, so a closed viewer stops receiving its events. */
    override fun onCleared() {
        currentRoomStoryId?.let { socialSocket.leavePostRoom(it) }
        currentRoomStoryId = null
        super.onCleared()
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

    /**
     * Prisme « Exploration » : bascule la langue AFFICHÉE du slide courant.
     * Re-tap sur la langue active = retour à la résolution automatique.
     * L'override est éphémère — il meurt au changement de slide.
     */
    fun toggleLanguageOverride(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        languageOverride = if (languageOverride == storyId to code) null else storyId to code
        emit()
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

    /**
     * Moves the post-room subscription with the slide on screen — leave the one scrolled away
     * from, join the one landed on. Idempotent (re-passing the same id, including `null`, is a
     * no-op) and blank-safe (a dismissed/empty viewer simply leaves without joining another),
     * mirroring [me.meeshy.app.reels.ReelsViewModel.setCurrentReel].
     */
    private fun transitionPostRoom(nextId: String?) {
        if (nextId == currentRoomStoryId) return
        currentRoomStoryId?.let { socialSocket.leavePostRoom(it) }
        currentRoomStoryId = nextId
        nextId?.let { socialSocket.joinPostRoom(it) }
    }

    private fun emit() {
        val currentId = playback.currentSlide?.id
        transitionPostRoom(currentId)
        if (languageOverride != null && languageOverride?.first != currentId) languageOverride = null
        val override = languageOverride?.second
        val reaction = playback.currentSlide?.let { reactionStateFor(it) } ?: StoryReactionState()
        // The current slide is always re-projected from its raw item: [rawItems] is the
        // single source of truth for translated content and can change at runtime (a
        // tapped exploration [override], an on-demand pull, or a realtime
        // `story:translation-updated` merge). With no override and no runtime merge this
        // reproduces the projection [toSlideView] already computed, so non-current slides
        // pass through untouched.
        val slides = playback.slides.map { slideView ->
            if (slideView.id != currentId) return@map slideView
            val item = rawItems[slideView.id] ?: return@map slideView
            val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
            val resolved = StoryContentResolver.resolve(item, prefs, override)
            val preferredLanguages = LanguageResolver.preferredContentLanguages(prefs)
            val textObjects = item.storyEffects?.textObjects.orEmpty()
                .map { StoryTextObjectProjection.project(it, preferredLanguages, override) }
            slideView.copy(
                text = resolved.content,
                isTranslated = resolved.isTranslated,
                languageCode = resolved.languageCode,
                textObjects = textObjects,
            )
        }
        _state.value = StoryViewerUiState(
            authorName = playback.authorName,
            slides = slides,
            index = playback.slideIndex,
            groupIndex = playback.groupIndex,
            isLoading = false,
            isDismissed = playback.isDismissed,
            reactionCount = reaction.count,
            myReactions = reaction.mine,
            isOwnStory = playback.currentGroup?.userId == sessionRepository.currentUserId,
            currentStoryId = currentId,
            prefetchUrls = StoryPrefetchPlanner.plan(playback),
            canAutoAdvance = StoryAutoAdvanceGate.shouldCountdown(playback.currentSlide, resolvedImageUrls),
            availableLanguages = availableLanguagesFor(currentId),
            languageOverride = override,
        )
    }

    /**
     * The story's language bar: every present translation as a content chip, plus —
     * once the story carries at least one translation — each configured content
     * language the story has no content for yet as a translatable request chip
     * (Prisme on-demand request arm, mirroring the feed strip). The gate keeps a
     * pure-original story (no translations) from dumping every preferred language as
     * a request affordance; an anonymous/logged-out viewer (no prefs) sees only the
     * present translations.
     *
     * The Prisme applies to ALL of a slide's content (CLAUDE.md §Cohérence), so a
     * present language is any language a translation exists for across the caption
     * **and** the on-canvas text overlays — not the caption alone. A slide whose
     * overlays are translated but whose caption is not would otherwise expose no way
     * to explore them. Caption languages lead (in caption order), then each
     * overlay-only language, all deduped case-insensitively.
     */
    private fun availableLanguagesFor(storyId: String?): List<StoryLanguageOption> {
        val item = storyId?.let { rawItems[it] } ?: return emptyList()
        val captionCodes = item.translations.orEmpty()
            .filter { it.language.isNotBlank() && it.content.isNotBlank() }
            .map { it.language }
        val overlayCodes = item.storyEffects?.textObjects.orEmpty()
            .flatMap { it.translations.orEmpty().entries }
            .filter { it.key.isNotBlank() && it.value.isNotBlank() }
            .map { it.key }
        val presentCodes = (captionCodes + overlayCodes).distinctBy { it.lowercase() }
        val present = presentCodes.map { languageOption(it, storyId, isTranslatable = false) }
        if (present.isEmpty()) return emptyList()

        val user = sessionRepository.currentUser.value ?: return present
        val presentLower = presentCodes.mapTo(mutableSetOf()) { it.lowercase() }
        val translatable = LanguageResolver.preferredContentLanguages(user)
            .distinctBy { it.lowercase() }
            .filter { it.lowercase() !in presentLower }
            .map { languageOption(it, storyId, isTranslatable = true) }
        return present + translatable
    }

    private fun languageOption(
        code: String,
        storyId: String,
        isTranslatable: Boolean,
    ): StoryLanguageOption {
        val info = LanguageData.info(code)
        return StoryLanguageOption(
            code = code,
            flag = info?.flag ?: "🌐",
            label = info?.nativeName ?: code,
            isTranslatable = isTranslatable,
            isTranslating = translationKey(storyId, code) in translatingLanguages,
        )
    }

    private fun translationKey(storyId: String, code: String): String =
        "$storyId|${code.trim().lowercase()}"

    /**
     * On-demand translation request (Prisme pull side): the viewer tapped a configured
     * language the current slide has no content for yet. Pulls the translation, merges it
     * into the raw item so the language becomes a live content chip, and switches the
     * "Exploration" override to it so the slide re-renders in the requested language the
     * moment it lands. A failed/inert translation leaves the strip to retry; a second tap
     * while the request is in flight is ignored. Mirror of the feed card's
     * `requestOnDemandTranslation`, scoped to the current slide.
     */
    fun requestStoryTranslation(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        val item = rawItems[storyId] ?: return
        val target = code.trim()
        if (target.isEmpty()) return
        val key = translationKey(storyId, target)
        if (!translatingLanguages.add(key)) return
        emit()
        viewModelScope.launch {
            try {
                val merged = storyRepository.translateStory(item, target)
                if (merged != null) {
                    rawItems[storyId] = merged
                    languageOverride = storyId to target
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Inert — a failed request leaves the strip untouched to retry.
            } finally {
                translatingLanguages.remove(key)
                emit()
            }
        }
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
        rawItems[id] = this
        val resolved = StoryContentResolver.resolve(this, prefs)
        val background = resolveBackgroundMedia()
        val clipTransitions = storyEffects?.clipTransitions.orEmpty()
        val foreground = storyEffects?.mediaObjects.orEmpty()
            .filterNot { it.isBackground }
            .mapNotNull { it.toForegroundMediaView(clipTransitions) }
        val preferredLanguages = LanguageResolver.preferredContentLanguages(prefs)
        val textObjects = storyEffects?.textObjects.orEmpty()
            .map { StoryTextObjectProjection.project(it, preferredLanguages) }
        return StorySlideView(
            id = id,
            text = resolved.content,
            isTranslated = resolved.isTranslated,
            imageUrl = background.imageUrl,
            accentHex = accentHex,
            reactionCount = reactionCount,
            languageCode = resolved.languageCode,
            backgroundVideoUrl = background.videoUrl,
            backgroundLoop = background.loop,
            backgroundTransform = background.transform,
            backgroundThumbHash = StorySlidePlaceholder.resolve(this),
            foregroundMedia = foreground,
            textObjects = textObjects,
            backgroundAudioUrl = resolveAudioUrl(preferBackground = true),
            foregroundAudioUrl = resolveAudioUrl(preferBackground = false),
            autoAdvanceMillis = StorySlideDuration.computeMillis(storyEffects),
            background = storyEffects?.background
                ?.takeIf { it.isNotBlank() }
                ?.let { StoryBackgroundValue.parse(it) },
            repostAttribution = StoryRepostAttribution.resolve(this),
        )
    }

    private data class BackgroundMedia(
        val imageUrl: String?,
        val videoUrl: String?,
        val loop: Boolean,
        val transform: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform.IDENTITY,
    )

    /**
     * Resolves the slide's single background layer. `storyEffects.mediaObjects`
     * (the modern, RAW-publish wire shape) is authoritative when present: the
     * object flagged `isBackground` carries its own `mediaURL` + kind, so no
     * cross-referencing against the flat `media[]` list is needed. Legacy
     * stories without `storyEffects.mediaObjects` fall back to the flat list,
     * preferring a VIDEO item over an IMAGE one — critically, a video's own
     * `.url` is only ever assigned to [BackgroundMedia.videoUrl], never to
     * [BackgroundMedia.imageUrl] (the historical bug: Coil can't decode a video
     * file as an image, so the slide painted nothing and no video ever played).
     */
    private fun StoryItem.resolveBackgroundMedia(): BackgroundMedia {
        val backgroundObject = storyEffects?.mediaObjects?.firstOrNull { it.isBackground }
        val fallbackMedia = media.firstOrNull { it.type == FeedMediaType.VIDEO }
            ?: media.firstOrNull { it.type == FeedMediaType.IMAGE && it.url != null }

        val isVideo = backgroundObject?.mediaType == "video" ||
            (backgroundObject == null && fallbackMedia?.type == FeedMediaType.VIDEO)
        val resolvedUrl = (backgroundObject?.mediaURL ?: fallbackMedia?.url)
            ?.let { resolveMediaUrl(it, config.socketUrl) }

        if (isVideo) {
            // The framing rides only on a modern `isBackground` object whose OWN
            // mediaURL produced the resolved url; a legacy/flat fallback video never
            // carries one, so it stays a plain aspect-fill (IDENTITY). The viewer
            // applies the projection to the player surface via `graphicsLayer`, the
            // exact mirror of the image branch (iOS's "zoom inside the background").
            val videoTransform = backgroundObject
                ?.takeIf { it.mediaURL != null && resolvedUrl != null }
                ?.let { StoryBackgroundObjectTransform.from(it) }
                ?: StoryBackgroundObjectTransform.IDENTITY
            return BackgroundMedia(
                imageUrl = null,
                videoUrl = resolvedUrl,
                loop = backgroundObject?.loop ?: true,
                transform = videoTransform,
            )
        }
        val imageUrl = resolvedUrl
            ?: media.firstOrNull { it.thumbnailUrl != null }?.thumbnailUrl?.let { resolveMediaUrl(it, config.socketUrl) }
        // The framing rides only on a modern `isBackground` object; a legacy/flat
        // fallback image never carries one, so it stays a plain aspect-fill (IDENTITY).
        val transform = backgroundObject
            ?.takeIf { imageUrl == resolvedUrl && resolvedUrl != null }
            ?.let { StoryBackgroundObjectTransform.from(it) }
            ?: StoryBackgroundObjectTransform.IDENTITY
        return BackgroundMedia(imageUrl = imageUrl, videoUrl = null, loop = true, transform = transform)
    }

    private fun StoryMediaObject.toForegroundMediaView(
        clipTransitions: List<StoryClipTransition>,
    ): StoryForegroundMediaView? {
        val url = mediaURL?.let { resolveMediaUrl(it, config.socketUrl) } ?: return null
        return StoryForegroundMediaView(
            id = id,
            url = url,
            isVideo = mediaType == "video",
            x = x,
            y = y,
            scale = scale,
            aspectRatio = aspectRatio,
            startTime = startTime ?: 0.0,
            duration = duration ?: 0.0,
            fadeIn = fadeIn ?: 0.0,
            fadeOut = fadeOut ?: 0.0,
            keyframes = keyframes.orEmpty(),
            clipTransitions = clipTransitions,
        )
    }

    /**
     * Resolves the URL of the slide's background (voice/library/effects track)
     * or foreground (non-background) audio, per [preferBackground].
     * `storyEffects.audioPlayerObjects` only carry a `postMediaId`, so the
     * playable URL is cross-referenced from the flat `media[]` list by id. When
     * no `audioPlayerObjects` exist at all, the background slot falls back to
     * the story's direct `audioUrl` (voice attachment) then its library
     * `backgroundAudio` entry — both already resolved URLs, no lookup needed.
     */
    private fun StoryItem.resolveAudioUrl(preferBackground: Boolean): String? {
        val match = storyEffects?.audioPlayerObjects.orEmpty()
            .firstOrNull { (it.isBackground == true) == preferBackground }
        val fromObject = match?.postMediaId
            ?.let { mediaId -> media.firstOrNull { it.id == mediaId }?.url }
            ?.let { resolveMediaUrl(it, config.socketUrl) }
        if (fromObject != null) return fromObject
        if (!preferBackground) return null
        return audioUrl?.let { resolveMediaUrl(it, config.socketUrl) }
            ?: backgroundAudio?.fileUrl?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, config.socketUrl) }
    }

    private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    companion object {
        const val USER_ID_ARG: String = "userId"
    }

    /**
     * Supprime la story COURANTE (la sienne uniquement — l'UI gate sur
     * [StoryViewerUiState.isOwnStory]) puis avance ou ferme : rester sur un slide
     * supprime rejouerait un fantome.
     */
    fun deleteCurrentStory(onEmpty: () -> Unit) {
        val storyId = _state.value.currentStoryId ?: return
        viewModelScope.launch {
            if (storyRepository.delete(storyId) is NetworkResult.Success) {
                if (_state.value.hasNext) advance() else onEmpty()
            }
        }
    }

    /** Signale la story courante — best effort, meme semantique que le report de post. */
    fun reportCurrentStory(reason: ReportReason) {
        val storyId = _state.value.currentStoryId ?: return
        viewModelScope.launch {
            reportRepository.reportStory(storyId, reason, details = null)
        }
    }
}
