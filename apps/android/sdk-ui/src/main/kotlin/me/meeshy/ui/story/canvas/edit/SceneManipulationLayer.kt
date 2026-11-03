package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged

/**
 * Le geste de manipulation d'UN objet du canevas d'édition : déplacer, pincer et tourner en même temps
 * (miroir du trio pan/pinch/rotate de `StoryCanvasUIView+Gestures`). Un seul doigt déplace seulement
 * (zoom 1, rotation 0) ; deux doigts déplacent, agrandissent et tournent simultanément. Les mouvements
 * sont consommés pour que le canevas dessous ne bouge pas pendant qu'on manipule.
 *
 * [enabled] à `false` (slide vierge, mode dessin, objet verrouillé) : le geste ne s'installe pas. [onChange]
 * reçoit le glissé en pixels, le facteur de zoom et la rotation en degrés du dernier mouvement ; [onEnd]
 * clôt chaque geste (lâcher ou annulation). Les écritures à cadence limitée relèvent de l'appelant
 * ([me.meeshy.sdk.model.scene.BindingWriteThrottle]).
 */
public fun Modifier.sceneManipulationGestures(
    enabled: Boolean,
    onBegin: () -> Unit = {},
    onChange: (pan: Offset, zoom: Float, rotationDeg: Float) -> Unit,
    onEnd: () -> Unit = {},
): Modifier = composed {
    val begin = rememberUpdatedState(onBegin)
    val change = rememberUpdatedState(onChange)
    val end = rememberUpdatedState(onEnd)
    Modifier.pointerInput(enabled) {
        if (!enabled) return@pointerInput
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false)
            begin.value()
            do {
                val event = awaitPointerEvent()
                val cancelled = event.changes.any { it.isConsumed }
                if (!cancelled) {
                    val pan = event.calculatePan()
                    val zoom = event.calculateZoom()
                    val rotation = event.calculateRotation()
                    if (pan != Offset.Zero || zoom != 1f || rotation != 0f) {
                        change.value(pan, zoom, rotation)
                    }
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            } while (!cancelled && event.changes.any { it.pressed })
            end.value()
        }
    }
}

/** Le curseur main de la souris et du stylet au survol d'un objet manipulable (tablette, ChromeOS). */
public fun Modifier.sceneObjectHoverCursor(): Modifier = pointerHoverIcon(PointerIcon.Hand)
