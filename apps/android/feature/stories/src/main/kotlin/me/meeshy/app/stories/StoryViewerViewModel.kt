package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.game.GameMomentPresence
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.sdk.util.resolveServedImageUrl
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.EngagementSessions
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.model.EngagementSurface
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.QualifiedView
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StoryTextObjectTranslationMerge
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.scene.SceneObjectNumbers
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.purgingDeadStories
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.sdk.story.toStoryItem
import javax.inject.Inject

@HiltViewModel
class StoryViewerViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val postRepository: PostRepository,
    private val sessionRepository: SessionRepository,
    private val socialSocket: SocialSocketManager,
    private val config: MeeshyConfig,
    private val reportRepository: ReportRepository,
    private val clock: CacheClock,
    private val privacyPreferencesStore: PrivacyPreferencesStore,
    savedStateHandle: SavedStateHandle,
    private val gameMoment: GameMomentPresence = GameMomentPresence(),
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    /** La story précise à ouvrir (une story republiée) ; `null` : le lecteur démarre à la première non vue de l'auteur. */
    private val requestedStoryId: String? = savedStateHandle.get<String>(STORY_ID_ARG)?.takeIf { it.isNotBlank() }

    private val projector = StorySlideProjector(config.apiBaseUrl)

    private var playback: StoryPlayback = StoryPlayback(groups = emptyList())

    /** Pause de l'appui long — portée par [emit] tant que la story n'a pas repris. */
    private var isHoldPaused = false

    /** Une célébration du jeu recouvre l'écran : la story se fige dessous (iOS `isGameMomentShown`). */
    private var isGameMomentShown = false

    /** Son coupé pour toute la session de lecture — porté par [emit]. */
    private var isMuted = false

    /** Optimistic reaction state per slide id, seeded lazily from the slide's count. */
    private val reactionStates = mutableMapOf<String, StoryReactionState>()

    /** Raw items by slide id — needed to re-resolve text when the language override changes. */
    private val rawItems = mutableMapOf<String, StoryItem>()

    /** Ephemeral "Exploration" override, keyed to the slide it was chosen on. */
    private var languageOverride: Pair<String, String>? = null
    private var explorerOpen = false

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

    /**
     * Dwell bookkeeping for the story-viewer surface — the 4th single-focus surface, joining
     * reels/detail/status. Held outside [_state] since it is an analytics cursor, not something
     * the UI renders (the same placement as [currentRoomStoryId], and as the feed ViewModels'
     * dwell sessions). The pure [EngagementSessions] machine owns the *how* (monotonic dwell,
     * qualification); this ViewModel owns the *when* — the session moves WITH the slide on screen
     * (begun on the one landed on, ended on the one left) via [transitionDwell] in [emit], mirroring
     * iOS `StoryViewerView` re-arming `EngagementTracker` on each slide. [currentDwellStoryId]
     * guards the transition so a same-slide re-emit (a reaction, a translation merge) neither ends
     * nor restarts the running session.
     *
     * A qualified dwell records `viewPost(id, dwellMs)` — a story slide id IS a post id, so the
     * measured watch-time rides the very `posts/{id}/view` endpoint the impression already uses,
     * carrying its optional `duration`. The gateway dedups: the impression increments `viewCount`
     * once, the dwell only raises the stored `duration` to its max — purely additive, no double-count.
     */
    private var sessions = EngagementSessions()
    private var currentDwellStoryId: String? = null

    init {
        load()
        observeReactionDeltas()
        observeTranslationUpdates()
        observeStoryDeletions()
        observeStoryUpdates()
        observeGameMoment()
    }

    private fun observeGameMoment() {
        viewModelScope.launch {
            gameMoment.isPresented.collect {
                isGameMomentShown = it
                _state.update { state -> state.copy(isPaused = isHoldPaused || it) }
            }
        }
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
            socialSocket.storyUpdated.collectEachSafely { event ->
                val storyId = event.story.id
                val existingSlide = playback.groups.firstNotNullOfOrNull { group ->
                    group.slides.firstOrNull { it.id == storyId }
                } ?: return@collectEachSafely
                val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
                val newSlide = event.story.toStoryItem().let { item -> rawItems[item.id] = item; projector.project(item, existingSlide.accentHex, prefs) }
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
            socialSocket.storyDeleted.collectEachSafely { event ->
                val next = playback.removingSlide(event.storyId)
                if (next == playback) return@collectEachSafely
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
            socialSocket.storyTranslationUpdated.collectEachSafely { event ->
                val item = rawItems[event.postId] ?: return@collectEachSafely
                val merged = StoryTextObjectTranslationMerge.merge(item, event.textObjectIndex, event.translations)
                if (merged == item) return@collectEachSafely
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
            socialSocket.storyReacted.collectEachSafely {
                onReactionDelta(it.storyId, it.emoji, delta = 1, actorId = it.userId)
            }
        }
        viewModelScope.launch {
            socialSocket.storyUnreacted.collectEachSafely {
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

    /**
     * Ouvre la lecture sur l'auteur demandé, cache d'abord (iOS
     * `StoryViewerContainer.ensureGroupAvailable`) : les stories déjà en main dans la barre
     * s'affichent sans réseau, hors ligne compris ; le réseau n'est interrogé que si
     * l'auteur y manque. Introuvable des deux côtés ⇒ [StoryViewerUiState.loadFailed]
     * (Réessayer / Fermer), jamais la story d'un autre auteur, jamais une fermeture seule.
     *
     * Une story PRÉCISE demandée ([requestedStoryId], une story republiée) que ni le cache ni le réseau ne portent vivante
     * (expirée, supprimée, auteur absent) n'est pas un échec de chargement : [StoryViewerUiState.missingStoryId] laisse
     * l'écran ouvrir la fiche du post, comme avant.
     */
    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadFailed = false) }
            if (startFrom(attempt { storyRepository.cachedStories() })) return@launch
            val network = attempt { (storyRepository.list() as? NetworkResult.Success)?.data }
            if (startFrom(network)) return@launch
            _state.update {
                if (requestedStoryId != null) it.copy(isLoading = false, missingStoryId = requestedStoryId)
                else it.copy(isLoading = false, loadFailed = true)
            }
        }
    }

    /** Relance l'ouverture après un échec (bouton Réessayer du repli). */
    fun retry() {
        if (!_state.value.loadFailed) return
        load()
    }

    /** Une lecture qui échoue (cache illisible, réseau, projection) vaut « rien en main ». */
    private inline fun <T> attempt(block: () -> T?): T? =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }

    /**
     * Les stories expirées d'un AUTRE auteur ne se rejouent pas (la barre les a déjà
     * retirées) ; l'auteur garde les siennes, comme dans la barre
     * ([purgingDeadStories]).
     */
    private fun startFrom(posts: List<ApiPost>?): Boolean {
        if (posts.isNullOrEmpty()) return false
        val currentUserId = sessionRepository.currentUserId
        val groups = attempt {
            posts.toStoryGroups(currentUserId = currentUserId, nowMillis = clock.nowMillis())
                .purgingDeadStories(currentUserId = currentUserId, nowMillis = clock.nowMillis())
                .map { it.toGroupSlides() }
        } ?: return false
        val next = StoryPlayback.forAuthor(groups, userId, requestedStoryId) ?: return false
        playback = next
        emit()
        return true
    }

    /** Leaves the post room the viewer was sitting in, so a closed viewer stops receiving its events. */
    override fun onCleared() {
        endCurrentDwell()
        currentRoomStoryId?.let { socialSocket.leavePostRoom(it) }
        currentRoomStoryId = null
        super.onCleared()
    }

    /** La story telle que la passerelle l'a servie — ce que l'export vidéo lit (objets sonores, fenêtres, pièces). */
    fun rawItem(id: String): StoryItem? = rawItems[id]

    /** Appui long : la story se fige (iOS `explicitPause`). */
    fun pauseByHold() {
        if (playback.currentSlide == null || _state.value.isPaused) return
        isHoldPaused = true
        _state.update { it.copy(isPaused = true) }
    }

    /**
     * Appui long sur la scène (iOS `StoryGestureOverlayView`, spec 2026-07-25) : un TOGGLE.
     * Le premier fige la story, un second, tenu pendant qu'elle est figée, la reprend — le
     * relâchement, lui, ne reprend jamais (c'est le toucher suivant qui le fait, sans naviguer).
     */
    fun toggleByHold() {
        if (isHoldPaused) resume() else pauseByHold()
    }

    /**
     * Toucher simple sur la scène (iOS `StoryGestureDecisions`) : un BORD reprend une story
     * figée sans naviguer, sinon il navigue ; la bande CENTRALE ne fait rien — elle appartient
     * au double toucher.
     */
    fun onCanvasTap(zone: StoryTapZone) {
        if (zone == StoryTapZone.Center) return
        if (isHoldPaused) {
            resume()
            return
        }
        if (zone == StoryTapZone.Previous) back() else advance()
    }

    /** Double toucher dans la bande centrale : bascule pause / lecture, sans naviguer. */
    fun onCanvasDoubleTap() {
        if (isHoldPaused) resume() else pauseByHold()
    }

    private fun resume() {
        isHoldPaused = false
        _state.update { it.copy(isPaused = false) }
    }

    /** Coupe ou rétablit le son de toutes les pistes de la session (iOS `StoryGlobalMute`). */
    fun toggleMute() {
        isMuted = !isMuted
        _state.update { it.copy(isMuted = isMuted) }
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
        isHoldPaused = false
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

    /** Choix dans l'explorateur de langues : la langue s'AFFICHE et se rechoisit sans basculer (≠ puce). */
    fun selectLanguage(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        languageOverride = storyId to code
        emit()
    }

    fun openLanguageExplorer() {
        if (playback.currentSlide == null) return
        explorerOpen = true
        emit()
    }

    fun closeLanguageExplorer() {
        explorerOpen = false
        emit()
    }

    fun markCurrentViewed() {
        val slideId = playback.currentSlide?.id ?: return
        viewModelScope.launch {
            runCatching { storyRepository.markViewed(slideId) }
        }
    }

    /**
     * Closes the story-viewer dwell session and, when it qualified, records the measured watch-time.
     * Public so the composition can end the last slide's dwell when the viewer leaves (the analogue
     * of iOS `StoryViewerView.onDisappear` → `EngagementTracker.end(.storyViewer)`); also called on
     * teardown ([onCleared]) as the reliable net. Idempotent — a second call, with no session open,
     * records nothing.
     */
    fun endCurrentDwell() {
        transitionDwell(null)
    }

    /**
     * Moves the dwell session with the slide on screen: ends the one left (recording it when it
     * passed the dwell floor) and begins the one landed on. Idempotent — re-passing the current id
     * (including `null`) is a no-op, so a same-slide re-emit neither closes nor restarts the running
     * session. A `null` [nextId] ends without re-arming (viewer dismissed/torn down). The port of
     * iOS `StoryViewerView` re-arming `EngagementTracker` per slide, and the dwell twin of
     * [transitionPostRoom].
     */
    private fun transitionDwell(nextId: String?) {
        if (nextId == currentDwellStoryId) return
        val (afterEnd, view) = sessions.end(EngagementSurface.STORY_VIEWER, clock.nowMillis())
        sessions = afterEnd
        view?.let { recordDwellView(it) }
        currentDwellStoryId = nextId
        nextId?.let {
            sessions = sessions.begin(
                EngagementSurface.STORY_VIEWER,
                it,
                clock.nowMillis(),
                consentGranted = privacyPreferencesStore.preferences.value.allowAnalytics,
            )
        }
    }

    /**
     * Best-effort dwell enrichment for a slide's existing view: `posts/{id}/view` with the measured
     * [QualifiedView.dwellMs]. The gateway's view credit is a `(postId, userId)` singleton, so this
     * never re-increments the view count already booked by the impression ([markCurrentViewed]) — it
     * only raises the stored dwell `duration` (the reco/monetisation watch-time signal) to its max.
     * Fire-and-forget, matching the impression: a failure is analytics the viewer should never see fail.
     */
    private fun recordDwellView(view: QualifiedView) {
        viewModelScope.launch {
            try {
                postRepository.viewPost(view.postId, view.dwellMs.toInt())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // best-effort — matches the impression view record
            }
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
        // Dwell follows the slide on screen; a dismissed viewer is treated as no slide, so the
        // running session ends the moment the viewer is swiped away rather than lingering to teardown.
        transitionDwell(if (playback.isDismissed) null else currentId)
        if (languageOverride != null && languageOverride?.first != currentId) languageOverride = null
        val override = languageOverride?.second
        val prefsNow = sessionRepository.currentUser.value ?: EmptyContentPreferences
        val currentItem = currentId?.let { rawItems[it] }
        val currentResolved = currentItem?.let { StoryContentResolver.resolve(it, prefsNow, override) }
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
            canCompose = rawItems[currentId]?.let { StoryRecomposition.offered(it.storyEffects, it.content, it.media.size) } == true,
            prefetchUrls = StoryPrefetchPlanner.plan(playback),
            canAutoAdvance = StoryAutoAdvanceGate.shouldCountdown(playback.currentSlide, resolvedImageUrls),
            availableLanguages = availableLanguagesFor(currentId),
            languageOverride = override,
            activeLanguageCode = currentResolved?.languageCode
                ?: override?.takeUnless(StoryLanguageOverride::isOriginal),
            languageExplorer = if (explorerOpen && currentItem != null && currentResolved != null) {
                StoryLanguageExplorerBuilder.build(
                    item = currentItem,
                    preferences = prefsNow,
                    resolved = currentResolved,
                    override = override,
                    translatingCodes = translatingCodesOf(currentId),
                )
            } else {
                null
            },
            isPaused = isHoldPaused || isGameMomentShown,
            isMuted = isMuted,
            authorAvatarUrl = playback.currentGroup?.avatarUrl,
            groupCount = playback.groups.size,
            authorUserId = playback.currentGroup?.userId,
            authorPresence = playback.currentGroup?.authorPresence?.takeUnless { playback.currentGroup?.userId == sessionRepository.currentUserId },
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

    private fun translatingCodesOf(storyId: String): Set<String> =
        translatingLanguages.mapNotNullTo(mutableSetOf()) { key ->
            key.substringAfter('|', "").takeIf { it.isNotEmpty() && key.substringBefore('|') == storyId }
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
            slides = stories.map { projector.project(it.also { item -> rawItems[item.id] = item }, avatarColor, prefs) },
            avatarUrl = resolveServedImageUrl(avatarURL, config.apiBaseUrl),
            authorPresence = authorPresence,
        )
    }


    private object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    companion object {
        const val USER_ID_ARG: String = "userId"
        const val STORY_ID_ARG: String = "storyId"
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
