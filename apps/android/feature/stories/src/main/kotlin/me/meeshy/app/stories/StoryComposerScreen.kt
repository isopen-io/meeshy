package me.meeshy.app.stories

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.flowWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem

/**
 * Story composer screen — the publish surface reached from the tray's "add story"
 * affordance. Keeps to glue: it renders [StoryComposerUiState] and forwards
 * intents to [StoryComposerViewModel]. The system photo/video picker reads the
 * chosen files off the main thread, hands the bytes to the ViewModel for upload,
 * and the returned media ride into the publish through the existing durable-outbox
 * flow. [StoryMediaPicker] routes to the single- or multi-item contract by the
 * free slots left so a single remaining slot never trips the multi-picker's
 * `maxItems > 1` requirement. Publishing is
 * optimistic — the screen dismisses on the one-shot `published` signal while the
 * outbox delivers in the background.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryComposerScreen(
    onClose: () -> Unit,
    repostOfId: String? = null,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel, lifecycleOwner) {
        viewModel.published
            .flowWithLifecycle(lifecycleOwner.lifecycle)
            .collectLatest { onClose() }
    }

    // Entered as a repost: link this composition to its source story once. The ViewModel
    // ignores a blank id, and the reader half renders the attribution from the published
    // story — so all the author side carries is the source id.
    LaunchedEffect(repostOfId) {
        repostOfId?.let { viewModel.onRepostSource(it) }
    }

    // Restore a persisted draft on open (silent, pristine-only) and persist/purge it on
    // leave — the composer's save-on-dismiss / restore-on-appear seam.
    DisposableEffect(viewModel) {
        viewModel.onEnterComposer()
        onDispose { viewModel.persistDraft() }
    }

    fun dispatchPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        scope.launch {
            val items = withContext(Dispatchers.IO) {
                uris.mapNotNull { context.contentResolver.readMediaUploadItem(it) }
            }
            if (items.isNotEmpty()) viewModel.onMediaPicked(items)
        }
    }

    val pickSingle = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> dispatchPicked(listOfNotNull(uri)) }

    val pickMultiple = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(StoryComposerDraft.MAX_MEDIA),
    ) { uris: List<Uri> -> dispatchPicked(uris) }

    val imageAndVideo = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)

    var showStickerPicker by remember { mutableStateOf(false) }
    if (showStickerPicker) {
        StickerPickerDialog(
            onPick = { emoji ->
                viewModel.onAddSticker(emoji)
                showStickerPicker = false
            },
            onDismiss = { showStickerPicker = false },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.stories_composer_title)) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.stories_composer_cancel))
                    }
                },
                actions = {
                    TextButton(onClick = viewModel::publish, enabled = state.canPublish) {
                        Text(stringResource(R.string.stories_composer_publish))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (!state.band.isChromeHidden) SlideStrip(
                deck = state.deck,
                onSelect = viewModel::onSelectSlide,
                onAdd = viewModel::onAddSlide,
                onDuplicate = viewModel::onDuplicateSelectedSlide,
                onRemove = viewModel::onRemoveSlide,
                onMove = viewModel::onMoveSlide,
            )

            ComposerStage(
                scene = { sceneModifier ->
                    StoryCanvasSurface(
                        transform = state.selectedSlideTransform,
                        backgroundModel = state.selectedSlideAttachments.firstOrNull()?.let { it.thumbnailUrl ?: it.url }
                            ?: state.selectedSlidePending.firstOrNull()?.item?.bytes,
                        colorMatrix = state.selectedSlideFilterMatrix,
                        textElements = state.selectedSlideTextElements,
                        selectedElement = state.selectedTextElement,
                        elementMenu = state.elementContextMenu,
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
                        onElementMenuAction = viewModel::onElementMenuAction,
                        onElementMenuDismiss = viewModel::onDismissElementMenu,
                        onElementDrag = viewModel::onTextElementMoved,
                        onElementDragEnd = viewModel::onTextElementDragEnd,
                        onElementTransform = viewModel::onTextElementTransform,
                        onElementRemove = viewModel::onRemoveTextElement,
                        onElementTextChange = viewModel::onTextChange,
                        onStickerTap = viewModel::onSelectSticker,
                        onStickerDrag = viewModel::onStickerMoved,
                        onStickerTransform = viewModel::onStickerTransform,
                        onStickerRemove = viewModel::onRemoveSticker,
                        onBackgroundTap = {
                            viewModel.onDeselectTextElement()
                            viewModel.onDeselectSticker()
                        },
                        snapFeedback = state.snapFeedback,
                        modifier = sceneModifier,
                    )
                },
                footer = {
                    val editedText = state.selectedTextElement
                    if (state.isDrawingActive) {
                        StoryDrawingToolbar(
                            activeColorHex = state.drawColorHex,
                            activeWidthDesign = state.drawWidthDesign,
                            canUndo = state.drawingBoard.canUndo,
                            onColorSelected = viewModel::onDrawColorSelected,
                            onWidthSelected = viewModel::onDrawWidthSelected,
                            onUndo = viewModel::onDrawUndo,
                            onDone = viewModel::onExitDrawingMode,
                        )
                    } else if (editedText != null) {
                        TextStyleToolbar(
                            element = editedText,
                            onStyle = { style -> viewModel.onTextElementStyle(editedText.id, style) },
                            onColor = { color -> viewModel.onTextElementColor(editedText.id, color) },
                            onAlign = { align -> viewModel.onTextElementAlign(editedText.id, align) },
                            onBackground = { bg -> viewModel.onTextElementBackground(editedText.id, bg) },
                            onCycleSize = { viewModel.onTextElementCycleSize(editedText.id) },
                            onCycleOutline = { viewModel.onTextElementCycleOutline(editedText.id) },
                            onCycleFadeIn = { viewModel.onTextElementCycleFadeIn(editedText.id) },
                            onCycleFadeOut = { viewModel.onTextElementCycleFadeOut(editedText.id) },
                            onCycleStart = { viewModel.onTextElementCycleStart(editedText.id) },
                            onCycleDuration = { viewModel.onTextElementCycleDuration(editedText.id) },
                            onDuplicate = { viewModel.onDuplicateTextElement(editedText.id) },
                            onReorder = { op -> viewModel.onReorderTextElement(editedText.id, op) },
                            onDone = viewModel::onDeselectTextElement,
                        )
                    } else {
                        // The slide CAPTION only: a text object is written on the scene itself
                        // (ComposerInlineTextField), so this field never silently changes role.
                        OutlinedTextField(
                            value = state.editorText,
                            onValueChange = viewModel::onTextChange,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.stories_composer_text_caption)) },
                            placeholder = { Text(stringResource(R.string.stories_composer_placeholder)) },
                            isError = !state.draft.isWithinLimit,
                            supportingText = {
                                Text(
                                    text = state.errorMessage
                                        ?: stringResource(R.string.stories_composer_remaining, state.draft.charactersRemaining),
                                    modifier = Modifier.fillMaxWidth(),
                                    textAlign = TextAlign.End,
                                )
                            },
                        )
                    }

                    if (!state.isDrawingActive && (state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty())) {
                        MediaPreviewRow(
                            attachments = state.selectedSlideAttachments,
                            pending = state.selectedSlidePending,
                            backgroundMediaId = state.deck.selectedSlideBackgroundMediaId,
                            backgroundIsVideo = state.selectedSlideBackgroundIsVideo,
                            backgroundLoop = state.selectedSlideBackgroundLoop,
                            onRemove = viewModel::onRemoveMedia,
                            onToggleBackground = viewModel::onToggleSlideBackgroundMedia,
                            onToggleBackgroundLoop = { viewModel.onSetSlideBackgroundLoop(!state.selectedSlideBackgroundLoop) },
                        )
                    }
                },
                panel = {
                    if (!state.isDrawingActive) {
                        ComposerToolPanel(
                            band = state.band,
                            visibility = state.draft.visibility,
                            selectedFilter = state.selectedSlideFilter,
                            filterIntensity = state.selectedSlideFilterIntensity,
                            slideDurationSeconds = state.selectedSlideDurationSeconds,
                            selectedBackground = state.selectedSlideBackground,
                            canAddText = state.deck.selectedCanAddTextElement,
                            canAddSticker = state.deck.selectedCanAddSticker,
                            isUploadingMedia = state.isUploadingMedia,
                            isMediaFull = state.draft.isMediaFull,
                            mediaCount = state.draft.mediaIds.size,
                            hasMedia = state.draft.hasMedia,
                            onDismiss = viewModel::onBandDismiss,
                            onAddText = viewModel::onAddTextElement,
                            onAddSticker = { showStickerPicker = true },
                            onPickMedia = {
                                when (StoryMediaPicker.modeFor(state.draft.remainingMediaSlots)) {
                                    StoryMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                                    StoryMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                                    StoryMediaPickMode.None -> Unit
                                }
                            },
                            onEnterDrawing = viewModel::onEnterDrawingMode,
                            onSelectVisibility = viewModel::onVisibilityChange,
                            onSelectFilter = viewModel::onSelectFilter,
                            onFilterIntensityChange = viewModel::onFilterIntensityChange,
                            onSlideDurationChange = viewModel::onSlideDurationChange,
                            onSelectBackground = viewModel::onSlideBackgroundChange,
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )

            if (!state.isDrawingActive) {
                ComposerToolBand(
                    band = state.band,
                    badges = ComposerBandTools.badges(
                        mediaCount = state.draft.mediaIds.size,
                        textCount = state.selectedSlideTextElements.size,
                        strokeCount = state.selectedSlideStrokes.size,
                        hasBackground = state.selectedSlideBackground != null,
                    ),
                    onToolTap = viewModel::onBandToolTap,
                    onToolSwipeUp = viewModel::onBandToolSwipeUp,
                    onHideChrome = viewModel::onBandSwipeDown,
                    onShowChrome = viewModel::onBandShowChrome,
                )
            }
        }
    }
}

/**
 * Reads the picked content into a [MediaUploadItem] (bytes + advertised filename +
 * MIME). Returns null when the stream can't be opened. Pure-IO glue — the
 * filename/MIME defaulting lives in `MediaUpload`, so this stays a thin reader.
 */
internal fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = displayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

internal fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
