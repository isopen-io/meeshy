package me.meeshy.app.stories

import me.meeshy.sdk.lang.ReaderPrism
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
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.StoryViewerScope
import me.meeshy.sdk.story.isExpired
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
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryViewerContentRules
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.story.StoryDirectRepostOutcome
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.StoryReactionDelivery
import me.meeshy.sdk.story.StoryReactionPublisher
import me.meeshy.sdk.story.StoryRepostPublisher
import me.meeshy.sdk.story.InMemoryStoryViewedLedger
import me.meeshy.sdk.story.StorySlideImpressions
import me.meeshy.sdk.story.StoryViewReporting
import me.meeshy.sdk.story.StoryViewedLedger
import me.meeshy.sdk.story.purgingDeadStories
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.ContentRemovalPolicy
import me.meeshy.sdk.model.ContentRemovalReason
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest
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
    private val repostPublisher: StoryRepostPublisher = storyRepository.asRepostPublisher(),
    private val reactionPublisher: StoryReactionPublisher = storyRepository.asReactionPublisher(),
    private val viewReporter: StoryViewReporting = StoryViewReporting { storyRepository.markViewed(it) },
    private val slideImpressions: StorySlideImpressions = StorySlideImpressions.None,
    private val viewedLedger: StoryViewedLedger = InMemoryStoryViewedLedger(),
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    /** La story précise à ouvrir (une story republiée) ; `null` : le lecteur démarre à la première non vue de l'auteur. */
    private val requestedStoryId: String? = savedStateHandle.get<String>(STORY_ID_ARG)?.takeIf { it.isNotBlank() }

    /**
     * L'intention d'entrée (feuille à ouvrir d'office, commentaire ciblé), posée par la route ; consommée une fois par
     * [consumeEntryIntent]. Sans auteur nommé (ouverture par l'id de la story), la lecture reste sur son groupe.
     */
    private var entryIntent: StoryEntryIntent? = StoryEntryIntent(
        action = StoryViewerInitialAction.fromWire(savedStateHandle.get<String>(ACTION_ARG)),
        targetCommentId = savedStateHandle.get<String>(COMMENT_ID_ARG)?.takeIf { it.isNotBlank() },
        targetParentCommentId = savedStateHandle.get<String>(PARENT_COMMENT_ID_ARG)?.takeIf { it.isNotBlank() },
    ).takeIf { it.action != null || it.targetCommentId != null }
    private val singleGroup: Boolean = userId.isBlank()

    private val projector = StorySlideProjector(config.apiBaseUrl)

    private var playback: StoryPlayback = StoryPlayback(groups = emptyList())

    /** Pause de l'appui long — portée par [emit] tant que la story n'a pas repris. */
    private var isHoldPaused = false

    /** Une célébration du jeu recouvre l'écran : la story se fige dessous (iOS `isGameMomentShown`). */
    private var isGameMomentShown = false

    /** Son coupé pour toute la session de lecture — porté par [emit]. */
    private var isMuted = false

    /** Les republications de ce lecteur, au geste puis confirmées ou rendues (#14443). */
    private var reposts = StoryRepostMarks()

    private val toastChannel = Channel<FeedbackToastRequest>(Channel.BUFFERED)

    /** Ce que le lecteur dit d'une action locale aboutie ou refusée (iOS `FeedbackToastManager`). */
    val toasts: Flow<FeedbackToastRequest> = toastChannel.receiveAsFlow()

    /** Optimistic reaction state per slide id, seeded lazily from the slide's count. */
    private val reactionStates = mutableMapOf<String, StoryReactionState>()

    /** Raw items by slide id — needed to re-resolve text when the language override changes. */
    private val rawItems = mutableMapOf<String, StoryItem>()

    /** Ephemeral "Exploration" override, keyed to the slide it was chosen on. */
    private val languageController = StoryLanguageController { clock.nowMillis() }
    private var explorerOpen = false

    /**
     * Image URLs whose load has resolved (succeeded or failed) on screen. Feeds
     * [StoryAutoAdvanceGate] so the countdown waits for the current slide's media
     * to paint. Persists across slides so revisiting an already-seen image never
     * re-waits.
     */
    private val resolvedImageUrls = mutableSetOf<String>()

    /** Focus audio et état des médias de la slide (lot story-playback-hold-and-stall) : lus par l'horloge du lecteur. */
    internal val interruption = StorySessionInterruptionController()
    internal val mediaSignal = StoryMediaReadinessSignal()

    private val _state = MutableStateFlow(StoryViewerUiState())
    val state: StateFlow<StoryViewerUiState> = _state.asStateFlow()
    private val prefetchDirection = StoryPrefetchDirectionTracker()
    private val _prefetch = MutableStateFlow(StoryPrefetchPlan())
    val prefetch: StateFlow<StoryPrefetchPlan> = _prefetch.asStateFlow()

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
            val selfId = sessionRepository.currentUserId
            if (startFrom(viewedLedger.reinjected(attempt { storyRepository.cachedStories() }, selfId))) return@launch
            val network = attempt { (storyRepository.list() as? NetworkResult.Success)?.data }
            if (startFrom(viewedLedger.reinjected(network, selfId))) return@launch
            if (startFrom(attempt { fetchRequestedStory() })) return@launch
            _state.update {
                if (requestedStoryId != null) it.copy(isLoading = false, missingStoryId = requestedStoryId)
                else it.copy(isLoading = false, loadFailed = true)
            }
        }
    }

    /**
     * Le plateau ignore ce groupe : on ne retélécharge pas tout le plateau, on demande la story nommée seule (iOS
     * `fetchStoryPost`). Sans story nommée, ou si la passerelle la refuse, rien — le lecteur dit « introuvable ».
     */
    private suspend fun fetchRequestedStory(): List<ApiPost>? {
        val id = requestedStoryId ?: return null
        return (postRepository.getPost(id) as? NetworkResult.Success)?.data?.let(::listOf)
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
        val authorId = userId.ifBlank { posts.firstOrNull { it.id == requestedStoryId }?.author?.id.orEmpty() }
        val currentUserId = sessionRepository.currentUserId
        val now = clock.nowMillis()
        val groups = attempt {
            posts.toStoryGroups(currentUserId = currentUserId, nowMillis = now)
                .purgingDeadStories(currentUserId = currentUserId, nowMillis = now)
                .let { StoryViewerScope.liveOnly(it, currentUserId, requestedStoryId) { story -> story.isExpired(now) } }
                .map { it.toGroupSlides() }
        } ?: return false
        val opened = StoryPlayback.forAuthor(groups, authorId, requestedStoryId) ?: return false
        playback = if (singleGroup) opened.restrictedToCurrentGroup() else opened
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

    /** Le groupe d'auteur à [index] (l'interlude d'identité annonce le voisin), `null` hors bornes. */
    fun groupAt(index: Int): StoryGroupSlides? = playback.groups.getOrNull(index)

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

    /** Vrai tant qu'un appui long a figé la story (iOS `isLongPressPaused`). */
    val isHeldPaused: Boolean get() = isHoldPaused

    /** Le toucher de reprise : relance une story figée par un appui long, sans naviguer. */
    fun resumeFromTouch() {
        if (isHoldPaused) resume()
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
        languageController.tap(storyId, code)
        emit()
    }

    /** Choix dans l'explorateur de langues : la langue s'AFFICHE et se rechoisit sans basculer (≠ puce). */
    fun selectLanguage(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        languageController.select(storyId, code)
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
        slideImpressions.record(slideId)
        viewModelScope.launch {
            runCatching { viewReporter.report(slideId) }
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
     * Quick-strip reaction on the current slide. The count moves optimistically; a repeat of the same emoji is inert
     * (no network). A transport failure keeps the heart lit (the reaction waits in the outbox); a server refusal takes
     * back exactly this tap on the story it was made on, and says why.
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
            val delivery = try {
                reactionPublisher.publish(slideId, emoji)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                StoryReactionDelivery.Refused(httpStatus = null, limitReached = false)
            }
            val recovery = StoryReactionRecovery.decide(delivery) as? StoryReactionRecovery.Rollback ?: return@launch
            withdrawReaction(slideId, emoji)
            if (playback.currentSlide?.id == slideId) {
                toastChannel.trySend(FeedbackToastRequest(recovery.messageRes, FeedbackKind.Error))
            }
        }
    }

    /**
     * « Republier » (#14443, #15067, iOS `StoryDirectRepost`) : la story à l'écran repart d'un seul geste, chez autrui
     * seulement — en story depuis le rail, en post ou en réel depuis le menu. En story, le compteur et la marque bougent
     * aussitôt ; un refus les rend et dit pourquoi, hors ligne la republication part au retour du réseau.
     */
    fun repostCurrentStory(destination: StoryRepostDestination = StoryRepostDestination.STORY) {
        val storyId = playback.currentSlide?.id ?: return
        if (playback.currentGroup?.userId == sessionRepository.currentUserId) return
        val marked = destination == StoryRepostDestination.STORY
        if (marked) {
            reposts = reposts.begun(storyId) ?: return
            emit()
        }
        viewModelScope.launch {
            val outcome = try {
                repostPublisher.publish(storyId, destination)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                StoryDirectRepostOutcome.Refused(StoryRepostFailure.OTHER)
            }
            if (marked) {
                reposts = if (outcome.isDone) reposts.confirmed(storyId) else reposts.refused(storyId)
                emit()
            }
            outcome.toast(destination)?.let { toastChannel.trySend(it) }
        }
    }

    private fun withdrawReaction(slideId: String, emoji: String) {
        val current = reactionStates[slideId] ?: return
        reactionStates[slideId] = current.withdrawnLocally(emoji)
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

    /** La chaîne du Prisme pour la transcription : l'exploration en tête, puis les rangs stricts du lecteur. */
    fun transcriptLanguageChain(): List<String> = StoryViewerContentRules.viewerLanguageChain(
        base = StoryContentResolver.readerLanguages(sessionRepository.currentUser.value ?: EmptyContentPreferences),
        override = languageController.overrideFor(playback.currentSlide?.id),
    )

    private fun emit() {
        val now = clock.nowMillis()
        playback = playback.skippingUnplayable(sessionRepository.currentUserId, { rawItems[it] }) { it.isExpired(now) }
        val currentId = playback.currentSlide?.id
        transitionPostRoom(currentId)
        // Dwell follows the slide on screen; a dismissed viewer is treated as no slide, so the
        // running session ends the moment the viewer is swiped away rather than lingering to teardown.
        transitionDwell(if (playback.isDismissed) null else currentId)
        val override = languageController.overrideFor(currentId)
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
            val preferredLanguages = StoryContentResolver.readerLanguages(prefs)
            val textObjects = item.storyEffects?.textObjects.orEmpty()
                .map { StoryTextObjectProjection.project(it, preferredLanguages, override) }
            slideView.copy(
                text = resolved.content,
                isTranslated = resolved.isTranslated,
                languageCode = resolved.languageCode,
                textObjects = textObjects,
            )
        }
        _prefetch.value = StoryPrefetchPlanner.planWindow(playback, prefetchDirection.observe(playback))
        _state.value = StoryViewerUiState(
            authorName = playback.authorName,
            slides = slides,
            index = playback.slideIndex,
            groupIndex = playback.groupIndex,
            isLoading = false,
            isDismissed = playback.isDismissed,
            reactionCount = reaction.count,
            myReactions = reaction.mine,
            repostCount = reposts.count(currentId, currentItem?.repostCount ?: 0),
            hasReposted = reposts.has(currentId),
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
                    translatingCodes = translatingCodesOf(currentId, currentItem),
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
        val translatable = ReaderPrism.resolve(user)
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
            isTranslating = languageController.isTranslating(storyId, code),
        )
    }

    /** Les langues qui tournent : première traduction demandée, ou retraduction dont le texte n'a pas bougé. */
    private fun translatingCodesOf(storyId: String, item: StoryItem): Set<String> =
        languageController.translatingCodes(storyId) +
            languageController.retranslatingCodes(storyId) { code -> item.translatedText(code) }

    private fun StoryItem.translatedText(code: String): String? =
        translations.orEmpty().firstOrNull { it.language.equals(code, ignoreCase = true) }?.content

    /**
     * « Retraduire » : la base du texte servi est mémorisée, le spinner tient jusqu'à ce qu'il change (traduction
     * arrivée par socket ou tirée ici) ou 20 s, puis l'écran se rafraîchit seul (iOS `retranslateTimeout`).
     */
    fun retranslateStory(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        val baseline = rawItems[storyId]?.translatedText(code) ?: return
        languageController.beginRetranslation(storyId, code, baseline)
        emit()
        viewModelScope.launch {
            delay(StoryViewerContentRules.RETRANSLATE_TIMEOUT_MILLIS)
            emit()
        }
        requestStoryTranslation(code)
    }

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
        if (!languageController.beginTranslation(storyId, target)) return
        emit()
        viewModelScope.launch {
            try {
                val merged = storyRepository.translateStory(item, target)
                if (merged != null) {
                    rawItems[storyId] = merged
                    languageController.select(storyId, target)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Inert — a failed request leaves the strip untouched to retry.
            } finally {
                languageController.endTranslation(storyId, target)
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

    /**
     * L'intention d'entrée, rendue UNE fois et seulement quand une story est à l'écran : la feuille de commentaires ou
     * de vues que la notification désignait. Les appels suivants rendent `null`.
     */
    fun consumeEntryIntent(): StoryEntryIntent? {
        if (playback.currentSlide == null) return null
        return entryIntent.also { entryIntent = null }
    }

    companion object {
        const val USER_ID_ARG: String = "userId"
        const val STORY_ID_ARG: String = "storyId"
        const val ACTION_ARG: String = "action"
        const val COMMENT_ID_ARG: String = "commentId"
        const val PARENT_COMMENT_ID_ARG: String = "parentCommentId"
    }

    /**
     * Supprime la story COURANTE (la sienne uniquement — l'UI gate sur [StoryViewerUiState.isOwnStory]).
     * Optimiste : la slide quitte le plateau tout de suite, le lecteur reste sur le contenu survivant, et le
     * refus du serveur la rétablit avec un toast. La toute dernière slide ferme le lecteur à la confirmation.
     */
    fun deleteCurrentStory() = retireCurrentStory(reason = null)

    /** Retrait par la modération, avec son motif (#11151) : sans motif valide (3 à 500 caractères), rien ne part. */
    fun removeCurrentStory(reason: String) {
        val normalized = ContentRemovalReason.normalized(reason) ?: return
        retireCurrentStory(reason = normalized)
    }

    /** « Retirer » s'offre à la modération de la plateforme sur la story d'un autre, jamais sur la sienne. */
    fun mayRemoveCurrentStory(): Boolean =
        ContentRemovalPolicy.mayRemovePublication(_state.value.isOwnStory, sessionRepository.currentUser.value?.role)

    private fun retireCurrentStory(reason: String?) {
        val storyId = _state.value.currentStoryId ?: return
        val snapshot = playback
        val rawSnapshot = rawItems[storyId]
        val next = snapshot.removingSlide(storyId)
        val lastOne = next.isDismissed
        if (!lastOne) {
            playback = next
            rawItems.remove(storyId)
            reactionStates.remove(storyId)
            emit()
        }
        viewModelScope.launch {
            val result = if (reason == null) storyRepository.delete(storyId) else storyRepository.delete(storyId, reason)
            if (result is NetworkResult.Success) {
                if (lastOne) {
                    playback = next
                    emit()
                }
                return@launch
            }
            if (!lastOne) {
                playback = snapshot
                rawSnapshot?.let { rawItems[storyId] = it }
                emit()
            }
            toastChannel.trySend(FeedbackToastRequest(R.string.my_stories_delete_error, FeedbackKind.Error))
        }
    }

    /**
     * Signale la story courante : motif plus détail libre. [onDone] reçoit l'issue (vrai = envoyé) pour l'haptique
     * succès ou erreur ; hors session, l'appel est inerte et compte comme un échec.
     */
    fun reportCurrentStory(reason: ReportReason, details: String? = null, onDone: (Boolean) -> Unit = {}) {
        val storyId = _state.value.currentStoryId ?: return
        viewModelScope.launch {
            val result = reportRepository.reportStory(storyId, reason, details?.trim()?.takeIf { it.isNotEmpty() })
            onDone(result is NetworkResult.Success)
        }
    }
}
