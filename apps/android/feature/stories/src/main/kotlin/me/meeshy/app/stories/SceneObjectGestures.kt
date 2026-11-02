package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged

/**
 * La phase d'un toucher sur un objet de la scène (#14207) : trois gestes qui ne se chevauchent jamais.
 * [PENDING] le doigt est posé et n'a pas dépassé la tolérance ; relâché ainsi, c'est un toucher. [MOVING] il l'a dépassée
 * (ou un second doigt s'est posé) : c'est un déplacement, et plus aucun appui long ne peut partir. [HELD] il est resté
 * immobile le temps de l'appui long : le menu s'ouvre, rien ne bouge plus jusqu'au relâcher.
 */
internal enum class SceneTouchPhase {
    PENDING, MOVING, HELD;

    /** [screenDistance] : le chemin du premier doigt depuis le posé, mesuré à l'ÉCRAN (jamais dans le calque mis à l'échelle). */
    fun afterMove(screenDistance: Float, pointers: Int, slopPx: Float): SceneTouchPhase =
        if (this == PENDING && (pointers > 1 || screenDistance > slopPx)) MOVING else this

    fun afterHold(): SceneTouchPhase = if (this == PENDING) HELD else this

    val releasesAsTap: Boolean get() = this == PENDING
}

/** La pose de l'objet au moment du geste, pour ramener à l'écran ce qui se mesure dans son calque. */
internal data class SceneObjectPose(val scale: Float, val rotationDeg: Float)

/**
 * Les gestes d'un objet de la scène, en UN détecteur (#14207) : toucher → [onTap] ; toucher-déplacer → [onMove] (le
 * glissé en pixels du CANEVAS, l'objet suivant le doigt quelles que soient son échelle et sa rotation, puis le pincer et
 * la rotation) ; appui long immobile → [onLongPress]. La tolérance se mesure à l'écran : un objet agrandi ne la repousse
 * pas. Chaque geste se clôt par [onEnd] (un cran d'annulation). Le posé et les mouvements sont consommés : le canevas
 * dessous ne déplace pas le fond pendant qu'on déplace l'objet.
 */
internal fun Modifier.sceneObjectGestures(
    key: Any,
    pose: () -> SceneObjectPose,
    onTap: () -> Unit,
    onLongPress: (() -> Unit)?,
    onMove: (pan: Offset, zoom: Float, rotationDeg: Float) -> Unit,
    onEnd: () -> Unit,
): Modifier = pointerInput(key) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        down.consume()
        val slop = viewConfiguration.touchSlop
        val holdAt = down.uptimeMillis + viewConfiguration.longPressTimeoutMillis
        var phase = SceneTouchPhase.PENDING
        var now = down.uptimeMillis
        while (true) {
            val event: PointerEvent? = if (phase == SceneTouchPhase.PENDING && onLongPress != null) {
                withTimeoutOrNull((holdAt - now).coerceAtLeast(0L)) { awaitPointerEvent() }
            } else {
                awaitPointerEvent()
            }
            if (event == null) {
                phase = phase.afterHold()
                onLongPress?.invoke()
                continue
            }
            if (event.changes.none { it.pressed }) break
            now = event.changes.maxOf { it.uptimeMillis }
            if (phase == SceneTouchPhase.PENDING) {
                val first = event.changes.firstOrNull { it.id == down.id }
                val travelled = first?.let { (it.position - down.position).getDistance() * pose().scale } ?: Float.MAX_VALUE
                phase = phase.afterMove(travelled, event.changes.count { it.pressed }, slop)
                if (phase == SceneTouchPhase.PENDING && now >= holdAt && onLongPress != null) {
                    phase = phase.afterHold()
                    onLongPress()
                }
            }
            if (phase == SceneTouchPhase.MOVING) {
                val pan = event.calculatePan()
                val zoom = event.calculateZoom()
                val rotation = event.calculateRotation()
                if (pan != Offset.Zero || zoom != 1f || rotation != 0f) {
                    val current = pose()
                    onMove(PlacedMediaPan.toCanvas(pan, current.scale, current.rotationDeg), zoom, rotation)
                }
            }
            event.changes.forEach { if (it.positionChanged()) it.consume() }
        }
        if (phase.releasesAsTap) onTap()
        onEnd()
    }
}
