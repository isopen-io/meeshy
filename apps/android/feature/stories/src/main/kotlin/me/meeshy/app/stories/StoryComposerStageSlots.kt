package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerLimitNotice
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.component.retouch.LocalComposerLookAuthor
import me.meeshy.ui.component.retouch.rememberComposerLookAuthor
import me.meeshy.ui.component.retouch.rememberStoryMediaLookModel
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The scene of the story composer: the canvas. Touched or held, a background media is selected and lays its « Fond » level
 * in the rail (#13973) — no menu floats over the scene. Blank and at rest
 * ([captureOffered]), the scene arms [capture]'s viewfinder on a touch, and films on a hold (#13849); armed, the viewfinder
 * covers the scene alone.
 */
@Composable
internal fun StoryComposerScene(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    comparison: LookComparison,
    modifier: Modifier = Modifier,
    capture: StorySceneCapture? = null,
    captureOffered: Boolean = false,
) {
    val armsCapture = capture?.takeIf { captureOffered }
    CompositionLocalProvider(LocalComposerLookAuthor provides rememberComposerLookAuthor(viewModel.lookPerson)) {
    Box(modifier.followsSceneHold(capture)) {
            StoryCanvasSurface(
                transform = state.selectedSlideTransform,
                backgroundModel = rememberStoryMediaLookModel(rememberComposerPicture(state.selectedSlideBackdropModel(viewModel.mediaBaseUrl)), state.backgroundMediaLook(comparison.mediaId)),
                sceneBrush = remember(state.selectedSlideBackground, viewModel.authorAccentHex) {
                    StorySceneFill.resolve(state.selectedSlideBackground, viewModel.authorAccentHex).brush()
                },
                look = state.selectedSlideLook(comparison.mediaId),
                textElements = state.selectedSlideTextElements,
                selectedElement = state.selectedTextElement,
                sceneMenu = state.sceneContextMenu,
                inlineEditEnabled = state.isEditingTextElement,
                stickers = state.selectedSlideStickers,
                selectedStickerId = state.selectedStickerId,
                strokes = state.selectedSlideStrokes,
                isDrawingActive = state.isDrawingActive,
                drawColorHex = state.drawColorHex,
                drawWidthDesign = state.drawWidthDesign,
                onStrokeCaptured = viewModel::onStrokeCaptured,
                onTransform = viewModel::onCanvasTransform,
                onElementTap = viewModel::onTapTextElement,
                onElementLongPress = viewModel::onOpenElementMenu,
                onSceneMenuAction = viewModel::onSceneMenuAction,
                onSceneMenuDismiss = viewModel::onDismissElementMenu,
                onElementDrag = viewModel::onTextElementMoved,
                onElementDragEnd = viewModel::onTextElementDragEnd,
                onElementTransform = viewModel::onTextElementTransform,
                onElementTextChange = viewModel::onTextChange,
                onStickerTap = viewModel::onSelectSticker,
                onStickerLongPress = viewModel::onOpenStickerMenu,
                onStickerDrag = viewModel::onStickerMoved,
                onStickerDragEnd = viewModel::onStickerDragEnd,
                onStickerTransform = viewModel::onStickerTransform,
                placedMedia = remember(state.deck, state.attachments, state.pendingUploads, state.isOffline, state.resendingUploads, state.failedUploads, comparison.mediaId) {
                    state.placedMediaFrames(viewModel.mediaBaseUrl, comparison.mediaId)
                },
                placedMediaGestures = remember(viewModel) {
                    PlacedMediaGestures(
                        viewModel::onMediaPlacementMoved,
                        viewModel::onMediaPlacementDragEnd,
                        viewModel::onMediaPlacementTransformed,
                        onTap = { id -> viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.mediaSelected(s, id) } },
                    )
                },
                onBackgroundTap = armsCapture?.let { scene -> { scene.arm() } } ?: { viewModel.onSceneTap() },
                selectedMediaId = state.selectedMedia,
                snapFeedback = state.snapFeedback,
                modifier = Modifier.fillMaxSize(),
                fitMode = ComposerBackdropFraming.fitMode(state.deck.selectedSlide.frame.backgroundTransform()),
                backdrop = ComposerBackdropFraming.backdrop(state.deck.selectedSlide.frame.backgroundTransform()),
                backgroundRotationDeg = state.paintedBackgroundSetting.rotationDeg,
                onBackgroundLongPress = state.selectedSlideBackdropMediaId
                    ?.let { { viewModel.onSelectBackground() } }
                    ?: armsCapture?.takeIf { scene -> scene.offer?.allowsVideo == true }?.let { scene -> { scene.arm(films = true) } },
                stack = remember(state.deck.selectedSlide) { StorySceneStack.order(state.deck.selectedSlide) },
                live = LocalComposerLive.current,
                pins = { ref, width, height -> ScenePin(state, viewModel, ref, width, height) },
            )
            state.selectedSlideBackdropPendingPhase?.let { phase ->
                IncomingWaitingBadge(phase, Modifier.align(Alignment.TopCenter).padding(top = WAITING_BADGE_TOP))
            }
            armsCapture?.offer?.let { offer -> StorySceneCaptureHint(offer) }
            capture?.takeIf { it.armed }?.let { scene -> scene.viewfinder(scene, Modifier.fillMaxSize()) }
    }
    }
}

/**
 * Le panneau du geste en cours, monté au bas de la scène (#13834) — un seul à la fois, résolu par [scenePanel] : les
 * réglages du pinceau, les sections de l'objet touché, l'outil ouvert, ce que le « ⋯ » a ouvert, ou le cadre et les effets
 * du fond. Au repos, rien : ni légende, ni compteur, ni trace du son, ni rangée des médias. Le texte qu'on écrit et la
 * légende ne passent pas par ici : c'est l'état de frappe, sa barre collée au clavier (#13835).
 */
@Composable
internal fun StoryComposerBottomPanel(
    panel: StoryScenePanel,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    comparison: LookComparison,
    toolPanel: @Composable () -> Unit,
    onCloseLocal: () -> Unit,
) {
    if (panel == StoryScenePanel.TOOL) {
        toolPanel()
        return
    }
    ScenePanelSurface {
        when (panel) {
            StoryScenePanel.DRAWING -> StoryDrawingToolbar(
                activeColorHex = state.drawColorHex,
                activeWidthDesign = state.drawWidthDesign,
                canUndo = state.drawingBoard.canUndo,
                onColorSelected = viewModel::onDrawColorSelected,
                onWidthSelected = viewModel::onDrawWidthSelected,
                onUndo = viewModel::onDrawUndo,
                onDone = viewModel::onExitDrawingMode,
            )
            StoryScenePanel.DURATION -> DurationPanel(state, viewModel, onCloseLocal)
            StoryScenePanel.SCENE_EFFECTS -> SceneEffectsDock(state, viewModel)
            StoryScenePanel.TOOL, StoryScenePanel.TEXT, StoryScenePanel.CAPTION -> Unit
        }
    }
}

/** Le fond lisible d'un panneau posé sur la scène, quelle que soit la couleur de la scène. */
@Composable
internal fun ScenePanelSurface(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        color = MeeshyTheme.tokens.backgroundPrimary,
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().heightIn(max = PANEL_MAX_HEIGHT).verticalScroll(rememberScrollState()).padding(MeeshySpacing.smPlus),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            content = content,
        )
    }
}

/** La durée de la diapo, ouverte depuis « ⋯ » : un réglage court, refermé par OK. */
@Composable
private fun DurationPanel(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    DurationRow(seconds = state.selectedSlideDurationSeconds, onSecondsChange = viewModel::onSlideDurationChange)
    PanelDone(onDone)
}

/** La vibration d'une limite : une seule, au geste qui l'atteint ([ComposerLimitNotice.crossed]), jamais en deçà ni au-delà. */
@Composable
internal fun LimitReachedHaptic(used: Int, cap: Int) {
    val haptics = rememberMeeshyHaptics()
    var previous by remember { mutableIntStateOf(used) }
    LaunchedEffect(used) {
        if (ComposerLimitNotice.crossed(previous, used, cap)) haptics.warning()
        previous = used
    }
}

@Composable
private fun PanelDone(onDone: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        TextButton(onClick = onDone, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(stringResource(R.string.composer_scene_done))
        }
    }
}

/** Les médias de la diapo — fond, posé, retrait — et leur description (la Boucle vit dans Fond › Modifier, #13973) : dans le panneau Média, jamais au repos. */
@Composable
internal fun SlideMediaRows(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    if (state.selectedSlideAttachments.isEmpty() && state.selectedSlidePending.isEmpty()) return
    MediaPreviewRow(
        attachments = state.selectedSlideAttachments,
        pending = state.selectedSlidePending,
        mediaBaseUrl = viewModel.mediaBaseUrl,
        backgroundMediaId = state.deck.selectedSlideBackgroundMediaId,
        onRemove = viewModel::onRemoveMedia,
        selectedMediaId = state.selectedMedia,
        onSelect = { id -> viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.mediaSelected(s, id) } },
        onToggleBackground = viewModel::onToggleSlideBackgroundMedia,
        placedMediaIds = remember(state.deck.selectedSlide.placedMedia) { state.deck.selectedSlide.placedMedia.mapTo(mutableSetOf()) { it.mediaId } },
        onTogglePlaced = viewModel::onTogglePlacedMedia,
        pendingPhase = state::pendingPhase,
        onRetryPending = viewModel::onRetryPendingUpload,
    )
    ComposerMediaDescription(
        mediaIds = state.deck.selectedSlide.mediaIds,
        alt = state.draft.mediaAlt,
        caption = state.draft.mediaCaption,
        undescribedCount = state.undescribedMediaIds.size,
        offersSoundExtraction = state.offersSoundExtraction,
        allowSoundExtraction = state.draft.allowSoundExtraction == true,
        onAltChange = viewModel::onMediaAltChange,
        onCaptionChange = viewModel::onMediaCaptionChange,
        onAllowSoundExtractionChange = viewModel::onAllowSoundExtractionChange,
    )
}

/** Ce que l'éditeur dit de lui-même, au bas de la scène et seulement quand il a quelque chose à dire. */
@Composable
internal fun sceneNotice(state: StoryComposerUiState): String? = when (val error = state.errorMessage) {
    null -> publishFailedNotice(state.publishFailedFormats)
    StoryComposerUploadReducer.LOCATION_REFUSED -> stringResource(R.string.stories_composer_media_location_refused)
    StoryComposerUploadReducer.SLIDES_FULL -> stringResource(R.string.composer_slide_rail_capReached)
    StoryComposerViewModel.MEDIA_FAILED -> stringResource(R.string.story_composer_incoming_failed)
    StoryComposerViewModel.STICKER_IMAGE_FAILED -> stringResource(R.string.story_sticker_image_failed)
    StoryEditErrors.FAILED -> stringResource(R.string.story_edit_error)
    StoryEditErrors.OFFLINE -> stringResource(R.string.story_edit_offline)
    StoryEditErrors.ONE_SLIDE -> stringResource(R.string.story_edit_one_slide)
    StoryEditErrors.UNAVAILABLE -> stringResource(R.string.story_edit_unavailable)
    else -> error
}

/** Les formats qu'un geste n'a pas fait partir (#13919), chacun nommé, dans l'ordre du menu. */
@Composable
private fun publishFailedNotice(failed: List<ComposerFormat>): String? = failed.map { format ->
    when (format) {
        ComposerFormat.POST -> stringResource(R.string.composer_publish_failed_post)
        ComposerFormat.REEL -> stringResource(R.string.composer_publish_failed_reel)
        else -> stringResource(R.string.composer_publish_failed_story)
    }
}.takeIf { it.isNotEmpty() }?.joinToString(" · ")

/** A place or a voice chip of the scene, at its rank in the stack: touched, it is selected; dragged, it moves. */
@Composable
private fun ScenePin(state: StoryComposerUiState, viewModel: StoryComposerViewModel, ref: SceneObjectRef, width: Float, height: Float) {
    val slide = state.deck.selectedSlide
    when (ref.kind) {
        ComposerObjectKind.PLACE -> slide.places.firstOrNull { it.id == ref.id }?.let { place ->
            ComposerPlaceLayer(
                place = place,
                selected = place.id == state.selectedPlaceId,
                canvasWidthPx = width,
                canvasHeightPx = height,
                onTap = { viewModel.onSelectPlace(place.id) },
                onDrag = { dx, dy -> viewModel.onPlaceMoved(place.id, dx, dy) },
                onDragEnd = viewModel::onStickerDragEnd,
            )
        }
        ComposerObjectKind.AUDIO -> slide.audio.firstOrNull { it.id == ref.id }?.let { track ->
            ComposerAudioChipLayer(
                track = track,
                selected = track.id == state.selectedSoundId,
                canvasWidthPx = width,
                canvasHeightPx = height,
                onTap = { viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.soundSelected(s, track.id) } },
                onDrag = { dx, dy -> viewModel.onSoundMoved(track.id, dx, dy) },
                onDragEnd = viewModel::onStickerDragEnd,
            )
        }
        else -> Unit
    }
}

/** The open tool's panel, raised over the bottom of the scene, which shrinks whole above it. */
@Composable
internal fun StoryComposerPanel(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    onPickMedia: () -> Unit,
    onOpenSoundShelf: () -> Unit,
) {
        if (ComposerBandTools.showsPanel(state.isDrawingActive, state.isEditingTextElement)) {
            ComposerToolPanel(
                band = state.band,
                selectedFilter = state.selectedSlideFilter,
                filterIntensity = state.selectedSlideFilterIntensity,
                selectedBackground = state.selectedSlideBackground,
                canAddText = state.deck.selectedCanAddTextElement,
                isUploadingMedia = state.isUploadingMedia,
                uploadingMedia = state.uploadingMedia,
                isMediaFull = !state.deck.selectedCanAddMedia,
                onDismiss = viewModel::onBandDismiss,
                onAddText = viewModel::onAddTextElement,
                onPickMedia = onPickMedia,
                onEnterDrawing = viewModel::onEnterDrawingMode,
                onSelectFilter = viewModel::onSelectFilter,
                onFilterIntensityChange = viewModel::onFilterIntensityChange,
                onSelectBackground = viewModel::onSlideBackgroundChange,
                audio = state.selectedSlideAudio,
                canAddSound = state.canBorrowSound,
                soundCapRefusal = state.soundCapRefusal,
                onOpenSoundShelf = onOpenSoundShelf,
                selectedSoundId = state.selectedSoundId,
                onSelectSound = { id -> viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.soundSelected(s, id) } },
                mediaExtras = { SlideMediaRows(state, viewModel) },
                onToggleSoundMute = viewModel::onToggleSoundMute,
                onRemoveSound = viewModel::onRemoveSound,
                timeline = { StoryPlanFrise(state, viewModel) },
            )
        }
}

private val PANEL_MAX_HEIGHT = 320.dp

/** Le badge « en attente » d'un fond hors ligne, sous la barre du haut et la rangée des diapos. */
private val WAITING_BADGE_TOP = 112.dp

/**
 * Le plan 2D de la scène (iOS `ComposerObjectPlanControls` → `Plan2DView`) : UN montage, deux portes — l'outil « temps »
 * de la bande et la section « plan » de la colonne droite d'un texte. Le même plan, les mêmes gestes ; l'empilement,
 * lui, reste aux actions de l'objet.
 */
@Composable
internal fun StoryPlanFrise(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val names = state.sceneTrackNames
    val words = SceneObjectFamily.entries.associateWith { familyWord(it) }
    SceneFrise(
        tracks = state.sceneTracks,
        labels = names.mapValues { (_, track) -> track.name ?: words.getValue(track.family) },
        editableIds = state.sceneEditableTrackIds,
        selectedId = state.selectedSceneObject?.id,
        slideDurationSeconds = state.selectedSlideDurationSeconds.toFloat(),
        playheadSeconds = state.playheadSeconds,
        onSelectTrack = { id, at ->
            viewModel.onFriseTrackSelected(id)
            viewModel.onPlayheadMoved(at)
        },
        onScrub = viewModel::onPlayheadMoved,
        onWindow = viewModel::onSceneObjectWindow,
        splittableIds = StoryComposerSplitReducer.splittableIds(state),
        // « Couper » à la tête (#14221, #14224) : une réduction, donc un seul pas d'annulation.
        onSplit = { id ->
            val newId = java.util.UUID.randomUUID().toString()
            viewModel.onSceneReduce { s -> StoryComposerSplitReducer.split(s, id, newId) }
        },
    )
}
