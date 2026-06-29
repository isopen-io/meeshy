package me.meeshy.app.stories

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
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
                onTransform = viewModel::onCanvasTransform,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )

            OutlinedTextField(
                value = state.draft.text,
                onValueChange = viewModel::onTextChange,
                modifier = Modifier.fillMaxWidth(),
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

            if (state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty()) {
                MediaPreviewRow(
                    attachments = state.selectedSlideAttachments,
                    pending = state.selectedSlidePending,
                    onRemove = viewModel::onRemoveMedia,
                )
            }

            OutlinedButton(
                onClick = {
                    when (StoryMediaPicker.modeFor(state.draft.remainingMediaSlots)) {
                        StoryMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                        StoryMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                        StoryMediaPickMode.None -> Unit
                    }
                },
                enabled = !state.isUploadingMedia && !state.draft.isMediaFull,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isUploadingMedia) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null)
                }
                Text(
                    text = if (state.draft.hasMedia) {
                        stringResource(
                            R.string.stories_composer_add_media_count,
                            state.draft.mediaIds.size,
                            StoryComposerDraft.MAX_MEDIA,
                        )
                    } else {
                        stringResource(R.string.stories_composer_add_media)
                    },
                    modifier = Modifier.padding(start = 8.dp),
                )
            }

            VisibilityRow(
                selected = state.draft.visibility,
                onSelect = viewModel::onVisibilityChange,
            )
        }
    }
}

/**
 * The 9:16 story canvas for the **selected** slide. Renders that slide's first
 * media as the background (the upcoming text/sticker/drawing elements layer on top
 * in later slices) and lets the user pinch-zoom + drag-pan it. All transform math
 * lives in the pure, unit-tested [StoryCanvasTransform]: each `detectTransformGestures`
 * callback is forwarded verbatim to [onTransform] together with the measured canvas
 * size, and the resolved [transform] is applied as a `graphicsLayer`, so this
 * Composable stays declarative glue. An empty slide shows the bare 9:16 frame.
 */
@Composable
private fun StoryCanvasSurface(
    transform: StoryCanvasTransform,
    backgroundModel: Any?,
    onTransform: (Float, Float, Float, Float, Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canvasLabel = stringResource(R.string.stories_composer_canvas)
    var canvasWidthPx by remember { mutableFloatStateOf(0f) }
    var canvasHeightPx by remember { mutableFloatStateOf(0f) }
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
                .onSizeChanged {
                    canvasWidthPx = it.width.toFloat()
                    canvasHeightPx = it.height.toFloat()
                }
                .semantics { contentDescription = canvasLabel }
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
        }
    }
}

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
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
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
