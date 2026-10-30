package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.imageedit.sceneLook

/**
 * Un média posé et de quoi le peindre : sa pose, le modèle d'image (vignette téléversée, ou aperçu local en attente)
 * et son ratio mesuré — `null` tant que le média n'est pas téléversé, peint alors en carré comme chez les lecteurs.
 */
@Immutable
internal data class PlacedMediaFrame(
    val placed: StoryPlacedMedia,
    val model: Any?,
    val aspectRatio: Double? = null,
    val isVideo: Boolean = false,
    val pendingItem: MediaUploadItem? = null,
) {
    val key: String get() = placed.mediaId

    /** Le look que le plateau peint : SON filtre à pleine force puis SES réglages, jamais ceux de la scène — le même que lit `SceneLookRecipe.forMedia`. */
    val look: SceneLookRecipe get() = SceneLookRecipe.forStory(placed.filter, 1f, placed.adjustments, isVideo)
}

/** Les médias posés de la slide choisie, dans l'ordre de pose ; un média que la slide ne porte plus, ou son fond, n'est pas peint. */
internal fun StoryComposerUiState.placedMediaFrames(comparing: String? = null): List<PlacedMediaFrame> {
    val background = deck.selectedSlide.backgroundMediaId
    return deck.selectedSlide.placedMedia.filter { it.mediaId != background }.map { placed ->
        if (placed.mediaId == comparing) placed.copy(filter = null, adjustments = null) else placed
    }.mapNotNull { placed ->
        val uploaded = selectedSlideAttachments.firstOrNull { it.id == placed.mediaId }
        val pending = selectedSlidePending.firstOrNull { it.cmid == placed.mediaId }
        when {
            uploaded != null -> {
                val isVideo = uploaded.mimeType.startsWith("video", ignoreCase = true)
                PlacedMediaFrame(
                    placed = placed,
                    model = if (isVideo) uploaded.thumbnailUrl else uploaded.thumbnailUrl ?: uploaded.url,
                    aspectRatio = ForegroundMediaFrame.measuredAspectRatio(uploaded.width, uploaded.height),
                    isVideo = isVideo,
                )
            }
            pending != null -> {
                val isVideo = pending.item.mimeType.startsWith("video", ignoreCase = true)
                PlacedMediaFrame(
                    placed = placed,
                    model = if (isVideo) null else pending.item.previewModel,
                    isVideo = isVideo,
                    pendingItem = pending.item.takeUnless { isVideo },
                )
            }
            else -> null
        }
    }
}

/** Les trois gestes d'un média posé, par identifiant : glisser (fractions du canevas), fin de geste, pincer / tourner. */
internal class PlacedMediaGestures(
    val onDrag: (String, Float, Float) -> Unit,
    val onDragEnd: () -> Unit,
    val onTransform: (String, Float, Float) -> Unit,
)

/**
 * Un média de premier plan sur la scène : posé à sa position normalisée (centré sur ce point), glissé, pincé et
 * pivoté d'un seul geste, comme un sticker. Son cadre de base est celui que peignent les lecteurs iOS et Android
 * ([ForegroundMediaFrame], projeté sur la largeur du canevas), rempli comme eux. L'image est décodée hors du fil
 * principal par Coil, à la taille de ce cadre — jamais pleine résolution.
 */
@Composable
internal fun PlacedMediaLayer(
    frame: PlacedMediaFrame,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    gestures: PlacedMediaGestures,
) {
    val placed = frame.placed
    val currentDrag by rememberUpdatedState(gestures.onDrag)
    val currentDragEnd by rememberUpdatedState(gestures.onDragEnd)
    val currentTransform by rememberUpdatedState(gestures.onTransform)
    val currentScale by rememberUpdatedState(placed.scale)
    val currentRotation by rememberUpdatedState(placed.rotationDeg)
    val context = LocalContext.current
    val density = LocalDensity.current
    val measuredRatio by produceState<Double?>(initialValue = null, frame.pendingItem) {
        value = frame.pendingItem?.let { PendingPlacedMediaRatio.of(it) }
    }
    val ratio = frame.aspectRatio ?: measuredRatio
    val base = remember(ratio, canvasWidthPx) {
        ForegroundMediaFrame.renderedSize(ratio, scale = 1.0, canvasWidth = canvasWidthPx.toDouble())
    }
    val widthPx = base.width.toFloat()
    val heightPx = base.height.toFloat()
    val request = remember(frame.model, widthPx, heightPx) {
        ImageRequest.Builder(context)
            .data(frame.model)
            .size(Size(max(1, widthPx.roundToInt()), max(1, heightPx.roundToInt())))
            .crossfade(false)
            .build()
    }
    val corner = with(density) { (min(widthPx, heightPx) * CORNER_FRACTION).toDp() }
    Box(
        modifier = Modifier
            .testTag("placed-media")
            .offset {
                IntOffset(
                    x = (placed.x * canvasWidthPx - widthPx / 2f).roundToInt(),
                    y = (placed.y * canvasHeightPx - heightPx / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = placed.scale
                scaleY = placed.scale
                rotationZ = placed.rotationDeg
            }
            .pointerInput(frame.key) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                        val onCanvas = PlacedMediaPan.toCanvas(pan, currentScale, currentRotation)
                        currentDrag(frame.key, onCanvas.x / canvasWidthPx, onCanvas.y / canvasHeightPx)
                    }
                    currentTransform(frame.key, zoom, rotation)
                }
            }
            .pointerInput(frame.key) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    currentDragEnd()
                }
            },
    ) {
        val frameModifier = Modifier
            .size(with(density) { widthPx.toDp() }, with(density) { heightPx.toDp() })
            .clip(RoundedCornerShape(corner))
        if (frame.model == null && frame.isVideo) {
            VideoFramePlaceholder(frameModifier)
        } else {
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = frameModifier.sceneLook(frame.look),
            )
        }
    }
}

/** Une vidéo dont on n'a aucune image à décoder : un cadre à la forme de la vidéo, jamais un calque vide qu'on ne saisit pas. */
@Composable
private fun VideoFramePlaceholder(modifier: Modifier) {
    Box(
        modifier = modifier
            .testTag("placed-media-placeholder")
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Video,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(PLACEHOLDER_ICON),
        )
    }
}

private val PLACEHOLDER_ICON = 32.dp

/** L'arrondi d'un média posé, en fraction de son petit côté — `StoryMediaLayer.cornerRadiusFraction` (iOS). */
private const val CORNER_FRACTION = 0.06f
