package me.meeshy.ui.component.capture

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.positionChange
import kotlinx.coroutines.withTimeoutOrNull

/** Les rappels d'une nappe de gestes ; les translations sont en dp, le repère est celui de l'écran (y vers le bas). */
public class CaptureGestureCallbacks(
    val onGestureStart: () -> Unit = {},
    val onTap: (Offset) -> Unit = {},
    val onHoldBegan: () -> Unit = {},
    val onHoldMoved: (dxDp: Float, dyDp: Float) -> Unit = { _, _ -> },
    val onHoldEnded: () -> Unit = {},
    val onDrag: (dyDp: Float) -> Unit = {},
    val onDragEnded: (dyDp: Float) -> Unit = {},
    val onPinch: (scale: Float) -> Unit = {},
    val onPinchEnded: () -> Unit = {},
)

private const val LONG_PRESS_MS = 500L

private enum class Opening { TAP, HOLD, DRAG, PINCH }

/**
 * Un seul détecteur pour la scène et pour le déclencheur : toucher, tenir (0,5 s), glisser, pincer.
 * Le bloc ne dépend d'AUCUNE clé d'état : relancer le détecteur en pleine tenue couperait le doigt suivi.
 * Après la tenue, le doigt reste suivi jusqu'à sa levée (verrou à droite, zoom à la verticale).
 * Le travail ici ne fait que relayer ; la machine du viseur décide.
 */
internal suspend fun PointerInputScope.detectCaptureGestures(provider: () -> CaptureGestureCallbacks, dragDismisses: () -> Boolean) {
    awaitEachGesture {
        val callbacks = provider()
        val down = awaitFirstDown(requireUnconsumed = false)
        callbacks.onGestureStart()
        val density = this@detectCaptureGestures.density
        val slop = viewConfiguration.touchSlop
        var opening = Opening.HOLD
        var tapAt = down.position
        withTimeoutOrNull(LONG_PRESS_MS) {
            while (true) {
                val event = awaitPointerEvent()
                val first = event.changes.firstOrNull() ?: break
                when {
                    event.changes.count { it.pressed } >= 2 -> { opening = Opening.PINCH; break }
                    !first.pressed -> { opening = Opening.TAP; tapAt = first.position; break }
                    (first.position - down.position).getDistance() > slop -> { opening = Opening.DRAG; break }
                }
            }
        }
        when (opening) {
            Opening.TAP -> callbacks.onTap(tapAt)
            Opening.HOLD -> follow(down.position, density, callbacks, begins = true)
            Opening.DRAG -> follow(down.position, density, callbacks, begins = false, silent = !dragDismisses())
            Opening.PINCH -> pinch(callbacks)
        }
    }
}

private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.follow(
    origin: Offset,
    density: Float,
    callbacks: CaptureGestureCallbacks,
    begins: Boolean,
    silent: Boolean = false,
) {
    if (begins) callbacks.onHoldBegan()
    var lastDy = 0f
    while (true) {
        val event: PointerEvent = awaitPointerEvent()
        val change = event.changes.firstOrNull() ?: break
        val dx = (change.position.x - origin.x) / density
        val dy = (change.position.y - origin.y) / density
        lastDy = dy
        if (!change.pressed) break
        change.consume()
        if (silent) continue
        if (begins) callbacks.onHoldMoved(dx, dy) else callbacks.onDrag(dy)
    }
    if (begins) callbacks.onHoldEnded() else if (!silent) callbacks.onDragEnded(lastDy)
}

private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.pinch(callbacks: CaptureGestureCallbacks) {
    var startDistance = 0f
    while (true) {
        val event = awaitPointerEvent()
        val pressed = event.changes.filter { it.pressed }
        if (pressed.size < 2) break
        val distance = (pressed[0].position - pressed[1].position).getDistance()
        if (startDistance == 0f) startDistance = distance
        if (startDistance > 0f) callbacks.onPinch(distance / startDistance)
        event.changes.forEach { if (it.positionChange() != Offset.Zero) it.consume() }
    }
    callbacks.onPinchEnded()
}
