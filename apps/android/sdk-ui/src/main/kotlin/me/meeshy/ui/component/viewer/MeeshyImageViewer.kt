package me.meeshy.ui.component.viewer

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.launch
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Fullscreen swipeable image viewer (charte graphique: fond noir immersif).
 * Pinch-zoom + pan + double-tap per page; horizontal swipe changes page only
 * at rest scale so panning a zoomed image never fights the pager.
 */
@Composable
public fun MeeshyImageViewer(
    imageUrls: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit,
    captions: List<String?> = emptyList(),
    authors: List<String?> = emptyList(),
    timestamps: List<String?> = emptyList(),
    onImageSaved: ((Result<Unit>) -> Unit)? = null,
) {
    if (imageUrls.isEmpty()) return
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val pagerState = rememberPagerState(
            initialPage = initialIndex.coerceIn(0, imageUrls.lastIndex),
            pageCount = { imageUrls.size },
        )
        var currentPageZoomed by rememberSaveable { mutableStateOf(false) }
        var saving by remember { mutableStateOf(false) }

        val context = LocalContext.current
        val scope = rememberCoroutineScope()
        LaunchedEffect(pagerState.currentPage, imageUrls) {
            val loader = context.imageLoader
            ImageViewerPrefetch.neighbors(
                currentIndex = pagerState.currentPage,
                total = imageUrls.size,
            ).forEach { index ->
                loader.enqueue(
                    ImageRequest.Builder(context).data(imageUrls[index]).build(),
                )
            }
        }

        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = !currentPageZoomed,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                ZoomableImage(
                    url = imageUrls[page],
                    onZoomChanged = { zoomed ->
                        if (page == pagerState.settledPage) currentPageZoomed = zoomed
                    },
                    onTap = onDismiss,
                )
            }

            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .statusBarsPadding()
                    .padding(MeeshySpacing.sm),
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.image_viewer_close),
                    tint = Color.White,
                )
            }

            if (onImageSaved != null && GalleryImageSaver.isSupported) {
                IconButton(
                    onClick = {
                        if (!saving) {
                            saving = true
                            scope.launch {
                                val result = GalleryImageSaver.save(context, imageUrls[pagerState.currentPage])
                                saving = false
                                onImageSaved(result)
                            }
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(MeeshySpacing.sm),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FileDownload,
                        contentDescription = stringResource(R.string.image_viewer_save),
                        tint = Color.White,
                    )
                }
            }

            if (imageUrls.size > 1) {
                Text(
                    text = "${pagerState.currentPage + 1} / ${imageUrls.size}",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding()
                        .padding(MeeshySpacing.lg),
                )
            }

            val caption = captions.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val author = authors.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val timestamp = timestamps.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val hasHeader = author != null || timestamp != null
            if ((hasHeader || caption != null) && !currentPageZoomed) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.45f))
                        .navigationBarsPadding()
                        .padding(MeeshySpacing.lg),
                ) {
                    if (hasHeader) {
                        Text(
                            text = listOfNotNull(author, timestamp).joinToString("  ·  "),
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (caption != null) {
                        Text(
                            text = caption,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ZoomableImage(
    url: String,
    onZoomChanged: (Boolean) -> Unit,
    onTap: () -> Unit,
) {
    var scale by remember { mutableFloatStateOf(ImageViewerTransform.MIN_SCALE) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var containerWidth by remember { mutableFloatStateOf(0f) }
    var containerHeight by remember { mutableFloatStateOf(0f) }

    fun applyScale(newScale: Float) {
        scale = ImageViewerTransform.clampScale(newScale)
        offsetX = ImageViewerTransform.clampOffset(offsetX, containerWidth, scale)
        offsetY = ImageViewerTransform.clampOffset(offsetY, containerHeight, scale)
        onZoomChanged(scale > ImageViewerTransform.MIN_SCALE)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                containerWidth = size.width.toFloat()
                containerHeight = size.height.toFloat()
                detectTapGestures(
                    onTap = { onTap() },
                    onDoubleTap = {
                        offsetX = 0f
                        offsetY = 0f
                        applyScale(ImageViewerTransform.doubleTapTarget(scale))
                    },
                )
            }
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    containerWidth = size.width.toFloat()
                    containerHeight = size.height.toFloat()
                    val newScale = ImageViewerTransform.clampScale(scale * zoom)
                    scale = newScale
                    offsetX = ImageViewerTransform.clampOffset(
                        offsetX + pan.x,
                        containerWidth,
                        newScale,
                    )
                    offsetY = ImageViewerTransform.clampOffset(
                        offsetY + pan.y,
                        containerHeight,
                        newScale,
                    )
                    onZoomChanged(newScale > ImageViewerTransform.MIN_SCALE)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = url,
            contentDescription = stringResource(R.string.bubble_image_description),
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offsetX
                    translationY = offsetY
                },
        )
    }
}
