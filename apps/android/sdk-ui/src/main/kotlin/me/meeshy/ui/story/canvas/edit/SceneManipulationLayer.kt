package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroidSize
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
import kotlin.math.PI
import kotlin.math.abs

/**
 * Le geste de manipulation d'UN objet du canevas d'édition : déplacer, pincer et tourner en même temps
 * (miroir du trio pan/pinch/rotate de `StoryCanvasUIView+Gestures`). Un seul doigt déplace seulement
 * (zoom 1, rotation 0) ; deux doigts déplacent, agrandissent et tournent simultanément. Les mouvements
 * sont consommés pour que le canevas dessous ne bouge pas pendant qu'on manipule.
 *
 * Le geste ne commence qu'au-delà du seuil de toucher (`touchSlop`, comme `detectTransformGestures`) : en deçà,
 * rien n'est annoncé ni consommé, si bien qu'un doigt posé qui tremble reste un toucher ou un appui long pour les
 * gestes voisins (le fond se sélectionne en le tenant), et les repères ne se peignent pas pour un simple appui.
 *
 * [enabled] à `false` (slide vierge, mode dessin, objet verrouillé) : le geste ne s'installe pas. [onBegin] ouvre le
 * geste au franchissement du seuil ; [onChange] reçoit le glissé en pixels, le facteur de zoom et la rotation en
 * degrés du dernier mouvement ; [onEnd] clôt chaque geste commencé (lâcher ou annulation). Les écritures à cadence
 * limitée relèvent de l'appelant ([me.meeshy.sdk.model.scene.BindingWriteThrottle]).
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
            val slop = ManipulationSlop(viewConfiguration.touchSlop)
            do {
                val event = awaitPointerEvent()
                val cancelled = event.changes.any { it.isConsumed }
                if (!cancelled) {
                    val pan = event.calculatePan()
                    val zoom = event.calculateZoom()
                    val rotation = event.calculateRotation()
                    if (slop.crossedBy(pan, zoom, rotation, event.calculateCentroidSize(useCurrent = false))) begin.value()
                    if (slop.crossed) {
                        if (pan != Offset.Zero || zoom != 1f || rotation != 0f) change.value(pan, zoom, rotation)
                        event.changes.forEach { if (it.positionChanged()) it.consume() }
                    }
                }
            } while (!cancelled && event.changes.any { it.pressed })
            if (slop.crossed) end.value()
        }
    }
}

/**
 * Le seuil de toucher d'un geste de manipulation, cumulé depuis l'appui : glissé, écart de pincement et arc de
 * rotation mesurés en pixels au centroïde. [crossedBy] rend `true` une seule fois, au mouvement qui le franchit.
 */
private class ManipulationSlop(private val touchSlop: Float) {
    private var pan = Offset.Zero
    private var zoom = 1f
    private var rotationDeg = 0f
    var crossed = false
        private set

    fun crossedBy(panChange: Offset, zoomChange: Float, rotationChange: Float, centroidSize: Float): Boolean {
        if (crossed) return false
        pan += panChange
        zoom *= zoomChange
        rotationDeg += rotationChange
        val zoomMotion = abs(1 - zoom) * centroidSize
        val rotationMotion = abs(rotationDeg * PI.toFloat() * centroidSize / 180f)
        crossed = zoomMotion > touchSlop || rotationMotion > touchSlop || pan.getDistance() > touchSlop
        return crossed
    }
}

/** Le curseur main de la souris et du stylet au survol d'un objet manipulable (tablette, ChromeOS). */
public fun Modifier.sceneObjectHoverCursor(): Modifier = pointerHoverIcon(PointerIcon.Hand)
