package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
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
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerPublishChannel
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.ComposerHashtags
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.media.UnclaimedMediaSweep
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.commitOrWrite
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
    private val accountFence: AccountFence? = null,
    private val lookOven: StoryLookOven? = null,
    private val publications: PublicationOutbox? = null,
    private val postDrafts: PostComposerDraftStore? = null,
) : ViewModel() {

    /** Le compte sous lequel ce composeur s'est ouvert (#13621) : toute écriture de brouillon se fait sous lui. */
    private val openedUnder: AccountTicket? = accountFence?.ticket()

    /** `null` : le compte du composeur s'est fermé avant que l'écriture n'atterrisse — rien n'a été écrit. */
    private suspend fun <T> underOpeningAccount(write: suspend () -> T): T? = accountFence.commitOrWrite(openedUnder, write)

    private val _state = MutableStateFlow(StoryComposerUiState())
    private var history = ComposerHistory(_state.value.snapshot())
    val state: StateFlow<StoryComposerUiState> = _state.asStateFlow()

    val mediaBaseUrl: String? get() = config.apiBaseUrl

    /** The author colour the reader paints a background-less slide with (#12314). */
    val lookPerson: ComposerLookPerson get() = sessionRepository.lookPerson()
    val authorAccentHex: String get() = StorySceneFill.authorAccentHex(sessionRepository.currentUser.value)

    /** One-shot signal that a story was queued — the screen dismisses on it. */
    private val _published = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val published: SharedFlow<Unit> = _published.asSharedFlow()

    /** A repost door brings its own matter: the stored draft is not this session's until it restored or wrote it. */
    private var seededByDoor = false
    private var ownsStoredDraft = false
    private var restoring: Job? = null
    private var autosave: Job? = null

    /** Une story PUBLIÉE rouverte (#13632) : son enregistrement la met à jour, il ne publie jamais une story neuve. */
    private var editMode: StoryEditMode? = null

    /** `false` : l'édition est déjà ouverte (l'écran se recompose ou tourne) — rien ne se rouvre par-dessus ce que l'auteur a changé. */
    fun onEditRequested(): Boolean = (editMode !is StoryEditMode.Active).also { if (it) { editMode = StoryEditMode.Loading; seededByDoor = true } }

    internal fun onEditing(opening: StoryEditOpening, editor: StoryEditor) {
        editMode = StoryEditMode.Active(opening, editor)
        _state.update(opening::applied)
        resetHistory()
    }

    /** « Composer » depuis une story vue (#13849) : la scène semée devient la composition, son historique repart d'elle. */
    internal fun onRecomposed(done: StoryRecomposed) { _state.update { StoryRecomposition.applied(it, done.plan, done.uploaded) }; resetHistory() }

    /** L'hôte pose le format et la disposition armée (#13863) : la scène reste la même, seule la table des variantes change. */
    fun onFormat(format: ComposerFormat, layout: MosaicLayoutMode?) = _state.update { StoryComposerFormatReducer.formatted(it, format, layout) }

    fun onPostTextChange(text: String) = _state.update { StoryComposerFormatReducer.postTyped(it, text) }

    fun onFormatRestoredApplied() = _state.update { it.copy(restoredFormat = null) }

    /**
     * Restores a persisted draft when the screen opens — iOS `onAppear` + `StoryDraftStore.load`.
     * Silent and pristine-only: it never clobbers work begun in the async gap, a corrupt blob is
     * inert, and audience, repost link and annotations are re-armed with the slides.
     */
    fun onEnterComposer(seededByDoor: Boolean = false, initialVisibility: StoryVisibility? = null) {
        this.seededByDoor = seededByDoor
        initialVisibility?.let { audience -> _state.update { it.copy(draft = it.draft.withVisibility(audience)) } }
        restoring = viewModelScope.launch {
            draftConfirmation.settle()
            val stored = draftStore.load().let { if (seededByDoor) it else StoryPostDraftAdoption.adopted(it, postDrafts) { s -> underOpeningAccount { draftStore.save(s) } } }
            val restored = StoryComposerAutosave.restore(
                stored = stored,
                deckIsPristine = StoryComposerAutosave.deckIsPristine(_state.value.deck),
                seededByDoor = seededByDoor,
            ) ?: return@launch
            ownsStoredDraft = true
            val swept = UnclaimedMediaSweep.hasSweptMediaUploadedBeforeIso(restored.updatedAt, Instant.now())
            val availableIds = restored.slides
                .flatMap { it.mediaIds }
                .toSet()
                .filter { id -> isRestoredMediaAvailable(id, swept) }
                .toSet()
            val reconciled = StoryDraftMediaReconciler.reconcile(restored) { id -> id in availableIds }
            // Media loss can empty the whole draft; a snapshot no longer worth
            // restoring must not seed a deck of blank slides — purge it instead so a
            // later cold start never rebuilds the dead draft.
            if (!reconciled.snapshot.isWorthRestoring) {
                underOpeningAccount { draftStore.clear() }
                if (reconciled.hasLoss) _state.update { it.copy(errorMessage = MEDIA_RESTORE_LOST) }
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
                ).audiencePurged().mirrorDraftToSelection().let { s -> StoryComposerFormatReducer.restored(s, reconciled.snapshot) }
            }
            resetHistory()
        }
        if (autosave?.isActive != true) autosave = StoryComposerAutosaveWatch.start(viewModelScope, restoring, _state, ::persistDraft)
    }

    /**
     * Whether a restored draft's media [id] can still be published: an offline placeholder
     * ([OutboxIds.isCmid]) needs its bytes in the blob store; a server id is gone once the gateway swept
     * it ([swept], #8012) — a draft picked up after 24 h must not publish a story missing its media unsaid.
     */
    private suspend fun isRestoredMediaAvailable(id: String, swept: Boolean): Boolean =
        if (OutboxIds.isCmid(id)) mediaBlobStore.has(id) else !swept

    /** « Abandonner » (#13838) : le composeur repart vierge — [persistDraft] purge alors son brouillon, jamais celui d'une porte — et ses envois en cours sont annulés. */
    fun onDiscardDraft() {
        if (editMode != null) return
        _state.value.also { _state.value = it.blankKeepingFormat() }.pendingUploads.forEach { MediaIntake.release(it.item); cancelDurableUpload(it.cmid) }
        resetHistory()
    }

    /** Persists or purges the draft on leave ([StoryComposerAutosave]); the write outlives the cleared ViewModel (#13838). */
    fun persistDraft() {
        if (editMode != null) return
        viewModelScope.launch(NonCancellable) {
            val orphans = underOpeningAccount {
                val current = _state.value
                val previous = draftStore.load()
                val action = StoryComposerAutosave.resolve(
                    deck = current.deck,
                    visibility = current.draft.visibility,
                    repostOfId = current.draft.repostOfId,
                    nowIso = Instant.now().toString(),
                    previous = previous,
                    visibilityUserIds = current.draft.visibilityUserIds,
                    annotations = current.draft.annotations(),
                    mayOverwriteStored = !seededByDoor || ownsStoredDraft,
                    format = current.formatDraft(),
                )
                when (action) {
                    is StoryDraftPersist.Save -> {
                        draftStore.save(action.snapshot)
                        ownsStoredDraft = true
                        DraftRelease(
                            StoryComposerAutosave.orphanedUploads(previous, action.snapshot),
                            StoryComposerAutosave.namedUploads(action.snapshot),
                        )
                    }
                    StoryDraftPersist.Clear -> {
                        draftStore.clear()
                        DraftRelease(StoryComposerAutosave.orphanedUploads(previous, null), emptySet())
                    }
                    StoryDraftPersist.None -> null
                }
            } ?: return@launch
            val (reachable, lost) = orphans.released.partition(history::reaches)
            releasedByDraft = (releasedByDraft - orphans.named) + reachable
            lost.forEach { cancelDurableUpload(it) }
        }
    }

    private var releasedByDraft: Set<String> = emptySet()

    /** Routes the text field to the selected element, else the slide caption. */
    fun onTextChange(text: String) = reduce("type") { StoryComposerTextReducer.typed(it, text) }

    /** Adds an empty on-canvas text element and selects it (warns at the ≤5-element cap). */
    fun onAddTextElement() = newTextElementId().let { id ->
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
                SceneObjectMenu.Action.TRIM,
                SceneObjectMenu.Action.LEAVE_SCENE,
                SceneObjectMenu.Action.SET_AS_BACKGROUND,
                SceneObjectMenu.Action.REPLACE_BACKGROUND,
                -> Unit
            }
        }
        onDismissElementMenu()
    }

    fun onDuplicateSticker(id: String) {
        val newId = newStickerId()
        reduce { StoryComposerSceneReducer.stickerDuplicated(it, id, newId) }
    }

    /** Pose la fenêtre d'un objet (0 = permanent), depuis la frise ou l'inspecteur. */
    fun onSceneObjectWindow(id: String, startSeconds: Float, durationSeconds: Float) =
        reduce { StoryComposerSceneReducer.windowed(it, id, startSeconds, durationSeconds) }

    fun onSceneReduce(next: (StoryComposerUiState) -> StoryComposerUiState) = reduce(next = next)

    fun onSceneGesture(gesture: String, next: (StoryComposerUiState) -> StoryComposerUiState) = reduce(gesture, next)

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

    fun onDuplicateTextElement(id: String) {
        val newId = newTextElementId()
        reduce { StoryComposerTextReducer.duplicated(it, id, newId) }
    }

    /** Adds an emoji sticker to the selected slide and selects it (blank ignored, warns at the cap). */
    fun onAddSticker(emoji: String) = newStickerId().let { id ->
        reduce { StoryComposerSceneReducer.placedAtPlayhead(it) { s -> StoryComposerStickerReducer.added(s, emoji, id) } }
    }

    /** Un sticker à GABARIT (#13847) : son repli et son mouvement viennent du catalogue ; un gabarit inconnu ne pose rien. */
    fun onAddTemplateSticker(templateId: String, slots: Map<String, String>) {
        val sticker = StickerTemplatePose.element(templateId, slots, newStickerId()) ?: return
        reduce { StoryComposerStickerReducer.posed(it, sticker) }
    }

    /** Un sticker IMAGE (Mee, pack, Mes stickers) : vu tout de suite, publiable à l'arrivée de ses octets — UN pas d'annulation ; un échec le retire et le dit. */
    fun onAddImageSticker(pose: StickerImagePose) = newStickerId().let { id ->
        reduce { StoryComposerStickerReducer.posed(it, pose.awaiting(id)) }
        if (_state.value.deck.selectedSlide.stickers.none { it.id == id }) return@let
        stickerImages.started(id)
        viewModelScope.launch {
            val uploaded = mediaUploader.uploadSticker(pose)?.let { it.copy(url = ComposerMediaAddress.of(it.url, mediaBaseUrl)) }
            stickerImages.settled(id, uploaded)
            _state.update { stickerImages.reconciled(if (uploaded == null) StoryComposerStickerReducer.imageFailed(it, id) else it) }
        }
    }

    fun onSelectSticker(id: String) = reduce { StoryComposerStickerReducer.selected(it, id) }

    fun onDeselectSticker() = reduce { StoryComposerStickerReducer.deselected(it) }

    fun onRemoveSticker(id: String) = reduce { StoryComposerStickerReducer.removed(it, id) }

    fun onStickerMoved(id: String, dx: Float, dy: Float) = reduce(transformGesture(id)) { StoryComposerStickerReducer.moved(it, id, dx, dy) }

    fun onStickerTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce(transformGesture(id)) { StoryComposerStickerReducer.transformed(it, id, scaleBy, rotateByDeg) }

    fun onTogglePlacedMedia(mediaId: String) = reduce { StoryComposerPlacedMediaReducer.toggled(it, mediaId) }

    fun onMediaPlacementMoved(id: String, dx: Float, dy: Float) = reduce(transformGesture(id)) { StoryComposerPlacedMediaReducer.moved(it, id, dx, dy) }

    fun onMediaPlacementTransformed(id: String, scaleBy: Float, rotateByDeg: Float) =
        reduce(transformGesture(id)) { StoryComposerPlacedMediaReducer.transformed(it, id, scaleBy, rotateByDeg) }

    fun onSelectPlacedMediaFilter(mediaId: String, filter: StoryFilter?) = reduce { StoryComposerPlacedMediaReducer.filtered(it, mediaId, filter) }

    fun onMediaPlacementDragEnd() = reduce { it }

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

    fun onVisibilityChange(visibility: StoryVisibility) = _state.update { it.copy(draft = it.draft.withVisibility(visibility)) }

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

    fun onAllowSoundExtractionChange(allowed: Boolean) = _state.update { it.copy(draft = it.draft.copy(allowSoundExtraction = allowed)) }

    /** Retire [tag] du texte de TOUTES les slides (du post, en post) : la balise EST dans la phrase, il n'y a pas de liste à côté. */
    fun onRemoveHashtag(tag: String) = reduce { current ->
        if (current.variant.writesPostText) return@reduce current.copy(postText = ComposerHashtags.removing(tag, current.postText))
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
    fun onBandToolTap(tool: StoryToolMode) = _state.update { it.copy(band = it.band.tapTool(tool)) }

    /** Swipe up on a tool: forces its panel open. */
    fun onBandToolSwipeUp(tool: StoryToolMode) = _state.update { it.copy(band = it.band.swipeUpOnTool(tool)) }

    /** Swipe down on the row: closes an open panel, otherwise hides the chrome (bare canvas). */
    fun onBandSwipeDown() = _state.update { it.copy(band = if (it.band.isPanelOpen) it.band.closeAnyPanel() else it.band.hideChrome()) }

    /** Gives the chrome back after a voluntary hiding (ghost handle tap). */
    fun onBandShowChrome() = _state.update { it.copy(band = it.band.showChrome()) }

    /** Closes the open panel (handle pulled under its minimum) and gives the row back. */
    fun onBandDismiss() = _state.update { it.copy(band = it.band.closeAnyPanel()) }

    /** Appends a fresh empty slide and selects it (inert at the ≤10-slide cap). */
    fun onAddSlide() = applyDeck { if (_state.value.editing) it else it.addSlide(newSlideId()) }

    /** Inserts a clone of the selected slide right after it and selects the clone. */
    fun onDuplicateSelectedSlide() = applyDeck { if (_state.value.editing) it else it.duplicate(it.selectedId, newSlideId()) }

    /** Removes the slide [id] (inert on the last one); its media leave the pools, its pending uploads wait in [buried] (a duplicate's shared media stay). */
    fun onRemoveSlide(id: String) = reduceBurying { StoryComposerEraseReducer.slideRemoved(it, id) }

    /** « ⋯ › Tout effacer » (#13845), confirmé par l'écran : une diapo vierge sur le fond neutre, un cran que ↶ défait. */
    fun onClearAll() = reduceBurying(StoryComposerEraseReducer::cleared)

    /** « ⋯ › Retirer le fond de la scène » (#13845) : la couleur et le média de fond partent, en un seul cran. */
    fun onRemoveSceneBackground() {
        val media = _state.value.selectedSlideBackdropMediaId
        _state.update { StoryComposerBackgroundReducer.backgroundChanged(it, null) }
        media?.let(::onRemoveMedia) ?: record()
    }

    /** Les envois hors ligne que [next] retire attendent dans [buried] tant qu'une étape de l'historique les montre. */
    private fun reduceBurying(next: (StoryComposerUiState) -> StoryComposerUiState) {
        val before = _state.value.pendingUploads
        _state.update(next)
        buried.bury(before.filterNot { it in _state.value.pendingUploads })
        record()
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
        restore(snapshot)
    }

    fun onRedo() {
        val (next, snapshot) = history.redone() ?: return
        history = next
        restore(snapshot)
    }

    private val buried = BuriedUploads()
    private val stickerImages = StickerImageUploads()
    private val mediaPick = StoryComposerMediaPick(viewModelScope, _state, mediaUploader, mediaUploadQueue) { record() }

    private fun restore(snapshot: ComposerSnapshot) {
        val before = _state.value.pendingUploads
        _state.update { stickerImages.reconciled(it.restoredTo(snapshot, buried.held)).withHistoryFlags() }
        buried.settled(before, _state.value.pendingUploads)
    }

    private fun abandonUnreachableBuried() {
        buried.abandoned(history::reaches).forEach { MediaIntake.release(it.item); cancelDurableUpload(it.cmid) }
        val (kept, lost) = releasedByDraft.partition(history::reaches)
        releasedByDraft = kept.toSet()
        lost.forEach(::cancelDurableUpload)
    }

    private fun StoryComposerUiState.withHistoryFlags(): StoryComposerUiState =
        copy(canUndo = history.canUndo, canRedo = history.canRedo)

    /** Empile le deck courant dans l'historique ; [gesture] = changement continu (un seul cran). */
    private fun record(gesture: String? = null) {
        history = history.recorded(_state.value.snapshot(), gesture)
        abandonUnreachableBuried()
        if (_state.value.canUndo != history.canUndo || _state.value.canRedo != history.canRedo) {
            _state.update { it.withHistoryFlags() }
        }
    }

    /** Repart d'un historique vierge sur l'état courant (brouillon restauré, publication). */
    private fun resetHistory() {
        history = ComposerHistory(_state.value.snapshot())
        abandonUnreachableBuried()
        _state.update { it.withHistoryFlags() }
    }

    private fun reduce(gesture: String? = null, next: (StoryComposerUiState) -> StoryComposerUiState) {
        _state.update { StoryComposerTextReducer.blankLeftBehind(it, next(it)) }
        record(gesture)
    }

    /** Applies a structural deck transform, re-syncing the editor buffer to the selected slide. */
    private fun applyDeck(transform: (StorySlideDeck) -> StorySlideDeck) {
        reduce { it.withDeckTransform(transform) }
    }

    /**
     * Uploads freshly-picked media onto the selected slide (appended; [asBackground]: the first becomes its background, #13845).
     * A failed or refused upload is queued **durably** ([StoryComposerMediaPick]) behind a [PendingMediaUpload] placeholder the outbox
     * grafts once online; a second pick while an upload is in flight is ignored, and nothing usable comes back as a said error.
     */
    fun onMediaPicked(items: List<MediaUploadItem>, asBackground: Boolean = false) = mediaPick.pick(items, asBackground)

    /** ✕ sur l'espace réservé (R5 de #13863) : l'ajout s'annule, et l'écran se libère dans la même image. */
    fun onCancelMediaPick() = mediaPick.cancel()

    /** « Réessayer » après un échec : les mêmes octets repartent, vers la place que la scène leur donne maintenant. */
    fun onRetryMediaPick() = mediaPick.retry()

    /**
     * Removes an attached or pending media before publishing; the UI clears at once. An offline placeholder's durable
     * upload is not cancelled yet: like a removed slide's (#13541) it waits in [buried], bytes kept, while undo can bring the
     * media back (#13602), and is cancelled only once no history step shows it any more or the composer is left.
     */
    fun onRemoveMedia(id: String) {
        val pending = _state.value.pendingUploads.firstOrNull { it.cmid == id }
        if (pending != null) buried.bury(listOf(pending))
        _state.update {
            val deck = it.deck.removeMedia(id)
            val next = if (pending != null) {
                it.copy(deck = deck, pendingUploads = it.pendingUploads.filterNot { pending -> pending.cmid == id })
            } else {
                it.copy(deck = deck, attachments = it.attachments.filterNot { media -> media.id == id })
            }
            next.withDescriptionsPruned().mirrorDraftToSelection()
        }
        record()
    }

    private fun cancelDurableUpload(cmid: String) {
        viewModelScope.launch { runCatching { mediaUploadQueue.cancel(cmid) }.exceptionOrNull()?.let { if (it is CancellationException) throw it } }
    }

    fun publish() {
        (editMode as? StoryEditMode.Active)?.let { return it.save(viewModelScope, _state, _published, resolvePublishLanguage()) }
        if (editMode != null) return
        val current = _state.updateAndGet { it.audiencePurged() }
        if (!current.canPublish) return
        _state.update { it.copy(isPublishing = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val baked = lookOven?.queued(current) ?: current
                val document = current.variant.channel == ComposerPublishChannel.DOCUMENT
                val plans = if (document) publishPlans(baked, resolvePublishLanguage(), baked.postSceneSlides) else publishPlans(baked, resolvePublishLanguage())
                val queued = if (document) {
                    checkNotNull(publications).enqueueScene(baked, plans, resolvePublishLanguage()).let { emptyList<String>() }
                } else plans.mapNotNull { plan -> storyRepository.enqueuePublish(plan.request, dependsOn = plan.dependsOn) }
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                releasedByDraft = releasedByDraft - current.deck.slides.flatMap { it.mediaIds + listOfNotNull(it.backgroundMediaId) }.toSet()
                keepDraftUntilConfirmed(current, queued)
                _state.update { it.blankKeepingFormat() }
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
            underOpeningAccount { draftStore.clear() }
            return
        }
        val snapshot = published.deck.toDraftSnapshot(
            visibility = published.draft.visibility,
            repostOfId = published.draft.repostOfId,
            nowIso = Instant.now().toString(),
            visibilityUserIds = published.draft.visibilityUserIds,
            annotations = published.draft.annotations(),
            format = published.formatDraft(),
        )
        underOpeningAccount { draftStore.save(snapshot.copy(awaitingPublication = queued)) }
    }

    private fun reachable(ids: List<String>, visibility: StoryVisibility) =
        reachableAudience(ids, visibility, sessionRepository.currentUser.value?.id, blocks.currentBlockedIds)
    private fun StoryComposerUiState.audiencePurged() = withAudiencePurged(sessionRepository.currentUser.value?.id, blocks.currentBlockedIds)

    internal fun resolvePublishLanguage(): String = sessionRepository.currentUser.value?.let { LanguageResolver.resolveUserLanguage(it) } ?: LanguageResolver.FALLBACK_LANGUAGE

    /**
     * Les copies EN CLAIR des médias en attente (#13553) ne survivent pas au composeur : la file d'envoi garde les siennes, scellées.
     * Les envois d'une slide supprimée (#13541) n'ont plus d'historique pour la rétablir ni de brouillon qui les montre : leur
     * envoi durable est annulé, hors de [viewModelScope] déjà fermé, pour ne pas téléverser un média qu'aucune story n'utilisera.
     */
    override fun onCleared() {
        mediaPick.cleared()
        val held = buried.held
        (_state.value.pendingUploads + held).forEach { MediaIntake.release(it.item) }
        val doomed = held.map(PendingMediaUpload::cmid) + releasedByDraft
        if (doomed.isEmpty()) return
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            doomed.forEach { cmid -> runCatching { mediaUploadQueue.cancel(cmid) } }
        }
    }

    internal companion object {
        const val MENTION_DISPLAY = "NOTE"
        /** Plafond de la passerelle (`mentions.max(50)`) : au-delà, toute la story serait refusée. */
        const val MAX_MENTIONS = 50
        const val MEDIA_FAILED = "Couldn't attach that media"
        const val MEDIA_UNUSABLE = "That media couldn't be attached"
        const val MEDIA_LIMIT = "You can attach up to ${StoryComposerDraft.MAX_MEDIA} items"
        const val TEXT_ELEMENT_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE} text elements per slide"
        const val STICKER_IMAGE_FAILED = "Couldn't add that sticker"
        const val STICKER_LIMIT =
            "You can add up to ${StorySlideDeck.MAX_STICKERS_PER_SLIDE} stickers per slide"
        const val TEXT_LENGTH_LIMIT =
            "A text holds ${me.meeshy.sdk.model.composer.StoryLimits.TEXT_LENGTH} characters at most"
        const val MEDIA_RESTORE_LOST = "Some media couldn't be restored"
    }
}
