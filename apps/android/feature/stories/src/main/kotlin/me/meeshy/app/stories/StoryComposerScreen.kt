package me.meeshy.app.stories

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.FormatAlignCenter
import androidx.compose.material.icons.filled.FormatAlignLeft
import androidx.compose.material.icons.filled.FormatAlignRight
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.VerticalAlignBottom
import androidx.compose.material.icons.filled.VerticalAlignTop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.roundToInt
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.flowWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia

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
            SlideStrip(
                deck = state.deck,
                onSelect = viewModel::onSelectSlide,
                onAdd = viewModel::onAddSlide,
                onDuplicate = viewModel::onDuplicateSelectedSlide,
                onRemove = viewModel::onRemoveSlide,
                onMove = viewModel::onMoveSlide,
            )

            StoryCanvasSurface(
                transform = state.selectedSlideTransform,
                backgroundModel = state.selectedSlideAttachments.firstOrNull()?.let { it.thumbnailUrl ?: it.url }
                    ?: state.selectedSlidePending.firstOrNull()?.item?.bytes,
                colorMatrix = state.selectedSlideFilterMatrix,
                textElements = state.selectedSlideTextElements,
                selectedElement = state.selectedTextElement,
                stickers = state.selectedSlideStickers,
                selectedStickerId = state.selectedStickerId,
                onTransform = viewModel::onCanvasTransform,
                onElementTap = viewModel::onSelectTextElement,
                onElementDrag = viewModel::onTextElementMoved,
                onElementDragEnd = viewModel::onTextElementDragEnd,
                onElementTransform = viewModel::onTextElementTransform,
                onElementRemove = viewModel::onRemoveTextElement,
                onStickerTap = viewModel::onSelectSticker,
                onStickerDrag = viewModel::onStickerMoved,
                onStickerTransform = viewModel::onStickerTransform,
                onStickerRemove = viewModel::onRemoveSticker,
                onBackgroundTap = {
                    viewModel.onDeselectTextElement()
                    viewModel.onDeselectSticker()
                },
                snapFeedback = state.snapFeedback,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                floatingToolbar = {
                    state.selectedTextElement?.let { element ->
                        TextStyleToolbar(
                            element = element,
                            onStyle = { style -> viewModel.onTextElementStyle(element.id, style) },
                            onColor = { color -> viewModel.onTextElementColor(element.id, color) },
                            onAlign = { align -> viewModel.onTextElementAlign(element.id, align) },
                            onDuplicate = { viewModel.onDuplicateTextElement(element.id) },
                            onReorder = { op -> viewModel.onReorderTextElement(element.id, op) },
                        )
                    }
                },
            )

            OutlinedTextField(
                value = state.editorText,
                onValueChange = viewModel::onTextChange,
                modifier = Modifier.fillMaxWidth(),
                label = if (state.isEditingTextElement) {
                    { Text(stringResource(R.string.stories_composer_add_text)) }
                } else {
                    { Text(stringResource(R.string.stories_composer_text_caption)) }
                },
                placeholder = {
                    Text(
                        stringResource(
                            if (state.isEditingTextElement) {
                                R.string.stories_composer_text_placeholder
                            } else {
                                R.string.stories_composer_placeholder
                            },
                        ),
                    )
                },
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

            if (state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty()) {
                MediaPreviewRow(
                    attachments = state.selectedSlideAttachments,
                    pending = state.selectedSlidePending,
                    onRemove = viewModel::onRemoveMedia,
                )
            }

            ComposerControlsLayer(
                band = state.band,
                visibility = state.draft.visibility,
                selectedFilter = state.selectedSlideFilter,
                filterIntensity = state.selectedSlideFilterIntensity,
                canAddText = state.deck.selectedCanAddTextElement,
                canAddSticker = state.deck.selectedCanAddSticker,
                isUploadingMedia = state.isUploadingMedia,
                isMediaFull = state.draft.isMediaFull,
                mediaCount = state.draft.mediaIds.size,
                hasMedia = state.draft.hasMedia,
                onFabTap = viewModel::onBandFabTap,
                onDismiss = viewModel::onBandDismiss,
                onSwapCategory = viewModel::onBandSwapCategory,
                onAddText = viewModel::onAddTextElement,
                onAddSticker = { showStickerPicker = true },
                onPickMedia = {
                    when (StoryMediaPicker.modeFor(state.draft.remainingMediaSlots)) {
                        StoryMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                        StoryMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                        StoryMediaPickMode.None -> Unit
                    }
                },
                onSelectVisibility = viewModel::onVisibilityChange,
                onSelectFilter = viewModel::onSelectFilter,
                onFilterIntensityChange = viewModel::onFilterIntensityChange,
            )
        }
    }
}

/**
 * The bottom-band tools toolbar — parity with iOS's composer FAB column + bottom band
 * (`Contenu` / `Effets`). Two FABs toggle a tools drawer that animates in above them;
 * the drawer shows the active [BandCategory]'s tools — Contenu's add-text / add-media
 * tiles, or Effets' visibility chips. Which category is showing, and whether the drawer
 * is open at all, is decided by the pure, unit-tested [ComposerBandState]; this
 * Composable only renders that state and forwards intents. The drawer is dismissable by
 * a downward swipe and swaps category on a horizontal swipe — natural gestures routed
 * through [onDismiss] / [onSwapCategory].
 */
@Composable
private fun ComposerControlsLayer(
    band: ComposerBandState,
    visibility: StoryVisibility,
    selectedFilter: StoryFilter?,
    filterIntensity: Float,
    canAddText: Boolean,
    canAddSticker: Boolean,
    isUploadingMedia: Boolean,
    isMediaFull: Boolean,
    mediaCount: Int,
    hasMedia: Boolean,
    onFabTap: (BandCategory) -> Unit,
    onDismiss: () -> Unit,
    onSwapCategory: () -> Unit,
    onAddText: () -> Unit,
    onAddSticker: () -> Unit,
    onPickMedia: () -> Unit,
    onSelectVisibility: (StoryVisibility) -> Unit,
    onSelectFilter: (StoryFilter?) -> Unit,
    onFilterIntensityChange: (Float) -> Unit,
) {
    val swipeThresholdPx = with(LocalDensity.current) { 48.dp.toPx() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AnimatedVisibility(visible = band.isVisible) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .pointerInput(Unit) {
                        var total = 0f
                        detectVerticalDragGestures(
                            onDragStart = { total = 0f },
                            onDragEnd = { if (total > swipeThresholdPx) onDismiss() },
                        ) { change, dy -> change.consume(); total += dy }
                    }
                    .pointerInput(Unit) {
                        var total = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { total = 0f },
                            onDragEnd = { if (abs(total) > swipeThresholdPx) onSwapCategory() },
                        ) { change, dx -> change.consume(); total += dx }
                    },
            ) {
                when (band.activeCategory) {
                    BandCategory.CONTENU -> ContentTilesRow(
                        canAddText = canAddText,
                        canAddSticker = canAddSticker,
                        isUploadingMedia = isUploadingMedia,
                        isMediaFull = isMediaFull,
                        mediaCount = mediaCount,
                        hasMedia = hasMedia,
                        onAddText = onAddText,
                        onAddSticker = onAddSticker,
                        onPickMedia = onPickMedia,
                    )
                    BandCategory.EFFETS -> Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterRow(
                            selected = selectedFilter,
                            intensity = filterIntensity,
                            onSelect = onSelectFilter,
                            onIntensityChange = onFilterIntensityChange,
                        )
                        VisibilityRow(
                            selected = visibility,
                            onSelect = onSelectVisibility,
                        )
                    }
                    null -> Unit
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BandFab(
                icon = Icons.Filled.Add,
                label = stringResource(R.string.stories_composer_band_contenu),
                active = band.activeCategory == BandCategory.CONTENU,
                onClick = { onFabTap(BandCategory.CONTENU) },
            )
            BandFab(
                icon = Icons.Filled.Tune,
                label = stringResource(R.string.stories_composer_band_effets),
                active = band.activeCategory == BandCategory.EFFETS,
                onClick = { onFabTap(BandCategory.EFFETS) },
            )
        }
    }
}

/** One bottom-band FAB. Brand-coloured when its category's drawer is open. */
@Composable
private fun BandFab(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
) {
    val container = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
    val content = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer
    ExtendedFloatingActionButton(
        onClick = onClick,
        containerColor = container,
        contentColor = content,
        icon = { Icon(icon, contentDescription = null) },
        text = { Text(label) },
    )
}

/** The Contenu drawer's tiles — add-text and pick-media — rendered in [ComposerBand.contentTiles] order. */
@Composable
private fun ContentTilesRow(
    canAddText: Boolean,
    canAddSticker: Boolean,
    isUploadingMedia: Boolean,
    isMediaFull: Boolean,
    mediaCount: Int,
    hasMedia: Boolean,
    onAddText: () -> Unit,
    onAddSticker: () -> Unit,
    onPickMedia: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ComposerBand.contentTiles.forEach { tile ->
            when (tile) {
                ComposerContentTile.TEXT -> BandTile(
                    icon = { Icon(Icons.Filled.TextFields, contentDescription = null) },
                    label = stringResource(R.string.stories_composer_add_text),
                    enabled = canAddText,
                    onClick = onAddText,
                    modifier = Modifier.weight(1f),
                )
                ComposerContentTile.MEDIA -> BandTile(
                    icon = {
                        if (isUploadingMedia) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null)
                        }
                    },
                    label = if (hasMedia) {
                        stringResource(R.string.stories_composer_add_media_count, mediaCount, StoryComposerDraft.MAX_MEDIA)
                    } else {
                        stringResource(R.string.stories_composer_add_media)
                    },
                    enabled = !isUploadingMedia && !isMediaFull,
                    onClick = onPickMedia,
                    modifier = Modifier.weight(1f),
                )
                ComposerContentTile.STICKER -> BandTile(
                    icon = { Icon(Icons.Filled.EmojiEmotions, contentDescription = null) },
                    label = stringResource(R.string.stories_composer_add_sticker),
                    enabled = canAddSticker,
                    onClick = onAddSticker,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** A single content-drawer tile: an icon over a label, forwarding [onClick]. Glue. */
@Composable
private fun BandTile(
    icon: @Composable () -> Unit,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier) {
        icon()
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}

/**
 * The 9:16 story canvas for the **selected** slide. Renders that slide's first
 * media as the background, the slide's on-canvas [textElements] on top, and lets the
 * user pinch-zoom + drag-pan the background and drag / tap / remove each element. All
 * transform and clamp math lives in the pure, unit-tested [StoryCanvasTransform] /
 * [StoryTextElement]: each gesture callback is forwarded verbatim (pixels divided by
 * the measured canvas size into normalised fractions), so this Composable stays
 * declarative glue. A tap on the empty canvas deselects ([onBackgroundTap]).
 *
 * While a text element is being edited the [floatingToolbar] floats in-place just
 * clear of that element — above or below it, clamped inside the canvas — at the
 * vertical anchor decided by the pure, unit-tested [StoryToolbarPlacement] (fed the
 * element's measured centre/half-height, the toolbar's measured height, and the
 * keyboard-shrunk canvas height). The composer applies `imePadding`, so the canvas
 * already excludes the soft keyboard and the toolbar always lands in view.
 */
@Composable
private fun StoryCanvasSurface(
    transform: StoryCanvasTransform,
    backgroundModel: Any?,
    colorMatrix: StoryColorMatrix,
    textElements: List<StoryTextElement>,
    selectedElement: StoryTextElement?,
    stickers: List<StoryStickerElement>,
    selectedStickerId: String?,
    onTransform: (Float, Float, Float, Float, Float) -> Unit,
    onElementTap: (String) -> Unit,
    onElementDrag: (String, Float, Float) -> Unit,
    onElementDragEnd: () -> Unit,
    onElementTransform: (String, Float, Float) -> Unit,
    onElementRemove: (String) -> Unit,
    onStickerTap: (String) -> Unit,
    onStickerDrag: (String, Float, Float) -> Unit,
    onStickerTransform: (String, Float, Float) -> Unit,
    onStickerRemove: (String) -> Unit,
    onBackgroundTap: () -> Unit,
    snapFeedback: SnapFeedback?,
    modifier: Modifier = Modifier,
    floatingToolbar: @Composable () -> Unit = {},
) {
    val canvasLabel = stringResource(R.string.stories_composer_canvas)
    val guideColor = MaterialTheme.colorScheme.primary
    val warnBorder = if (snapFeedback?.withinSafeZone == false) {
        BorderStroke(2.dp, MaterialTheme.colorScheme.error)
    } else {
        null
    }
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
    var selectedHalfHeightPx by remember { mutableFloatStateOf(0f) }
    var toolbarHeightPx by remember { mutableFloatStateOf(0f) }
    val gapPx = with(LocalDensity.current) { 8.dp.toPx() }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .then(
                    if (warnBorder != null) {
                        Modifier.border(warnBorder, RoundedCornerShape(16.dp))
                    } else {
                        Modifier
                    },
                )
                .onSizeChanged {
                    canvasWidthPx = it.width.toFloat()
                    canvasHeightPx = it.height.toFloat()
                }
                .semantics { contentDescription = canvasLabel }
                .pointerInput(Unit) { detectTapGestures { onBackgroundTap() } }
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        onTransform(pan.x, pan.y, zoom, canvasWidthPx, canvasHeightPx)
                    }
                },
        ) {
            if (backgroundModel != null) {
                AsyncImage(
                    model = backgroundModel,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    colorFilter = ColorFilter.colorMatrix(ColorMatrix(colorMatrix.values.toFloatArray())),
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = transform.scale
                            scaleY = transform.scale
                            translationX = transform.offsetX
                            translationY = transform.offsetY
                        },
                )
            }
            if (snapFeedback != null) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    snapFeedback.verticalGuide?.let { gx ->
                        drawLine(
                            color = guideColor,
                            start = Offset(gx * size.width, 0f),
                            end = Offset(gx * size.width, size.height),
                            strokeWidth = 2f,
                        )
                    }
                    snapFeedback.horizontalGuide?.let { gy ->
                        drawLine(
                            color = guideColor,
                            start = Offset(0f, gy * size.height),
                            end = Offset(size.width, gy * size.height),
                            strokeWidth = 2f,
                        )
                    }
                }
            }
            textElements.forEach { element ->
                TextElementLayer(
                    element = element,
                    selected = element.id == selectedElement?.id,
                    canvasWidthPx = canvasWidthPx,
                    canvasHeightPx = canvasHeightPx,
                    onTap = { onElementTap(element.id) },
                    onDrag = { dxPx, dyPx ->
                        if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                            onElementDrag(element.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                        }
                    },
                    onDragEnd = onElementDragEnd,
                    onTransform = { zoom, rotationDeg -> onElementTransform(element.id, zoom, rotationDeg) },
                    onRemove = { onElementRemove(element.id) },
                    onMeasured = { size ->
                        if (element.id == selectedElement?.id) selectedHalfHeightPx = size.height / 2f
                    },
                )
            }
            stickers.forEach { sticker ->
                StickerLayer(
                    sticker = sticker,
                    selected = sticker.id == selectedStickerId,
                    canvasWidthPx = canvasWidthPx,
                    canvasHeightPx = canvasHeightPx,
                    onTap = { onStickerTap(sticker.id) },
                    onDrag = { dxPx, dyPx ->
                        if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                            onStickerDrag(sticker.id, dxPx / canvasWidthPx, dyPx / canvasHeightPx)
                        }
                    },
                    onTransform = { zoom, rotationDeg -> onStickerTransform(sticker.id, zoom, rotationDeg) },
                    onRemove = { onStickerRemove(sticker.id) },
                )
            }
            if (selectedElement != null) {
                val placement = StoryToolbarPlacement.resolve(
                    elementCenterYpx = selectedElement.y * canvasHeightPx,
                    elementHalfHeightPx = selectedHalfHeightPx,
                    toolbarHeightPx = toolbarHeightPx,
                    canvasHeightPx = canvasHeightPx,
                    gapPx = gapPx,
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(0, placement.topPx.roundToInt()) }
                        .padding(horizontal = 8.dp)
                        .onSizeChanged { toolbarHeightPx = it.height.toFloat() }
                        .background(
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                            shape = RoundedCornerShape(12.dp),
                        )
                        .padding(8.dp),
                ) {
                    floatingToolbar()
                }
            }
        }
    }
}

/**
 * One on-canvas text element: positioned at its normalised ([StoryTextElement.x],
 * [StoryTextElement.y]) of the measured canvas (centred on that point), draggable,
 * tappable to edit, and — when selected — carrying a small remove affordance. The
 * normalised→pixel placement and the pixel→normalised drag delta are the only
 * arithmetic here; the clamp lives in [StoryTextElement.nudged]. Pure glue.
 */
@Composable
private fun TextElementLayer(
    element: StoryTextElement,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    onTransform: (Float, Float) -> Unit,
    onRemove: () -> Unit,
    onMeasured: (IntSize) -> Unit = {},
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (element.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (element.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = element.scale
                scaleY = element.scale
                rotationZ = element.rotationDeg
            }
            .onSizeChanged {
                sizePx = it
                onMeasured(it)
            }
            .pointerInput(element.id) { detectTapGestures { onTap() } }
            .pointerInput(element.id) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    onDrag(pan.x, pan.y)
                    onTransform(zoom, rotation)
                }
            }
            .pointerInput(element.id) {
                // Observes the Final pass without consuming, so it fires the moment
                // the drag/pinch lifts (every pointer up) — clearing the snap guides —
                // while the transform detector above still owns the gesture deltas.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    onDragEnd()
                }
            }
            .background(
                color = if (selected) Color.Black.copy(alpha = 0.35f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        val typography = element.style.typography()
        val textColor = parseHexColor(element.color)
        Text(
            text = element.text.ifBlank { stringResource(R.string.stories_composer_text_placeholder) },
            color = textColor,
            fontWeight = FontWeight(typography.fontWeight),
            fontStyle = if (typography.italic) FontStyle.Italic else FontStyle.Normal,
            fontFamily = typography.family.toFontFamily(),
            letterSpacing = typography.letterSpacingEm.em,
            textAlign = element.align.toTextAlign(),
            style = if (typography.glow) {
                LocalTextStyle.current.copy(
                    shadow = Shadow(color = textColor, blurRadius = 24f),
                )
            } else {
                LocalTextStyle.current
            },
        )
        if (selected) {
            Surface(
                onClick = onRemove,
                shape = RoundedCornerShape(50),
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp),
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = stringResource(R.string.stories_composer_remove_text),
                    tint = Color.White,
                    modifier = Modifier.padding(2.dp),
                )
            }
        }
    }
}

/**
 * One on-canvas emoji sticker: placed at its normalised ([StoryStickerElement.x],
 * [StoryStickerElement.y]) of the measured canvas (centred on that point), draggable,
 * pinch/rotate-able with one gesture, tappable to select, and — when selected —
 * carrying a small remove affordance. The normalised→pixel placement and the
 * pixel→normalised drag delta are the only arithmetic here; the clamp lives in the
 * pure [StoryStickerElement]. Mirrors [TextElementLayer]; pure glue.
 */
@Composable
private fun StickerLayer(
    sticker: StoryStickerElement,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onTransform: (Float, Float) -> Unit,
    onRemove: () -> Unit,
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (sticker.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (sticker.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = sticker.scale
                scaleY = sticker.scale
                rotationZ = sticker.rotationDeg
            }
            .onSizeChanged { sizePx = it }
            .pointerInput(sticker.id) { detectTapGestures { onTap() } }
            .pointerInput(sticker.id) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    onDrag(pan.x, pan.y)
                    onTransform(zoom, rotation)
                }
            }
            .background(
                color = if (selected) Color.Black.copy(alpha = 0.25f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = sticker.emoji, fontSize = STICKER_BASE_FONT_SIZE)
        if (selected) {
            Surface(
                onClick = onRemove,
                shape = RoundedCornerShape(50),
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp),
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = stringResource(R.string.stories_composer_remove_sticker),
                    tint = Color.White,
                    modifier = Modifier.padding(2.dp),
                )
            }
        }
    }
}

/**
 * The emoji sticker picker — category tabs ([StickerCategory]) plus a live search field,
 * both driven by the pure [StickerPickerState] so the "what is visible" decision is
 * unit-tested in one place (a non-blank query searches across every category and the tab
 * row is hidden). Tapping an emoji forwards it to [onPick] (which adds it to the canvas
 * and closes the dialog). Pure glue.
 */
@Composable
private fun StickerPickerDialog(
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var picker by remember { mutableStateOf(StickerPickerState()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.stories_composer_cancel))
            }
        },
        title = { Text(stringResource(R.string.stories_composer_add_sticker)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = picker.query,
                    onValueChange = { picker = picker.withQuery(it) },
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.stories_composer_sticker_search)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!picker.isSearching) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(StickerCategory.values().toList()) { category ->
                            FilterChip(
                                selected = picker.category == category,
                                onClick = { picker = picker.withCategory(category) },
                                label = { Text(category.label()) },
                            )
                        }
                    }
                }
                val visible = picker.visibleEmojis
                if (visible.isEmpty()) {
                    Text(
                        text = stringResource(R.string.stories_composer_sticker_no_results),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(STICKER_PICKER_COLUMNS),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        gridItems(visible) { emoji ->
                            Text(
                                text = emoji,
                                fontSize = STICKER_PICKER_FONT_SIZE,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { onPick(emoji) }
                                    .padding(8.dp),
                            )
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun StickerCategory.label(): String = stringResource(
    when (this) {
        StickerCategory.SMILEYS -> R.string.stories_composer_sticker_cat_smileys
        StickerCategory.ANIMALS -> R.string.stories_composer_sticker_cat_animals
        StickerCategory.FOOD -> R.string.stories_composer_sticker_cat_food
        StickerCategory.ACTIVITIES -> R.string.stories_composer_sticker_cat_activities
        StickerCategory.TRAVEL -> R.string.stories_composer_sticker_cat_travel
        StickerCategory.OBJECTS -> R.string.stories_composer_sticker_cat_objects
        StickerCategory.SYMBOLS -> R.string.stories_composer_sticker_cat_symbols
        StickerCategory.FLAGS -> R.string.stories_composer_sticker_cat_flags
    },
)

private const val STICKER_PICKER_COLUMNS = 6
private val STICKER_PICKER_FONT_SIZE = 28.sp

private fun StoryTextAlign.toTextAlign(): TextAlign = when (this) {
    StoryTextAlign.LEFT -> TextAlign.Start
    StoryTextAlign.CENTER -> TextAlign.Center
    StoryTextAlign.RIGHT -> TextAlign.End
}

private fun StoryTextFontFamily.toFontFamily(): FontFamily = when (this) {
    StoryTextFontFamily.SANS -> FontFamily.SansSerif
    StoryTextFontFamily.SERIF -> FontFamily.Serif
    StoryTextFontFamily.MONOSPACE -> FontFamily.Monospace
    StoryTextFontFamily.CURSIVE -> FontFamily.Cursive
}

/** The intrinsic on-canvas emoji size before per-sticker [StoryStickerElement.scale]. */
private val STICKER_BASE_FONT_SIZE = 48.sp

/** The on-canvas text colour palette — hex (no `#`), [StoryTextElement.DEFAULT_COLOR] first. */
private val STORY_TEXT_COLORS = listOf(
    StoryTextElement.DEFAULT_COLOR,
    "000000",
    "FF3B30",
    "FF9500",
    "FFCC00",
    "34C759",
    "007AFF",
    "AF52DE",
    "FF2D55",
)

private fun StoryTextStyle.labelRes(): Int = when (this) {
    StoryTextStyle.BOLD -> R.string.stories_composer_style_bold
    StoryTextStyle.NEON -> R.string.stories_composer_style_neon
    StoryTextStyle.TYPEWRITER -> R.string.stories_composer_style_typewriter
    StoryTextStyle.HANDWRITING -> R.string.stories_composer_style_handwriting
    StoryTextStyle.CLASSIC -> R.string.stories_composer_style_classic
}

/**
 * Styling controls for the [element] currently being edited — the iOS-parity style
 * picker (five faces), the alignment toggle, and the colour swatches. Pure glue: each
 * affordance forwards its choice to a ViewModel intent ([onStyle]/[onColor]/[onAlign])
 * whose logic is unit-tested; selection highlighting reads straight off the element.
 */
@Composable
private fun TextStyleToolbar(
    element: StoryTextElement,
    onStyle: (StoryTextStyle) -> Unit,
    onColor: (String) -> Unit,
    onAlign: (StoryTextAlign) -> Unit,
    onDuplicate: () -> Unit,
    onReorder: (StoryZOrder) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(StoryTextStyle.entries) { style ->
                FilterChip(
                    selected = element.style == style,
                    onClick = { onStyle(style) },
                    label = { Text(stringResource(style.labelRes())) },
                )
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AlignToggle(StoryTextAlign.LEFT, element.align, onAlign)
            AlignToggle(StoryTextAlign.CENTER, element.align, onAlign)
            AlignToggle(StoryTextAlign.RIGHT, element.align, onAlign)
            IconButton(onClick = onDuplicate) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = stringResource(R.string.stories_composer_duplicate_element),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ZOrderButton(Icons.Filled.VerticalAlignBottom, R.string.stories_composer_zorder_to_back) {
                onReorder(StoryZOrder.TO_BACK)
            }
            ZOrderButton(Icons.Filled.ArrowDownward, R.string.stories_composer_zorder_backward) {
                onReorder(StoryZOrder.BACKWARD)
            }
            ZOrderButton(Icons.Filled.ArrowUpward, R.string.stories_composer_zorder_forward) {
                onReorder(StoryZOrder.FORWARD)
            }
            ZOrderButton(Icons.Filled.VerticalAlignTop, R.string.stories_composer_zorder_to_front) {
                onReorder(StoryZOrder.TO_FRONT)
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(STORY_TEXT_COLORS) { hex ->
                ColorSwatch(
                    hex = hex,
                    selected = element.color.equals(hex, ignoreCase = true),
                    onClick = { onColor(hex) },
                )
            }
        }
    }
}

@Composable
private fun AlignToggle(
    align: StoryTextAlign,
    current: StoryTextAlign,
    onAlign: (StoryTextAlign) -> Unit,
) {
    val (icon, label) = when (align) {
        StoryTextAlign.LEFT -> Icons.Filled.FormatAlignLeft to R.string.stories_composer_align_left
        StoryTextAlign.CENTER -> Icons.Filled.FormatAlignCenter to R.string.stories_composer_align_center
        StoryTextAlign.RIGHT -> Icons.Filled.FormatAlignRight to R.string.stories_composer_align_right
    }
    val selected = align == current
    IconButton(onClick = { onAlign(align) }) {
        Icon(
            icon,
            contentDescription = stringResource(label),
            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ZOrderButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    labelRes: Int,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick) {
        Icon(
            icon,
            contentDescription = stringResource(labelRes),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ColorSwatch(hex: String, selected: Boolean, onClick: () -> Unit) {
    val ring = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(50))
            .background(parseHexColor(hex))
            .border(BorderStroke(if (selected) 2.dp else 1.dp, ring), RoundedCornerShape(50))
            .pointerInput(hex) { detectTapGestures { onClick() } }
            .semantics { contentDescription = "#$hex" },
    )
}

/** Parses a `RRGGBB` (or `#RRGGBB`) hex colour, falling back to white on anything unexpected. */
private fun parseHexColor(hex: String): Color =
    runCatching { Color(("ff" + hex.removePrefix("#")).toLong(16)) }.getOrDefault(Color.White)

/**
 * Mini-preview strip of the multi-slide deck — the structural surface of the
 * upcoming canvas. Each slide is a numbered, selectable chip (tap to switch); the
 * selected chip carries Duplicate / Remove actions (Remove hidden on the last
 * remaining slide). A trailing "+" chip appends a slide, disabled at the ≤10 cap.
 * A horizontal drag on a chip reorders it: the accumulated pixels and the measured
 * slot width feed the pure, unit-tested [SlideReorderResolver], which yields the
 * clamped target index handed to [onMove] on drag end.
 * Pure glue: every decision (cap, can-remove, selection, reorder target) is read
 * off the already unit-tested [StorySlideDeck]/[SlideReorderResolver]; this only
 * renders the deck and forwards intents.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SlideStrip(
    deck: StorySlideDeck,
    onSelect: (String) -> Unit,
    onAdd: () -> Unit,
    onDuplicate: () -> Unit,
    onRemove: (String) -> Unit,
    onMove: (String, Int) -> Unit,
) {
    val spacingPx = with(LocalDensity.current) { 8.dp.toPx() }
    var chipWidthPx by remember { mutableFloatStateOf(0f) }
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        itemsIndexed(deck.slides, key = { _, slide -> slide.id }) { index, slide ->
            val selected = slide.id == deck.selectedId
            FilterChip(
                selected = selected,
                onClick = { onSelect(slide.id) },
                modifier = Modifier
                    .onSizeChanged { chipWidthPx = it.width.toFloat() }
                    .pointerInput(slide.id, index, deck.size) {
                        var totalDrag = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { totalDrag = 0f },
                            onDragEnd = {
                                onMove(
                                    slide.id,
                                    SlideReorderResolver.targetIndex(
                                        fromIndex = index,
                                        dragPx = totalDrag,
                                        slotWidthPx = chipWidthPx + spacingPx,
                                        slideCount = deck.size,
                                    ),
                                )
                            },
                        ) { change, dragAmount ->
                            change.consume()
                            totalDrag += dragAmount
                        }
                    },
                label = { Text(stringResource(R.string.stories_composer_slide_label, index + 1)) },
                trailingIcon = if (selected && deck.canRemoveSlide) {
                    {
                        IconButton(onClick = { onRemove(slide.id) }, modifier = Modifier.size(18.dp)) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(R.string.stories_composer_remove_slide),
                            )
                        }
                    }
                } else {
                    null
                },
            )
        }
        item {
            IconButton(onClick = onDuplicate, enabled = deck.canAddSlide) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = stringResource(R.string.stories_composer_duplicate_slide),
                )
            }
        }
        item {
            AssistChip(
                onClick = onAdd,
                enabled = deck.canAddSlide,
                label = { Text(stringResource(R.string.stories_composer_add_slide)) },
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MediaPreviewRow(
    attachments: List<UploadedMedia>,
    pending: List<PendingMediaUpload>,
    onRemove: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(attachments, key = { it.id }) { media ->
            MediaThumbnail(
                model = media.thumbnailUrl ?: media.url,
                isPending = false,
                onRemove = { onRemove(media.id) },
            )
        }
        items(pending, key = { it.cmid }) { upload ->
            MediaThumbnail(
                model = upload.item.bytes,
                isPending = true,
                onRemove = { onRemove(upload.cmid) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MediaThumbnail(
    model: Any?,
    isPending: Boolean,
    onRemove: () -> Unit,
) {
    Box {
        AsyncImage(
            model = model,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp)),
        )
        if (isPending) {
            Surface(
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.stories_composer_media_pending),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                )
            }
        }
        Surface(
            onClick = onRemove,
            shape = RoundedCornerShape(50),
            color = Color.Black.copy(alpha = 0.55f),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(2.dp)
                .size(22.dp),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.stories_composer_remove_media),
                tint = Color.White,
                modifier = Modifier.padding(3.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VisibilityRow(
    selected: StoryVisibility,
    onSelect: (StoryVisibility) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(StoryVisibility.entries) { visibility ->
            FilterChip(
                selected = visibility == selected,
                onClick = { onSelect(visibility) },
                label = { Text(stringResource(visibility.labelRes())) },
            )
        }
    }
}

private fun StoryVisibility.labelRes(): Int = when (this) {
    StoryVisibility.PUBLIC -> R.string.stories_visibility_public
    StoryVisibility.FRIENDS -> R.string.stories_visibility_friends
    StoryVisibility.COMMUNITY -> R.string.stories_visibility_community
    StoryVisibility.PRIVATE -> R.string.stories_visibility_private
}

/**
 * The Effets drawer's photo-filter picker: a "None" chip plus one chip per
 * [StoryFilter] preset (selecting toggles the slide's filter), and — only while a
 * filter is active — a strength slider. All per-slide; the deck holds the state and
 * the colour math lives in [StoryFilterMatrix], so this stays glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterRow(
    selected: StoryFilter?,
    intensity: Float,
    onSelect: (StoryFilter?) -> Unit,
    onIntensityChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            item {
                FilterChip(
                    selected = selected == null,
                    onClick = { onSelect(null) },
                    label = { Text(stringResource(R.string.stories_composer_filter_none)) },
                )
            }
            items(StoryFilter.entries) { filter ->
                FilterChip(
                    selected = filter == selected,
                    onClick = { onSelect(filter) },
                    label = { Text(stringResource(filter.labelRes())) },
                )
            }
        }
        if (selected != null) {
            val intensityLabel = stringResource(R.string.stories_composer_filter_intensity)
            Slider(
                value = intensity,
                onValueChange = onIntensityChange,
                valueRange = 0f..1f,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = intensityLabel },
            )
        }
    }
}

private fun StoryFilter.labelRes(): Int = when (this) {
    StoryFilter.VINTAGE -> R.string.stories_composer_filter_vintage
    StoryFilter.BW -> R.string.stories_composer_filter_bw
    StoryFilter.WARM -> R.string.stories_composer_filter_warm
    StoryFilter.COOL -> R.string.stories_composer_filter_cool
    StoryFilter.DRAMATIC -> R.string.stories_composer_filter_dramatic
    StoryFilter.VIVID -> R.string.stories_composer_filter_vivid
    StoryFilter.FADE -> R.string.stories_composer_filter_fade
    StoryFilter.CHROME -> R.string.stories_composer_filter_chrome
}

/**
 * Reads the picked content into a [MediaUploadItem] (bytes + advertised filename +
 * MIME). Returns null when the stream can't be opened. Pure-IO glue — the
 * filename/MIME defaulting lives in `MediaUpload`, so this stays a thin reader.
 */
private fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = displayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

private fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
