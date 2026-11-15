package me.meeshy.app.calls

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import kotlin.math.abs

/** Un pincement ne compte qu'au-delà de ce rapport, pour qu'un toucher à deux doigts qui tremble reste un toucher. */
private const val PINCH_SLOP = 0.02f

/** Ce qu'un geste sur la vignette décide : glisser, pincer, ou toucher pour permuter. */
internal class CallSelfTileGestureHandlers(
    val onDrag: (Offset) -> Unit,
    val onPinch: (Float) -> Unit,
    val onTap: () -> Unit,
    val onEnd: (dragged: Boolean, pinched: Boolean) -> Unit,
)

/**
 * Le geste unique de la vignette (miroir du glissé + pincement + toucher de iOS) : un doigt qui
 * dépasse le seuil de toucher glisse la vignette, deux doigts la pincent (la magnification cumulée
 * est rendue à [CallSelfTileGestureHandlers.onPinch]), un doigt qui se lève sans bouger permute.
 * Un seul détecteur pour les trois — jamais deux détecteurs qui se disputent le même toucher.
 */
@Composable
internal fun Modifier.callSelfTileGestures(handlers: CallSelfTileGestureHandlers): Modifier {
    val current by rememberUpdatedState(handlers)
    return pointerInput(Unit) {
        val slop = viewConfiguration.touchSlop
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false)
            var moved = false
            var pinched = false
            var accumulatedPan = Offset.Zero
            var magnification = 1f
            var cancelled = false
            do {
                val event = awaitPointerEvent()
                cancelled = event.changes.any { it.isConsumed }
                if (!cancelled) {
                    val pan = event.calculatePan()
                    val zoom = event.calculateZoom()
                    if (zoom != 1f) magnification *= zoom
                    if (!pinched && abs(magnification - 1f) > PINCH_SLOP) pinched = true
                    if (pinched) current.onPinch(magnification)
                    if (!moved) {
                        accumulatedPan += pan
                        if (accumulatedPan.getDistance() > slop) {
                            moved = true
                            current.onDrag(accumulatedPan)
                        }
                    } else {
                        current.onDrag(pan)
                    }
                    if (moved || pinched) event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            } while (!cancelled && event.changes.any { it.pressed })
            if (cancelled) return@awaitEachGesture
            if (!moved && !pinched) current.onTap()
            current.onEnd(moved, pinched)
        }
    }
}
