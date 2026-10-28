package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.ComposerHashtags
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.scene.StoryBackgroundFraming
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import java.time.Instant
import javax.inject.Inject

/**
 * Drives the text story composer — parity with iOS `StoryComposerViewModel` +
 * `StoryPublishService`, surpassing it: where iOS posts via a dedicated story
 * queue, Android publishes through the **shared durable outbox**
 * ([StoryRepository.enqueuePublish]) on its own lane, so a publish survives
 * process death / offline and retries automatically without head-of-line
 * blocking messages. The publish is optimistic — the composer dismisses the
 * instant the row is queued (the `published` signal); the tray reconciles the
 * real story via its SWR revalidation / `story:created` socket.
 *
 * The publisher's content language is resolved once from the signed-in identity
 * via the single-source-of-truth [LanguageResolver] (Prisme), never re-derived.
 */
@HiltViewModel
class StoryComposerViewModel @Inject constructor(
    private val storyRepository: StoryRepository,
    private val sessionRepository: SessionRepository,
    private val mediaUploader: StoryMediaUploader,
    private val mediaUploadQueue: MediaUploadQueue,
    private val workManager: WorkManager,
    private val draftStore: StoryComposerDraftStore,
    private val mediaBlobStore: MediaBlobStore,
    private val draftConfirmation: StoryDraftConfirmation,
    private val blocks: BlockCache = BlockCache(),
    private val config: MeeshyConfig = MeeshyConfig(),
) : ViewModel() {

    private val _state = MutableStateFlow(StoryComposerUiState())
    private var history = ComposerHistory(_state.value.snapshot())
    val state: StateFlow<StoryComposerUiState> = _state.asStateFlow()

    /** The author colour the reader paints a background-less slide with (#12314). */
    val authorAccentHex: String get() = StorySceneFill.authorAccentHex(sessionRepository.currentUser.value)

    /** One-shot signal that a story was queued — the screen dismisses on it. */
    private val _published = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val published: SharedFlow<Unit> = _published.asSharedFlow()

    /** A repost door brings its own matter: the stored draft is not this session's until it restored or wrote it. */
    private var seededByDoor = false
    private var ownsStoredDraft = false

    /**
     * Restores a persisted draft when the screen opens — iOS `onAppear` + `StoryDraftStore.load`.
     * Silent and pristine-only: it never clobbers work begun in the async gap, a corrupt blob is
     * inert, and audience, repost link and annotations are re-armed with the slides.
     */
    fun onEnterComposer(seededByDoor: Boolean = false) {
        this.seededByDoor = seededByDoor
        viewModelScope.launch {
            draftConfirmation.settle()
            val stored = draftStore.load()
            val restored = StoryComposerAutosave.restore(
                stored = stored,
                deckIsPristine = StoryComposerAutosave.deckIsPristine(_state.value.deck),
                seededByDoor = seededByDoor,
            ) ?: return@launch
            ownsStoredDraft = true
            val availableIds = restored.slides
                .flatMap { it.mediaIds }
                .toSet()
                .filter { id -> isRestoredMediaAvailable(id) }
                .toSet()
            val reconciled = StoryDraftMediaReconciler.reconcile(restored) { id -> id in availableIds }
            // Media loss can empty the whole draft; a snapshot no longer worth
            // restoring must not seed a deck of blank slides — purge it instead so a
            // later cold start never rebuilds the dead draft.
            if (!reconciled.snapshot.isWorthRestoring) {
                draftStore.clear()
                return@launch
            }
            val deck = reconciled.snapshot.toDeck() ?: return@launch
            _state.update {
                it.copy(
                    deck = deck,
                    draft = it.draft
                        .withVisibility(StoryVisibility.fromWire(reconciled.snapshot.visibility))
                        .withVisibilityUserIds(reachable(reconciled.snapshot.visibilityUserIds, StoryVisibility.fromWire(reconciled.snapshot.visibility)))
                        .withRepostOf(reconciled.snapshot.repostOfId)
                        .withAnnotations(
                            reconciled.snapshot.annotations.keepingMedia(
                                reconciled.snapshot.slides.flatMap { slide -> slide.mediaIds },
                            ),
                        ),
                    errorMessage = if (reconciled.hasLoss) MEDIA_RESTORE_LOST else it.errorMessage,
                ).withAudiencePurged().mirrorDraftToSelection()
            }
            resetHistory()
        }
    }

    /**
     * Whether a restored draft's media [id] can still be published: an offline placeholder
     * ([OutboxIds.isCmid]) needs its bytes in the blob store; a server id is always available.
     */
    private suspend fun isRestoredMediaAvailable(id: String): Boolean =
        !OutboxIds.isCmid(id) || mediaBlobStore.has(id)

    /** Persists or purges the draft when the screen leaves — iOS's save-on-dismiss; [StoryComposerAutosave] decides. */
    fun persistDraft() {
        viewModelScope.launch {
            val current = _state.value
            val action = StoryComposerAutosave.resolve(
                deck = current.deck,
                visibility = current.draft.visibility,
                repostOfId = current.draft.repostOfId,
                nowIso = Instant.now().toString(),
                previous = draftStore.load(),
                visibilityUserIds = current.draft.visibilityUserIds,
                annotations = current.draft.annotations(),
                mayOverwriteStored = !seededByDoor || ownsStoredDraft,
            )
            when (action) {
                is StoryDraftPersist.Save -> {
                    draftStore.save(action.snapshot)
                    ownsStoredDraft = true
                }
                StoryDraftPersist.Clear -> draftStore.clear()
                StoryDraftPersist.None -> Unit
            }
        }
    }

    /** Routes the text field to the selected element, else the slide caption. */
    fun onTextChange(text: String) = reduce("type") { StoryComposerTextReducer.typed(it, text) }

    /** Adds an empty on-canvas text element and selects it (warns at the ≤5-element cap). */
    fun onAddTextElement() {
        val id = newTextElementId()
        reduce { StoryComposerSceneReducer.placedAtPlayhead(it) { s -> StoryComposerTextReducer.added(s, id) } }
    }

    fun onSelectTextElement(id: String) = reduce { StoryComposerTextReducer.selected(it, id) }

    fun onDeselectTextElement() = reduce { StoryComposerTextReducer.deselected(it) }

    fun onOpenElementMenu(id: String) = reduce { StoryComposerTextReducer.menuOpened(it, id) }

    fun onDismissElementMenu() = reduce { StoryComposerSceneReducer.menuDismissed(it) }

    /** Appui long sur un sticker : ouvre son menu, le sélectionne. */
    fun onOpenStickerMenu(id: String) = reduce { StoryComposerSceneReducer.stickerMenuOpened(it, id) }

    /**
     * Exécute l'[action] choisie sur l'objet dont le menu est ouvert, puis ferme le menu. Une action
     * que la loi n'offre pas (ou un menu périmé) ne touche à rien : loi 4, un geste sans effet n'existe pas.
     */
    fun onSceneMenuAction(action: SceneObjectMenu.Action) {
        val menu = _state.value.sceneContextMenu
        if (menu != null && action in menu.actions) {
            val id = menu.ref.id
            val text = menu.ref.kind == ComposerObjectKind.TEXT
            when (action) {
                SceneObjectMenu.Action.EDIT -> onSelectTextElement(id)
                SceneObjectMenu.Action.DUPLICATE -> if (text) onDuplicateTextElement(id) else onDuplicateSticker(id)
                SceneObjectMenu.Action.DELETE -> if (text) onRemoveTextElement(id) else onRemoveSticker(id)
                SceneObjectMenu.Action.BRING_FORWARD -> onReorderScene(menu.ref, StoryZOrder.FORWARD)
                SceneObjectMenu.Action.SEND_BACKWARD -> onReorderScene(menu.ref, StoryZOrder.BACKWARD)
                SceneObjectMenu.Action.TRIM,
                SceneObjectMenu.Action.LEAVE_SCENE,
                SceneObjectMenu.Action.SET_AS_BACKGROUND,
                SceneObjectMenu.Action.REPLACE_BACKGROUND,
                -> Unit
            }
        }
        onDismissElementMenu()
    }

    private fun onReorderScene(ref: SceneObjectRef, op: StoryZOrder) =
        if (ref.kind == ComposerObjectKind.TEXT) onReorderTextElement(ref.id, op)
        else reduce { StoryComposerSceneReducer.stickerReordered(it, ref.id, op) }

    fun onDuplicateSticker(id: String) {
        val newId = newStickerId()
        reduce { StoryComposerSceneReducer.stickerDuplicated(it, id, newId) }
    }

    /** Pose la fenêtre d'un objet (0 = permanent), depuis la frise ou l'inspecteur. */
    fun onSceneObjectWindow(id: String, startSeconds: Float, durationSeconds: Float) =
        reduce { StoryComposerSceneReducer.windowed(it, id, startSeconds, durationSeconds) }

    /** Le bouton « Animé » : allume la scène animée et sa frise, ou l'éteint. */
    fun onToggleSceneAnimation() = reduce { StoryComposerSceneReducer.animationToggled(it) }

    fun onPlayheadMoved(seconds: Float) = _state.update { StoryComposerSceneReducer.playheadMoved(it, seconds) }

    fun onFriseTrackSelected(id: String) = reduce { StoryComposerSceneReducer.trackSelected(it, id) }

    /** Drags element [id] by normalised deltas with magnetic snapping. */
    fun onTextElementMoved(id: String, dx: Float, dy: Float) = reduce(transformGesture(id)) { StoryComposerTextReducer.moved(it, id, dx, dy) }

    fun onTextElementDragEnd() = reduce { StoryComposerTextReducer.dragEnded(it) }

    fun onRemoveTextElement(id: String) = reduce { StoryComposerTextReducer.removed(it, id) }

    fun onTextElementStyle(id: String, style: StoryTextStyle) = reduce { StoryComposerTextReducer.styled(it, id, style) }

    fun onTextElementColor(id: String, color: String) = reduce { StoryComposerTextReducer.colored(it, id, color) }

    fun onTextElementAlign(id: String, align: StoryTextAlign) = reduce { StoryComposerTextReducer.aligned(it, id, align) }

    fun onTextElementBackground(id: String, background: StoryTextBackground) =
        reduce { StoryComposerTextReducer.backed(it, id, background) }

    fun onTextElementCycleSize(id: String) = reduce { StoryComposerTextReducer.sizeCycled(it, id) }

    fun onTextElementCycleOutline(id: String) = reduce { StoryComposerTextReducer.outlineCycled(it, id) }

    fun onTextElementCycleFadeIn(id: String) = reduce { StoryComposerTextReducer.fadeInCycled(it, id) }

    fun onTextElementCycleFadeOut(id: String) = reduce { StoryComposerTextReducer.fadeOutCycled(it, id) }

    fun onTextElementCycleStart(id: String) = reduce { StoryComposerTextReducer.startCycled(it, id) }

    fun onTextElementCycleDuration(id: String) = reduce { StoryComposerTextReducer.durationCycled(it, id) }

    fun onTextElementTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce(transformGesture(id)) { StoryComposerTextReducer.transformed(it, id, scaleBy, rotateByDeg) }

    fun onReorderTextElement(id: String, op: StoryZOrder) = reduce { StoryComposerTextReducer.reordered(it, id, op) }

    fun onDuplicateTextElement(id: String) {
        val newId = newTextElementId()
        reduce { StoryComposerTextReducer.duplicated(it, id, newId) }
    }

    /** Adds an emoji sticker to the selected slide and selects it (blank ignored, warns at the cap). */
    fun onAddSticker(emoji: String) {
        val id = newStickerId()
        reduce { StoryComposerSceneReducer.placedAtPlayhead(it) { s -> StoryComposerStickerReducer.added(s, emoji, id) } }
    }

    fun onSelectSticker(id: String) = reduce { StoryComposerStickerReducer.selected(it, id) }

    fun onDeselectSticker() = reduce { StoryComposerStickerReducer.deselected(it) }

    fun onRemoveSticker(id: String) = reduce { StoryComposerStickerReducer.removed(it, id) }

    fun onStickerMoved(id: String, dx: Float, dy: Float) = reduce(transformGesture(id)) { StoryComposerStickerReducer.moved(it, id, dx, dy) }

    fun onStickerTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce(transformGesture(id)) { StoryComposerStickerReducer.transformed(it, id, scaleBy, rotateByDeg) }

    /** Le doigt quitte le sticker : le geste se referme, le suivant sera son propre cran d'annulation. */
    fun onStickerDragEnd() = reduce { it }

    /** Glisser, pincer et tourner un même objet sont UN geste : une seule entrée d'annulation. */
    private fun transformGesture(id: String) = "transform:$id"

    /** Enters the drawing tool (closes the band, clears selections). */
    fun onEnterDrawingMode() = reduce { StoryComposerDrawingReducer.entered(it) }

    fun onExitDrawingMode() = reduce { StoryComposerDrawingReducer.exited(it) }

    fun onDrawColorSelected(colorHex: String) = reduce { StoryComposerDrawingReducer.colorSelected(it, colorHex) }

    fun onDrawWidthSelected(widthDesign: Double) = reduce { StoryComposerDrawingReducer.widthSelected(it, widthDesign) }

    /** Commits a captured freehand stroke (design-space [points]); a tap is dropped. */
    fun onStrokeCaptured(points: List<StoryDrawingStrokePoint>) {
        val id = newStrokeId()
        val now = Instant.now().epochSecond.toDouble()
        reduce { StoryComposerDrawingReducer.captured(it, points, id, now) }
    }

    fun onDrawUndo() = reduce { StoryComposerDrawingReducer.undone(it) }

    fun onVisibilityChange(visibility: StoryVisibility) {
        _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }
    }

    /** La liste « visible par » / « sauf » : l'appelant l'a déjà bornée aux personnes proposées. */
    fun onAudienceUserIdsChange(ids: List<String>) {
        _state.update { it.copy(draft = it.draft.withVisibilityUserIds(ids.distinct().take(ComposerAudienceSelection.MAX_USERS))) }
    }

    /** Nomme [person] dans la publication (rangée « Avec… »), une seule fois par pseudo. */
    fun onAddMention(person: AudienceCandidate) {
        _state.update { current ->
            val mentions = current.draft.mentions
            if (mentions.size >= MAX_MENTIONS) return@update current
            if (mentions.any { it.username.equals(person.username, ignoreCase = true) }) return@update current
            current.copy(
                draft = current.draft.copy(
                    mentions = mentions + PostMentionInput(userId = person.id, username = person.username, display = MENTION_DISPLAY),
                ),
            )
        }
    }

    fun onRemoveMention(username: String) {
        _state.update { current ->
            current.copy(draft = current.draft.copy(mentions = current.draft.mentions.filterNot { it.username.equals(username, ignoreCase = true) }))
        }
    }

    fun onMediaAltChange(mediaId: String, text: String) {
        _state.update { it.copy(draft = it.draft.copy(mediaAlt = MediaDescriptionLaw.with(it.draft.mediaAlt, mediaId, text))) }
    }

    fun onMediaCaptionChange(mediaId: String, text: String) {
        _state.update { it.copy(draft = it.draft.copy(mediaCaption = MediaDescriptionLaw.with(it.draft.mediaCaption, mediaId, text))) }
    }

    fun onAllowSoundExtractionChange(allowed: Boolean) {
        _state.update { it.copy(draft = it.draft.copy(allowSoundExtraction = allowed)) }
    }

    /** Retire [tag] du texte de TOUTES les slides : la balise EST dans la phrase, il n'y a pas de liste à côté. */
    fun onRemoveHashtag(tag: String) = reduce { current ->
        current.withDeckTransform { deck -> deck.mapSlideTexts { ComposerHashtags.removing(tag, it) } }
    }

    /**
     * Opens the composer as a **repost** of [sourceId]: the link rides onto every published
     * slide's wire request. Inert on a blank id; the author's own draft is untouched.
     */
    fun onRepostSource(sourceId: String) {
        if (sourceId.isBlank()) return
        _state.update { it.copy(draft = it.draft.withRepostOf(sourceId)) }
    }

    /** Tap on a tool of the row: opens, switches to or closes its panel per [ComposerBandState.tapTool]. */
    fun onBandToolTap(tool: StoryToolMode) {
        _state.update { it.copy(band = it.band.tapTool(tool)) }
    }

    /** Swipe up on a tool: forces its panel open. */
    fun onBandToolSwipeUp(tool: StoryToolMode) {
        _state.update { it.copy(band = it.band.swipeUpOnTool(tool)) }
    }

    /** Swipe down on the row: closes an open panel, otherwise hides the chrome (bare canvas). */
    fun onBandSwipeDown() {
        _state.update { it.copy(band = if (it.band.isPanelOpen) it.band.closeAnyPanel() else it.band.hideChrome()) }
    }

    /** Gives the chrome back after a voluntary hiding (ghost handle tap). */
    fun onBandShowChrome() {
        _state.update { it.copy(band = it.band.showChrome()) }
    }

    /** Closes the open panel (handle pulled under its minimum) and gives the row back. */
    fun onBandDismiss() {
        _state.update { it.copy(band = it.band.closeAnyPanel()) }
    }

    /** Appends a fresh empty slide and selects it (inert at the ≤10-slide cap). */
    fun onAddSlide() = applyDeck { it.addSlide(newSlideId()) }

    /** Inserts a clone of the selected slide right after it and selects the clone. */
    fun onDuplicateSelectedSlide() = applyDeck { it.duplicate(it.selectedId, newSlideId()) }

    /**
     * Removes the slide [id] (inert on the last remaining slide / unknown id) and reclaims
     * its media: dropped from the preview pools, and each offline-pending upload among them
     * is cancelled so a discarded slide never leaves an orphaned `UPLOAD_MEDIA` row.
     */
    fun onRemoveSlide(id: String) {
        val before = _state.value.deck
        val removed = before.slides.firstOrNull { it.id == id } ?: return
        val after = before.removeSlide(id)
        if (after === before) return
        val droppedMedia = removed.mediaIds.toSet()
        val pendingToCancel = _state.value.pendingUploads
            .filter { it.cmid in droppedMedia }
            .map(PendingMediaUpload::cmid)
        _state.update {
            it.copy(
                deck = after,
                attachments = it.attachments.filterNot { media -> media.id in droppedMedia },
                pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid in droppedMedia },
            ).mirrorDraftToSelection()
        }
        record()
        pendingToCancel.forEach { cancelDurableUpload(it) }
    }

    fun onMoveSlide(id: String, toIndex: Int) = applyDeck { it.move(id, toIndex) }

    fun onSelectSlide(id: String) = applyDeck { it.select(id) }

    /**
     * Applies one pinch-zoom + drag-pan gesture to the selected slide's persisted
     * [StoryCanvasTransform]. The canvas size that produced the offset is captured here: it
     * is exactly the size needed to normalise the offset back at publish.
     */
    fun onCanvasTransform(panX: Float, panY: Float, zoom: Float, canvasWidth: Float, canvasHeight: Float) {
        reduce("canvas") {
            it.copy(
                deck = it.deck.updateSelectedTransform(
                    it.deck.selectedSlide.transform.apply(panX, panY, zoom, canvasWidth, canvasHeight),
                ),
                canvasWidthPx = canvasWidth,
                canvasHeightPx = canvasHeight,
            ).mirrorDraftToSelection()
        }
    }

    /** Emprunte un son de l'étagère : il se pose en FOND de la slide sélectionnée (jamais deux fonds). */
    fun onBorrowSound(sound: me.meeshy.sdk.model.composer.sound.ApiSound) = applyDeck { it.borrowSoundOnSelected(sound) }

    /** L'adresse chargeable d'une piste posée : un son emprunté porte le chemin RELATIF que sert la passerelle. */
    fun playableSoundUrl(track: StoryAudioPlayerObject): String? =
        MediaRequestCredential.libraryAudioUrl(track.mediaURL, config.apiBaseUrl)

    /** Retire une piste de la slide sélectionnée — le son reste sur l'étagère, c'est un retrait de la scène. */
    fun onRemoveSound(id: String) = applyDeck { it.removeSelectedSound(id) }

    /** Le muet LOCAL d'une piste : elle reste posée, son volume tombe à 0 (mémento pour la rétablir). */
    fun onToggleSoundMute(id: String) = applyDeck { it.toggleSelectedSoundMute(id) }

    /** Sets (or clears) the selected slide's photo filter. */
    fun onSelectFilter(filter: StoryFilter?) = reduce { StoryComposerBackgroundReducer.filterSelected(it, filter) }

    fun onFilterIntensityChange(intensity: Float) =
        reduce("intensity") { StoryComposerBackgroundReducer.filterIntensityChanged(it, intensity) }

    /** Pins the selected slide's on-screen duration (bounded by the pure deck law). */
    fun onSlideDurationChange(seconds: Double) = reduce("duration") { StoryComposerBackgroundReducer.durationChanged(it, seconds) }

    /** Sets (or clears) the selected slide's backdrop colour. */
    fun onSlideBackgroundChange(background: me.meeshy.sdk.model.StoryBackgroundValue?) =
        reduce { StoryComposerBackgroundReducer.backgroundChanged(it, background) }

    /** Designates (or clears) the selected slide's single looping background media. */
    fun onToggleSlideBackgroundMedia(mediaId: String) =
        reduce { StoryComposerBackgroundReducer.backgroundMediaToggled(it, mediaId) }

    /** Sets whether the selected slide's designated video background loops. */
    fun onSetSlideBackgroundLoop(loop: Boolean) =
        reduce { StoryComposerBackgroundReducer.backgroundLoopSet(it, loop) }

    /**
     * Annule la dernière modification du deck (texte, sticker, fond, filtre, durée, médias, ordre
     * d'empilement, dessin) — iOS `undo()` de l'historique global. Inerte pile vide.
     */
    fun onUndo() {
        val (next, snapshot) = history.undone() ?: return
        history = next
        _state.update { it.restoredTo(snapshot).withHistoryFlags() }
    }

    fun onRedo() {
        val (next, snapshot) = history.redone() ?: return
        history = next
        _state.update { it.restoredTo(snapshot).withHistoryFlags() }
    }

    private fun StoryComposerUiState.withHistoryFlags(): StoryComposerUiState =
        copy(canUndo = history.canUndo, canRedo = history.canRedo)

    /** Empile le deck courant dans l'historique ; [gesture] = changement continu (un seul cran). */
    private fun record(gesture: String? = null) {
        history = history.recorded(_state.value.snapshot(), gesture)
        if (_state.value.canUndo != history.canUndo || _state.value.canRedo != history.canRedo) {
            _state.update { it.withHistoryFlags() }
        }
    }

    /** Repart d'un historique vierge sur l'état courant (brouillon restauré, publication). */
    private fun resetHistory() {
        history = ComposerHistory(_state.value.snapshot())
        _state.update { it.withHistoryFlags() }
    }

    private fun reduce(gesture: String? = null, next: (StoryComposerUiState) -> StoryComposerUiState) {
        _state.update(next)
        record(gesture)
    }

    /** Applies a structural deck transform, re-syncing the editor buffer to the selected slide. */
    private fun applyDeck(transform: (StorySlideDeck) -> StorySlideDeck) {
        reduce { it.withDeckTransform(transform) }
    }

    /**
     * Uploads freshly-picked media and attaches the returned ids to the draft.
     * Empty picks are inert; a second pick while an upload is in flight is ignored
     * (re-entrancy guard). On success the new media is **appended** so multiple
     * picks accumulate; an empty result (every row unusable) surfaces a message.
     *
     * When the synchronous upload **fails** (offline, throttled, 5xx — or refused, #13417),
     * every accepted item is instead queued **durably** ([queueDurably]) and staged
     * as a [PendingMediaUpload] placeholder, so the user can still publish — the
     * outbox uploads each and grafts the real ids when the network returns. Several
     * pending uploads accumulate across picks (and a multi-item offline batch stages
     * each item), surpassing iOS, which drops the pick on an offline upload. A
     * refused media is kept the same way: the publication carrying it fails retryable.
     */
    fun onMediaPicked(items: List<MediaUploadItem>) {
        if (items.isEmpty() || _state.value.isUploadingMedia) return
        val remaining = _state.value.deck.selectedRemainingMediaSlots
        if (remaining <= 0) {
            _state.update { it.copy(errorMessage = MEDIA_LIMIT) }
            return
        }
        val accepted = items.take(remaining)
        _state.update { it.copy(isUploadingMedia = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                when (val result = mediaUploader.upload(accepted)) {
                    is NetworkResult.Success -> applyUploaded(result.data)
                    is NetworkResult.Failure -> queueDurably(accepted)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(isUploadingMedia = false, errorMessage = e.message ?: MEDIA_FAILED) }
            }
        }
    }

    private fun applyUploaded(uploaded: List<UploadedMedia>) {
        if (uploaded.isEmpty()) {
            _state.update { it.copy(isUploadingMedia = false, errorMessage = MEDIA_UNUSABLE) }
            return
        }
        _state.update {
            val deck = uploaded.fold(it.deck) { acc, media -> acc.addMediaToSelected(media.id) }
            it.copy(deck = deck, attachments = it.attachments + uploaded, isUploadingMedia = false)
                .mirrorDraftToSelection()
        }
        record()
    }

    /**
     * Any failed upload is queued durably (single pick or batch). A refusal (4xx, e.g. a HEIC
     * the server would not take, #13412) is queued too (#13417): the media stays on the device
     * and the publication that carries it fails retryable in « Publications non envoyées »
     * instead of losing what the author picked.
     *
     * Enqueues each item durably and stages it as a pending upload, one at a time so
     * partial progress survives if a later enqueue throws (the already-staged items
     * stay, the caller's catch surfaces the error). Each enqueued blob + outbox row
     * shares the returned cmid, which rides in the draft as a placeholder media id.
     */
    private suspend fun queueDurably(items: List<MediaUploadItem>) {
        items.forEach { item ->
            val cmid = mediaUploadQueue.enqueue(item, context = TusUploadContext.STORY)
            _state.update {
                it.copy(
                    deck = it.deck.addMediaToSelected(cmid),
                    pendingUploads = it.pendingUploads + PendingMediaUpload(cmid = cmid, item = item),
                    errorMessage = null,
                ).mirrorDraftToSelection()
            }
            record()
        }
        _state.update { it.copy(isUploadingMedia = false) }
    }

    /**
     * Removes an attached or pending media (and its id from the draft) before
     * publishing. Removing an offline placeholder also **cancels** only that durable
     * upload ([MediaUploadQueue.cancel]) — the other pending uploads are untouched —
     * so no orphaned `UPLOAD_MEDIA` row keeps uploading bytes to a media the story
     * will never reference. The UI clears instantly (optimistic); the durable cancel
     * is best-effort — if it fails the stranded row simply exhausts harmlessly.
     */
    fun onRemoveMedia(id: String) {
        val wasPending = _state.value.pendingUploads.any { it.cmid == id }
        _state.update {
            val deck = it.deck.removeMedia(id)
            val next = if (wasPending) {
                it.copy(deck = deck, pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid == id })
            } else {
                it.copy(deck = deck, attachments = it.attachments.filterNot { media -> media.id == id })
            }
            next.withDescriptionsPruned().mirrorDraftToSelection()
        }
        record()
        if (wasPending) cancelDurableUpload(id)
    }

    private fun cancelDurableUpload(cmid: String) {
        viewModelScope.launch {
            try {
                mediaUploadQueue.cancel(cmid)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // Best-effort: a stranded UPLOAD_MEDIA row exhausts harmlessly on its own.
            }
        }
    }

    fun publish() {
        val current = _state.updateAndGet { it.withAudiencePurged() }
        if (!current.canPublish) return
        _state.update { it.copy(isPublishing = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val queued = publishPlans(current, resolvePublishLanguage()).mapNotNull { plan ->
                    storyRepository.enqueuePublish(plan.request, dependsOn = plan.dependsOn)
                }
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                keepDraftUntilConfirmed(current, queued)
                _state.update { StoryComposerUiState() }
                resetHistory()
                _published.tryEmit(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.update { it.copy(isPublishing = false, errorMessage = e.message ?: "Publish failed") }
            }
        }
    }

    /**
     * The draft is not erased at publish (#13417): it stays on the device, marked as awaiting
     * the stories it queued, until [StoryDraftConfirmation] sees every one of them confirmed by
     * the server or discarded by the author.
     */
    private suspend fun keepDraftUntilConfirmed(published: StoryComposerUiState, queued: List<String>) {
        if (seededByDoor && !ownsStoredDraft && draftStore.load() != null) return
        if (queued.isEmpty()) {
            draftStore.clear()
            return
        }
        val snapshot = published.deck.toDraftSnapshot(
            visibility = published.draft.visibility,
            repostOfId = published.draft.repostOfId,
            nowIso = Instant.now().toString(),
            visibilityUserIds = published.draft.visibilityUserIds,
            annotations = published.draft.annotations(),
        )
        draftStore.save(snapshot.copy(awaitingPublication = queued))
    }

    /**
     * La liste encore valable pour [visibility]. Sous ONLY, un compte bloqué depuis (et soi) n'est
     * plus un destinataire. Sous EXCEPT, la liste EXCLUT : retirer un bloqué en ferait de nouveau
     * un destinataire, donc seul soi en sort — une exclusion existante ne se perd jamais.
     */
    private fun reachable(ids: List<String>, visibility: StoryVisibility): List<String> {
        val selfId = sessionRepository.currentUser.value?.id
        if (visibility != StoryVisibility.ONLY) return ids.filter { it != selfId }
        val blocked = blocks.currentBlockedIds
        return ids.filter { it != selfId && it !in blocked }
    }

    private fun StoryComposerUiState.withAudiencePurged(): StoryComposerUiState {
        val blocked = blocks.currentBlockedIds
        val purged = draft.copy(
            visibilityUserIds = reachable(draft.visibilityUserIds, draft.visibility),
            mentions = draft.mentions.filterNot { mention -> mention.userId?.let { it in blocked } == true },
        )
        return if (purged == draft) this else copy(draft = purged)
    }

    /** One publishable slide's wire request paired with the offline uploads it must wait on. */
    private data class PublishPlan(val request: CreateStoryRequest, val dependsOn: List<String>)

    /**
     * Maps the deck to one wire request **per publishable slide** (non-blank text or
     * attached media), in deck order. Each story carries **its own** slide's media —
     * media now belongs to the slide it was added to, not the whole story — and
     * `dependsOn` only the offline uploads staged on that same slide, so the drainer
     * gates each story on exactly its own prerequisites and grafts the real ids in.
     */
    private fun publishPlans(current: StoryComposerUiState, language: String): List<PublishPlan> {
        val pendingCmids = current.pendingUploads.mapTo(mutableSetOf(), PendingMediaUpload::cmid)
        return current.deck.publishableSlides.map { slide ->
            val draft = StoryComposerDraft(
                text = slide.text,
                visibility = current.draft.visibility,
                mediaIds = slide.mediaIds,
                textElements = slide.elements,
                stickers = slide.stickers,
                strokes = slide.strokes,
                filter = slide.filter,
                filterIntensity = slide.filterIntensity,
                durationSecondsPin = slide.durationSecondsPin,
                background = slide.background,
                backgroundMedia = resolveBackgroundMedia(slide, current),
                repostOfId = current.draft.repostOfId,
                visibilityUserIds = current.draft.visibilityUserIds,
                mentions = current.draft.mentions,
                mediaAlt = current.draft.mediaAlt,
                mediaCaption = current.draft.mediaCaption,
                allowSoundExtraction = current.draft.allowSoundExtraction,
                audio = slide.audio,
                frame = slide.frame,
            )
            PublishPlan(
                request = draft.toCreateStoryRequest(language),
                dependsOn = slide.mediaIds.filter { it in pendingCmids },
            )
        }
    }

    /**
     * Resolves a [slide]'s designated background media to the [StoryBackgroundMedia] the
     * wire mapping needs, from the already-uploaded [attachments]. Returns `null` when
     * nothing is designated or the id has no uploaded media yet (a still-pending offline
     * upload has no server URL to point the reader's background layer at, so it publishes
     * as a plain flat-media slide until the upload lands) — never a broken object. Carries
     * the slide's author-chosen [StorySlide.backgroundLoop] (honoured only for a video) and
     * the [resolveBackgroundFraming] pan/zoom (honoured for a framed image or video alike).
     */
    private fun resolveBackgroundMedia(slide: StorySlide, state: StoryComposerUiState): StoryBackgroundMedia? {
        val attachments = state.attachments
        val media = slide.backgroundMediaId?.let { bgId -> attachments.firstOrNull { it.id == bgId } } ?: return null
        return StoryBackgroundMedia(
            mediaId = media.id,
            url = media.url,
            mimeType = media.mimeType,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            loop = slide.backgroundLoop,
            framing = resolveBackgroundFraming(slide, media, state),
        )
    }

    /**
     * Projects the slide's canvas pan/zoom onto the wire's normalised framing — but only when
     * the designated background is the media the canvas actually frames. The composer canvas
     * renders (and the pan/zoom gesture reframes) the slide's **first** resolved attachment;
     * if the author designated a *different* attachment as the background, that gesture never
     * framed it, so its framing stays [StoryBackgroundFraming.IDENTITY] rather than borrowing a
     * pan the author applied to another attachment. Applies to an image or a video background
     * identically — each client's reader honours the framing on both.
     */
    private fun resolveBackgroundFraming(
        slide: StorySlide,
        media: UploadedMedia,
        state: StoryComposerUiState,
    ): StoryBackgroundFraming {
        val framedMediaId = slide.mediaIds.firstOrNull { id -> state.attachments.any { it.id == id } }
        if (media.id != framedMediaId) return StoryBackgroundFraming.IDENTITY
        return slide.transform.toBackgroundFraming(state.canvasWidthPx, state.canvasHeightPx)
    }

    private fun resolvePublishLanguage(): String =
        sessionRepository.currentUser.value
            ?.let { LanguageResolver.resolveUserLanguage(it) }
            ?: LanguageResolver.FALLBACK_LANGUAGE

    internal companion object {
        const val MENTION_DISPLAY = "NOTE"
        /** Plafond de la passerelle (`mentions.max(50)`) : au-delà, toute la story serait refusée. */
        const val MAX_MENTIONS = 50
        const val MEDIA_FAILED = "Couldn't attach that media"
        const val MEDIA_UNUSABLE = "That media couldn't be attached"
        const val MEDIA_LIMIT = "You can attach up to ${StoryComposerDraft.MAX_MEDIA} items"
        const val TEXT_ELEMENT_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE} text elements per slide"
        const val STICKER_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_STICKERS_PER_SLIDE} stickers per slide"
        const val MEDIA_RESTORE_LOST = "Some media couldn't be restored"
    }
}
