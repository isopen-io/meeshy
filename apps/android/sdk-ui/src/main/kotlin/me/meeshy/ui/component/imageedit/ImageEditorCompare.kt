package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.imageedit.ImageEditorCompare

/**
 * Le geste « comparer à l'original » : un doigt posé [ImageEditorCompare.HOLD_MILLIS] ms sans
 * dériver de plus de [ImageEditorCompare.MAX_DISTANCE_DP] dp appelle [onBegin] ; le relâchement
 * (ou l'annulation) appelle [onEnd]. Un deuxième doigt (pincement) ou une dérive plus grande
 * annule l'appui avant qu'il commence. Il n'absorbe aucun événement : le pincement, le
 * déplacement et le double tap du canevas continuent de fonctionner. Miroir de
 * `onLongPressGesture(minimumDuration: 0.25, maximumDistance: 30)` d'iOS.
 */
public fun Modifier.imageEditorCompareGesture(
    enabled: Boolean,
    onBegin: () -> Unit,
    onEnd: () -> Unit,
): Modifier = composed {
    val begin = rememberUpdatedState(onBegin)
    val end = rememberUpdatedState(onEnd)
    val maxDistance = with(LocalDensity.current) { ImageEditorCompare.MAX_DISTANCE_DP.dp.toPx() }
    if (!enabled) return@composed Modifier
    Modifier.pointerInput(maxDistance) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var drift = 0f
            var cancelled = false
            val held = withTimeoutOrNull(ImageEditorCompare.HOLD_MILLIS) {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.size > 1 || event.changes.none { it.pressed }) { cancelled = true; return@withTimeoutOrNull }
                    event.changes.firstOrNull { it.id == down.id }?.let { drift = (it.position - down.position).getDistance() }
                    if (drift > maxDistance) { cancelled = true; return@withTimeoutOrNull }
                }
            }
            if (held != null || cancelled) return@awaitEachGesture
            begin.value()
            try {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.none { it.pressed }) break
                }
            } finally {
                end.value()
            }
        }
    }
}
