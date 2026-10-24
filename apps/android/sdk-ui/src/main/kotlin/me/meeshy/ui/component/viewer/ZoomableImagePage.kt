package me.meeshy.ui.component.viewer

import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.imageLoader
import coil.memory.MemoryCache
import coil.request.ImageRequest
import kotlin.math.abs
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.fullscreen.FullscreenVideoGestures
import me.meeshy.sdk.model.fullscreen.GalleryImageLoadPhase
import me.meeshy.sdk.model.fullscreen.SwipeDownOutcome
import me.meeshy.ui.R

/** Radius of the blurred backdrop shown behind an image that has not resolved to a sharp frame yet (#3878). */
private val BACKDROP_BLUR_RADIUS = 24.dp

private enum class PageGesture { Undecided, Transform, DismissDrag, Released }

/**
 * Une page image du plein écran — miroir de `GalleryImagePage`
 * (`ConversationMediaGalleryView+Pages.swift`).
 *
 * - Un toucher simple bascule le chrome ([onTap]) ; le double toucher zoome. Rien ne ferme sur
 *   un toucher : seuls la croix et le glissement vers le bas ferment.
 * - Au repos, un glissement vertical de plus de 30 dp suit le doigt et ferme au-delà de 150 dp
 *   ([FullscreenVideoGestures]) ; en deçà, l'image revient en ressort. Un média agrandi se
 *   déplace sous le doigt et ne se ferme pas.
 * - Une page qui n'est plus [isActive] revient au repos.
 * - Un échec de chargement est un état DESSINÉ ([GalleryImageLoadPhase]) : « Réessayer » rejoue
 *   la requête.
 */
@Composable
internal fun ZoomableImagePage(
    url: String,
    thumbnailUrl: String?,
    altText: String?,
    isActive: Boolean,
    onZoomChanged: (Boolean) -> Unit,
    onTap: () -> Unit,
    onDragProgress: (Float) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var isFullDisplayed by remember(url) {
        mutableStateOf(context.imageLoader.memoryCache?.get(MemoryCache.Key(url)) != null)
    }
    var phase by remember(url) { mutableStateOf(GalleryImageLoadPhase()) }
    val canRenderBlurredBackdrop = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val mount = remember(url, thumbnailUrl, isFullDisplayed, canRenderBlurredBackdrop) {
        ImageViewerSource.resolve(
            fullUrl = url,
            thumbnailUrl = thumbnailUrl,
            isFullResident = isFullDisplayed,
            canRenderBlurredBackdrop = canRenderBlurredBackdrop,
        )
    }

    var scale by remember { mutableFloatStateOf(ImageViewerTransform.MIN_SCALE) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    val dragY = remember { Animatable(0f) }
    val latestOnZoomChanged by rememberUpdatedState(onZoomChanged)
    val latestOnTap by rememberUpdatedState(onTap)
    val latestOnDragProgress by rememberUpdatedState(onDragProgress)
    val latestOnDismiss by rememberUpdatedState(onDismiss)
    val dismissDistancePx = with(density) { FullscreenVideoGestures.DISMISS_DISTANCE.dp.toPx() }
    val dragStartPx = with(density) { FullscreenVideoGestures.DRAG_START_DISTANCE.dp.toPx() }

    LaunchedEffect(isActive) {
        if (isActive) return@LaunchedEffect
        scale = ImageViewerTransform.MIN_SCALE
        offsetX = 0f
        offsetY = 0f
        dragY.snapTo(0f)
    }

    fun settleDrag(travelPx: Float) {
        val travelDp = with(density) { travelPx.toDp().value }
        when (FullscreenVideoGestures.swipeDownEnded(travelDp, isPlaying = false, pipActive = false)) {
            is SwipeDownOutcome.Dismiss -> latestOnDismiss()
            SwipeDownOutcome.SnapBack -> scope.launch {
                latestOnDragProgress(0f)
                dragY.animateTo(0f, spring())
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { latestOnTap() },
                    onDoubleTap = {
                        offsetX = 0f
                        offsetY = 0f
                        scale = ImageViewerTransform.clampScale(ImageViewerTransform.doubleTapTarget(scale))
                        latestOnZoomChanged(scale > ImageViewerTransform.MIN_SCALE)
                    },
                )
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var mode = PageGesture.Undecided
                    var travel = Offset.Zero
                    var dragPx = 0f
                    while (true) {
                        val event = awaitPointerEvent()
                        if (event.changes.none { it.pressed }) break
                        val pan = event.calculatePan()
                        val zoom = event.calculateZoom()
                        if (mode == PageGesture.Undecided) {
                            travel += pan
                            val pointers = event.changes.count { it.pressed }
                            mode = when {
                                pointers > 1 || !ImageViewerTransform.dismissDragEnabled(scale) -> PageGesture.Transform
                                abs(travel.y) > dragStartPx && abs(travel.y) > abs(travel.x) -> PageGesture.DismissDrag
                                abs(travel.x) > viewConfiguration.touchSlop -> PageGesture.Released
                                else -> PageGesture.Undecided
                            }
                            if (mode == PageGesture.DismissDrag) dragPx = travel.y - pan.y
                        }
                        when (mode) {
                            PageGesture.Transform -> {
                                val newScale = ImageViewerTransform.clampScale(scale * zoom)
                                scale = newScale
                                offsetX = ImageViewerTransform.clampOffset(offsetX + pan.x, size.width.toFloat(), newScale)
                                offsetY = ImageViewerTransform.clampOffset(offsetY + pan.y, size.height.toFloat(), newScale)
                                latestOnZoomChanged(newScale > ImageViewerTransform.MIN_SCALE)
                                event.changes.forEach { it.consume() }
                            }
                            PageGesture.DismissDrag -> {
                                dragPx = FullscreenVideoGestures.dragOffset(dragPx + pan.y)
                                val follow = dragPx
                                scope.launch { dragY.snapTo(follow) }
                                latestOnDragProgress((follow / dismissDistancePx).coerceIn(0f, 1f))
                                event.changes.forEach { it.consume() }
                            }
                            PageGesture.Released -> break
                            PageGesture.Undecided -> Unit
                        }
                    }
                    if (mode == PageGesture.DismissDrag) settleDrag(dragPx)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        when {
            mount == null -> MediaUnavailableState(onRetry = null)
            phase.isFailed -> MediaUnavailableState(onRetry = { phase = phase.retried() })
            else -> {
                mount.backdropUrl?.let { backdropUrl ->
                    AsyncImage(
                        model = backdropUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .blur(BACKDROP_BLUR_RADIUS),
                    )
                }
                val attempt = phase.attempt
                val request = remember(mount.fullUrl, attempt) {
                    ImageRequest.Builder(context)
                        .data(mount.fullUrl)
                        .setParameter(RETRY_PARAMETER, attempt, memoryCacheKey = null)
                        .build()
                }
                AsyncImage(
                    model = request,
                    contentDescription = altText ?: stringResource(R.string.bubble_image_description),
                    contentScale = ContentScale.Fit,
                    onState = { state ->
                        when (state) {
                            is AsyncImagePainter.State.Success -> isFullDisplayed = true
                            is AsyncImagePainter.State.Loading -> isFullDisplayed = false
                            is AsyncImagePainter.State.Error -> phase = phase.failed(attempt)
                            else -> Unit
                        }
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            translationX = offsetX
                            translationY = offsetY + dragY.value
                        },
                )
            }
        }
    }
}

private const val RETRY_PARAMETER = "meeshy.viewer.attempt"
