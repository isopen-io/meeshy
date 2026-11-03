package me.meeshy.ui.story.canvas.edit

import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import me.meeshy.sdk.model.scene.ThreeFingerPinchDetector
import me.meeshy.sdk.model.scene.ThreeFingerPinchDetector.Event

/**
 * Le pincement à EXACTEMENT trois doigts, qui zoome le viewport sans entrer en collision avec le pincement à deux doigts
 * d'un objet (miroir de `ThreeFingerPinchGestureRecognizer`). Il observe en passe initiale et ne consomme les doigts
 * qu'une fois le geste commencé, pour que la manipulation dessous se suspende. [onScale] reçoit l'échelle cumulée depuis
 * le début ; [onEnd] reçoit l'échelle finale, ou `null` si le geste est annulé (quatrième doigt).
 */
public fun Modifier.sceneThreeFingerPinch(
    enabled: Boolean,
    onBegin: () -> Unit = {},
    onScale: (Float) -> Unit,
    onEnd: (Float?) -> Unit,
): Modifier = composed {
    val begin = rememberUpdatedState(onBegin)
    val scale = rememberUpdatedState(onScale)
    val end = rememberUpdatedState(onEnd)
    Modifier.pointerInput(enabled) {
        if (!enabled) return@pointerInput
        awaitPointerEventScope {
            val detector = ThreeFingerPinchDetector()
            var active = false
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val pressed = event.changes.filter { it.pressed }
                val result = detector.onTouches(pressed.map { ThreeFingerPinchDetector.Point(it.position.x, it.position.y) })
                when (result) {
                    Event.Began -> { active = true; begin.value() }
                    is Event.Changed -> scale.value(result.scale)
                    is Event.Ended -> { active = false; end.value(result.scale) }
                    Event.Cancelled -> { active = false; end.value(null) }
                    Event.None -> Unit
                }
                if (active || result is Event.Ended || result == Event.Cancelled) event.changes.forEach { it.consume() }
            }
        }
    }
}
