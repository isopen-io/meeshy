package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.ui.icons.MeeshyIcons

/** La scène de référence d'iOS : une pastille garde la même part de la scène chez l'auteur et chez le lecteur. */
private const val REFERENCE_SCENE_WIDTH = 390f
private val PASTILLE_VEIL = Color.Black.copy(alpha = 0.55f)

/** Une pastille de lieu (#13846) : l'épingle et le nom, sur un voile sombre arrondi, à l'échelle de la scène [unit]. */
@Composable
internal fun PlacePastille(name: String, unit: Float, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .background(PASTILLE_VEIL, RoundedCornerShape((14 * unit).dp))
            .padding(horizontal = (12 * unit).dp, vertical = (7 * unit).dp)
            .widthIn(max = (300 * unit).dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy((6 * unit).dp),
    ) {
        Icon(MeeshyIcons.LocationFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size((16 * unit).dp))
        Text(
            text = name,
            color = Color.White,
            fontSize = (15 * unit).sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal val StoryLocationObject.label: String get() = place.name?.takeIf { it.isNotBlank() } ?: place.address.orEmpty()

/** La pastille posée dans le compositeur : touchée, elle est sélectionnée ; glissée, elle se déplace (un cran d'annulation). */
@Composable
internal fun ComposerPlaceLayer(
    place: StoryLocationObject,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    val currentTap by rememberUpdatedState(onTap)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentDragEnd by rememberUpdatedState(onDragEnd)
    val density = LocalDensity.current
    val unit = with(density) { canvasWidthPx.toDp().value } / REFERENCE_SCENE_WIDTH
    val spoken = stringResource(R.string.story_place_pastille_a11y, place.label)
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (place.x.toFloat() * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (place.y.toFloat() * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = place.scale.toFloat()
                scaleY = place.scale.toFloat()
                rotationZ = place.rotation.toFloat()
            }
            .onSizeChanged { sizePx = it }
            .pointerInput(place.id) { detectTapGestures(onTap = { currentTap() }) }
            .pointerInput(place.id) {
                detectDragGestures { change, amount ->
                    change.consume()
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) currentDrag(amount.x / canvasWidthPx, amount.y / canvasHeightPx)
                }
            }
            .pointerInput(place.id) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    currentDragEnd()
                }
            }
            .semantics {
                contentDescription = spoken
                onClick { currentTap(); true }
            }
            .sceneSelectionFrame(selected, place.scale.toFloat()),
    ) {
        PlacePastille(place.label, unit.coerceAtLeast(MIN_UNIT))
    }
}

/** La pastille lue dans le lecteur, à sa place et dans sa fenêtre de temps. */
@Composable
internal fun StoryPlaceObjectLayer(place: StoryLocationObject, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        var sizePx by remember { mutableStateOf(IntSize.Zero) }
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val unit = (maxWidth.value / REFERENCE_SCENE_WIDTH).coerceAtLeast(MIN_UNIT)
        PlacePastille(
            name = place.label,
            unit = unit,
            modifier = Modifier
                .offset {
                    IntOffset(
                        x = (place.x.toFloat() * widthPx - sizePx.width / 2f).roundToInt(),
                        y = (place.y.toFloat() * heightPx - sizePx.height / 2f).roundToInt(),
                    )
                }
                .onSizeChanged { sizePx = it }
                .graphicsLayer {
                    scaleX = place.scale.toFloat()
                    scaleY = place.scale.toFloat()
                    rotationZ = place.rotation.toFloat()
                },
        )
    }
}

/** La pastille d'un lieu paraît dans sa fenêtre de temps (aucune : toute la diapo), comme un texte. */
internal fun StoryLocationObject.isVisible(playheadSeconds: Float): Boolean {
    val start = startTime ?: return true
    val length = duration ?: return playheadSeconds >= start
    return playheadSeconds >= start && playheadSeconds <= start + length
}

private const val MIN_UNIT = 0.4f

