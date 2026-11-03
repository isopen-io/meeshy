package me.meeshy.ui.component.audio

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.audioedit.AudioTrimHandlePlacement

/** Largeur d'une poignée : « large » est une exigence d'accessibilité (sous 24 dp, plus fine que la pulpe d'un doigt). */
internal val AudioTrimHandleWidth = 26.dp

/**
 * Une poignée de rognage, posée dans la bande à [rawX] (px, peut sortir du champ). Hors champ elle est
 * ramenée au bord avec une flèche. [onDragStart] reçoit l'abscisse posée ; [onDragTo] l'abscisse absolue
 * dans la bande ; [onDragEnd] marque le relâchement.
 */
@Composable
internal fun AudioTrimHandle(
    rawX: Float,
    stripWidthPx: Float,
    label: String,
    spokenValue: String,
    tint: Color,
    onDragStart: () -> Unit,
    onDragTo: (x: Float) -> Unit,
    onDragEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val widthPx = with(LocalDensity.current) { AudioTrimHandleWidth.toPx() }
    val placement = AudioTrimHandlePlacement.of(rawX, stripWidthPx, widthPx)
    val start by rememberUpdatedState(onDragStart)
    val move by rememberUpdatedState(onDragTo)
    val end by rememberUpdatedState(onDragEnd)
    val currentX by rememberUpdatedState(placement.centerX)
    Box(
        modifier
            .offset { IntOffset((placement.centerX - widthPx / 2f).roundToInt(), 0) }
            .width(AudioTrimHandleWidth)
            .fillMaxHeight()
            .background(tint, RoundedCornerShape(4.dp))
            .semantics {
                contentDescription = label
                stateDescription = spokenValue
            }
            .pointerInput(Unit) {
                var x = 0f
                detectDragGestures(
                    onDragStart = { x = currentX; start() },
                    onDragEnd = { end() },
                    onDragCancel = { end() },
                ) { change, drag ->
                    change.consume()
                    x += drag.x
                    move(x)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        when (placement.arrow) {
            AudioTrimHandlePlacement.Arrow.LEFT ->
                Icon(MeeshyIcons.ChevronBackward, null, tint = Color.White)
            AudioTrimHandlePlacement.Arrow.RIGHT ->
                Icon(MeeshyIcons.ChevronForward, null, tint = Color.White)
            AudioTrimHandlePlacement.Arrow.NONE ->
                Icon(MeeshyIcons.DragHandle, null, tint = Color.White)
        }
    }
}
