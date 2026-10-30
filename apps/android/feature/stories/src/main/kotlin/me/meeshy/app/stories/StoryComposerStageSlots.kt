package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.togetherWith
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.sdk.model.composer.scene.ComposerBackgroundMenuAction
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import androidx.compose.foundation.layout.ColumnScope
import me.meeshy.ui.component.composer.LocalOnComposerPlateau
import me.meeshy.ui.component.composer.rememberHostedTextField

/** The scene of the story composer: the canvas and the long-press menu of its background media. */
@Composable
internal fun StoryComposerScene(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    comparison: LookComparison,
    modifier: Modifier = Modifier,
) {
    var backgroundMenuOpen by remember { mutableStateOf(false) }
    Box(modifier) {
            StoryCanvasSurface(
                transform = state.selectedSlideTransform,
                backgroundModel = state.selectedSlideBackdropModel(viewModel.mediaBaseUrl),
                sceneBrush = remember(state.selectedSlideBackground, viewModel.authorAccentHex) {
                    StorySceneFill.resolve(state.selectedSlideBackground, viewModel.authorAccentHex).brush()
                },
                look = state.selectedSlideLook(comparison.mediaId),
                textElements = state.selectedSlideTextElements,
                selectedElement = state.selectedTextElement,
                sceneMenu = state.sceneContextMenu,
                inlineEditEnabled = !state.isTimelineOpen,
                stickers = state.selectedSlideStickers,
                selectedStickerId = state.selectedStickerId,
                strokes = state.selectedSlideStrokes,
                isDrawingActive = state.isDrawingActive,
                drawColorHex = state.drawColorHex,
                drawWidthDesign = state.drawWidthDesign,
                onStrokeCaptured = viewModel::onStrokeCaptured,
                onTransform = viewModel::onCanvasTransform,
                onElementTap = viewModel::onSelectTextElement,
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
                placedMedia = remember(state.deck, state.attachments, state.pendingUploads, comparison.mediaId) { state.placedMediaFrames(viewModel.mediaBaseUrl, comparison.mediaId) },
                placedMediaGestures = remember(viewModel) {
                    PlacedMediaGestures(viewModel::onMediaPlacementMoved, viewModel::onMediaPlacementDragEnd, viewModel::onMediaPlacementTransformed)
                },
                onBackgroundTap = {
                    viewModel.onDeselectTextElement()
                    viewModel.onDeselectSticker()
                },
                snapFeedback = state.snapFeedback,
                modifier = Modifier.fillMaxSize(),
                fitMode = ComposerBackdropFraming.fitMode(state.deck.selectedSlide.frame.backgroundTransform()),
                backdrop = ComposerBackdropFraming.backdrop(state.deck.selectedSlide.frame.backgroundTransform()),
                capture = sceneExport.capture,
                onBackgroundLongPress = state.deck.selectedSlideBackgroundMediaId
                    ?.let { { backgroundMenuOpen = true } },
            )
            ComposerBackgroundMenu(
                expanded = backgroundMenuOpen,
                onDismiss = { backgroundMenuOpen = false },
                onAction = { action ->
                    backgroundMenuOpen = false
                    val mediaId = state.deck.selectedSlideBackgroundMediaId ?: return@ComposerBackgroundMenu
                    when (action) {
                        ComposerBackgroundMenuAction.BRING_FORWARD -> viewModel.onToggleSlideBackgroundMedia(mediaId)
                        ComposerBackgroundMenuAction.DELETE -> viewModel.onRemoveMedia(mediaId)
                        ComposerBackgroundMenuAction.EDIT, ComposerBackgroundMenuAction.RETAKE_PHOTO -> Unit
                    }
                },
            )
    }
}

/** What the stage leaves under the scene: caption, drawing or text settings, the media row. Never over the scene. */
@Composable
internal fun ColumnScope.StoryComposerFooter(state: StoryComposerUiState, viewModel: StoryComposerViewModel, comparison: LookComparison) {
        val editedText = state.selectedTextElement.takeIf { state.isEditingTextElement }
        val editedSticker = state.selectedSticker.takeIf { editedText == null && !state.isTimelineOpen }
        val onPlateau = LocalOnComposerPlateau.current
        state.sceneInspector?.let { inspector ->
            if (!state.isDrawingActive) {
                SceneInspectorRow(
                    inspector = inspector,
                    onOpenTiming = { viewModel.onBandToolSwipeUp(StoryToolMode.TIMELINE) },
                )
            }
        }
        if (state.isDrawingActive) {
            StoryDrawingToolbar(
                activeColorHex = state.drawColorHex,
                activeWidthDesign = state.drawWidthDesign,
                canUndo = state.drawingBoard.canUndo,
                onColorSelected = viewModel::onDrawColorSelected,
                onWidthSelected = viewModel::onDrawWidthSelected,
                onUndo = viewModel::onDrawUndo,
                onDone = viewModel::onExitDrawingMode,
                control = state.openDrawingControl.takeIf { onPlateau },
            )
        } else if (editedText != null && onPlateau) {
            // Une section chasse l'autre en fondu (iOS : le contenu change sous la colonne, sans saut de hauteur).
            AnimatedContent(
                targetState = state.openTextSection,
                transitionSpec = { fadeIn() togetherWith fadeOut() using SizeTransform(clip = false) },
                label = "text-section",
            ) { open ->
                if (open == ComposerObjectEditorSection.Plan) {
                    Column(Modifier.heightIn(max = PLAN_MAX_HEIGHT).verticalScroll(rememberScrollState())) {
                        StoryPlanFrise(state, viewModel)
                    }
                } else {
                    TextSectionToolbar(editedText, open, viewModel, onPlateau)
                }
            }
        } else if (editedSticker != null && onPlateau) {
            StickerSectionContent(state, editedSticker, viewModel)
        } else if (editedText != null) {
            TextSectionToolbar(editedText, null, viewModel, onPlateau)
        } else {
            // La trace du son de FOND, lue dans le couloir — jamais sur la scène (un son ne produit aucun
            // pixel au rendu final) — et seulement quand aucun outil n'occupe la zone basse.
            val trace = ComposerSoundPlacement.traceServed(
                background = state.selectedSlideBackgroundSound,
                toolIsOpen = state.band.activeTool != null,
            )
            AnimatedVisibility(visible = trace != null, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                trace?.let {
                    SoundTraceRow(
                        sound = it,
                        onToggleMute = { viewModel.onToggleSoundMute(it.id) },
                        onRemove = { viewModel.onRemoveSound(it.id) },
                        selected = state.selectedSoundId == it.id,
                        onSelect = { viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.soundSelected(s, it.id) } },
                    )
                }
            }
            val selectedMedia = state.selectedMedia
            val selectedSound = state.selectedSound
            if (onPlateau && selectedMedia != null) {
                MediaSectionContent(state, selectedMedia, viewModel, comparison)
            } else if (onPlateau && selectedSound != null) {
                SoundSectionContent(state, selectedSound, viewModel)
            } else {
                SceneEffectsDock(state, viewModel)
                // The slide CAPTION only: a text object is written on the scene itself
                // (ComposerInlineTextField), so this field never silently changes role.
                val caption = rememberHostedTextField(state.editorText, viewModel::onTextChange)
                OutlinedTextField(
                    value = caption.value,
                    onValueChange = caption.onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.stories_composer_text_caption)) },
                    placeholder = { Text(stringResource(R.string.stories_composer_placeholder)) },
                    isError = !state.draft.isWithinLimit,
                    supportingText = {
                        Text(
                            text = when (val error = state.errorMessage) {
                                null -> stringResource(R.string.stories_composer_remaining, state.draft.charactersRemaining)
                                StoryComposerUploadReducer.LOCATION_REFUSED -> stringResource(R.string.stories_composer_media_location_refused)
                                StoryEditErrors.FAILED -> stringResource(R.string.story_edit_error)
                                StoryEditErrors.OFFLINE -> stringResource(R.string.story_edit_offline)
                                StoryEditErrors.ONE_SLIDE -> stringResource(R.string.story_edit_one_slide)
                                StoryEditErrors.UNAVAILABLE -> stringResource(R.string.story_edit_unavailable)
                                else -> error
                            },
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.End,
                        )
                    },
                )
            }
        }

        if (!state.isDrawingActive && (state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty())) {
            MediaPreviewRow(
                attachments = state.selectedSlideAttachments,
                pending = state.selectedSlidePending,
                mediaBaseUrl = viewModel.mediaBaseUrl,
                backgroundMediaId = state.deck.selectedSlideBackgroundMediaId,
                backgroundIsVideo = state.selectedSlideBackgroundIsVideo,
                backgroundLoop = state.selectedSlideBackgroundLoop,
                onRemove = viewModel::onRemoveMedia,
                selectedMediaId = state.selectedMedia,
                onSelect = { id -> viewModel.onSceneReduce { s -> StoryComposerSelectionReducer.mediaSelected(s, id) } },
                onToggleBackground = viewModel::onToggleSlideBackgroundMedia,
                placedMediaIds = remember(state.deck.selectedSlide.placedMedia) { state.deck.selectedSlide.placedMedia.mapTo(mutableSetOf()) { it.mediaId } },
                onTogglePlaced = viewModel::onTogglePlacedMedia,
                onToggleBackgroundLoop = { viewModel.onSetSlideBackgroundLoop(!state.selectedSlideBackgroundLoop) },
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
}

/** The open tool's panel, slid over the bottom of the stage. */
@Composable
internal fun StoryComposerPanel(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    onAddSticker: () -> Unit,
    onPickMedia: () -> Unit,
    onOpenSoundShelf: () -> Unit,
) {
        if (ComposerBandTools.showsPanel(state.isDrawingActive, state.isEditingTextElement)) {
            ComposerToolPanel(
                band = state.band,
                selectedFilter = state.selectedSlideFilter,
                filterIntensity = state.selectedSlideFilterIntensity,
                slideDurationSeconds = state.selectedSlideDurationSeconds,
                selectedBackground = state.selectedSlideBackground,
                canAddText = state.deck.selectedCanAddTextElement,
                canAddSticker = state.deck.selectedCanAddSticker,
                isUploadingMedia = state.isUploadingMedia,
                uploadingMedia = state.uploadingMedia,
                isMediaFull = !state.deck.selectedCanAddMedia,
                mediaCount = state.draft.mediaIds.size + state.selectedSlideAudio.size,
                hasMedia = state.draft.hasMedia,
                onDismiss = viewModel::onBandDismiss,
                onAddText = viewModel::onAddTextElement,
                onAddSticker = onAddSticker,
                onPickMedia = onPickMedia,
                onEnterDrawing = viewModel::onEnterDrawingMode,
                onSelectFilter = viewModel::onSelectFilter,
                onFilterIntensityChange = viewModel::onFilterIntensityChange,
                onSlideDurationChange = viewModel::onSlideDurationChange,
                onSelectBackground = viewModel::onSlideBackgroundChange,
                audio = state.selectedSlideAudio,
                canAddSound = state.canBorrowSound,
                soundCapRefusal = state.soundCapRefusal,
                onOpenSoundShelf = onOpenSoundShelf,
                onToggleSoundMute = viewModel::onToggleSoundMute,
                onRemoveSound = viewModel::onRemoveSound,
                timeline = { StoryPlanFrise(state, viewModel) },
            )
        }
}

private val PLAN_MAX_HEIGHT = 220.dp

/**
 * Le plan 2D de la scène (iOS `ComposerObjectPlanControls` → `Plan2DView`) : UN montage, deux portes — l'outil « temps »
 * de la bande et la section « plan » de la colonne droite d'un texte. Le même plan, les mêmes gestes ; l'empilement,
 * lui, reste aux actions de l'objet.
 */
@Composable
internal fun StoryPlanFrise(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    SceneFrise(
        tracks = state.sceneTracks,
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
    )
}
