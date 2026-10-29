package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import kotlin.math.roundToInt
import me.meeshy.sdk.media.previewModel

/** Un média posé et de quoi le peindre : sa pose, et le modèle d'image (vignette téléversée, ou aperçu local en attente). */
internal data class PlacedMediaFrame(val placed: StoryPlacedMedia, val model: Any?) {
    val key: String get() = placed.mediaId
}

/** Les médias posés de la slide choisie, dans l'ordre de pose ; un média que la slide ne porte plus n'est pas peint. */
internal fun StoryComposerUiState.placedMediaFrames(): List<PlacedMediaFrame> =
    deck.selectedSlide.placedMedia.mapNotNull { placed ->
        val uploaded = selectedSlideAttachments.firstOrNull { it.id == placed.mediaId }
        val pending = selectedSlidePending.firstOrNull { it.cmid == placed.mediaId }
        when {
            uploaded != null -> PlacedMediaFrame(placed, uploaded.thumbnailUrl ?: uploaded.url)
            pending != null -> PlacedMediaFrame(placed, pending.item.previewModel)
            else -> null
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
 * pivoté d'un seul geste, comme un sticker. L'image est décodée hors du fil principal par Coil, à la taille de base
 * de l'objet — jamais pleine résolution — et la clé stable [PlacedMediaFrame.key] garde son état entre deux poses.
 */
@Composable
internal fun PlacedMediaLayer(
    frame: PlacedMediaFrame,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    gestures: PlacedMediaGestures,
) {
    val placed = frame.placed
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    val currentDrag by rememberUpdatedState(gestures.onDrag)
    val currentDragEnd by rememberUpdatedState(gestures.onDragEnd)
    val currentTransform by rememberUpdatedState(gestures.onTransform)
    val context = LocalContext.current
    val basePx = with(androidx.compose.ui.platform.LocalDensity.current) { PLACED_MEDIA_BASE_SIZE.roundToPx() }
    val request = remember(frame.model, basePx) {
        ImageRequest.Builder(context).data(frame.model).size(Size(basePx, basePx)).crossfade(false).build()
    }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (placed.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (placed.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = placed.scale
                scaleY = placed.scale
                rotationZ = placed.rotationDeg
            }
            .onSizeChanged { sizePx = it }
            .pointerInput(frame.key) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                        currentDrag(frame.key, pan.x / canvasWidthPx, pan.y / canvasHeightPx)
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
        AsyncImage(
            model = request,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(PLACED_MEDIA_BASE_SIZE).clip(RoundedCornerShape(8.dp)),
        )
    }
}

/** Le côté de base d'un média posé avant sa propre échelle. */
internal val PLACED_MEDIA_BASE_SIZE = 160.dp
