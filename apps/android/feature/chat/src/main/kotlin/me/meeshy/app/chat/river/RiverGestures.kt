package me.meeshy.app.chat.river

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import me.meeshy.sdk.model.reading.river.RiverStepDirection

/** Le balayage à un doigt, traduit en pas de la loi (iOS `swipeGesture`) — pure, éprouvée sans écran. */
internal object RiverSwipe {

    /**
     * La direction dominante d'un balayage de [delta], ou `null` sous le seuil. Le signe horizontal
     * brut disait « vers la gauche de l'écran », donc « vers l'avant » — vrai en français, faux en
     * arabe : seul l'opérande passe dans le sens de la LECTURE ([isRtl]).
     */
    fun direction(delta: Offset, thresholdPx: Float, isRtl: Boolean): RiverStepDirection? {
        if (delta.getDistance() < thresholdPx) return null
        val horizontal = kotlin.math.abs(delta.x) > kotlin.math.abs(delta.y)
        if (!horizontal) return if (delta.y < 0) RiverStepDirection.DOWN else RiverStepDirection.UP
        val reading = if (isRtl) -delta.x else delta.x
        return if (reading < 0) RiverStepDirection.RIGHT else RiverStepDirection.LEFT
    }
}

/**
 * Les deux gestes que la Rivière ajoute au défilement natif, OBSERVÉS à la passe initiale sans rien
 * consommer — ils ne disputent jamais le pan de la pile (iOS `simultaneousGesture`) :
 *
 * - un balayage à UN doigt fait un pas de la loi (`resolveRiverStep`) ;
 * - un PINCE à deux doigts élargit les couloirs ([onPinch] reçoit l'échelle relative au début du geste).
 *
 * Un geste qu'un ANCÊTRE consomme à la passe initiale (le glissé du bord, `EdgeSwipeBackHost`) ne
 * fait aucun pas : revenir en arrière ou s'y essayer ne déplace pas le curseur.
 */
internal fun Modifier.riverGestures(
    swipeThresholdPx: Float,
    isRtl: Boolean,
    onStep: (RiverStepDirection) -> Unit,
    onPinchBegan: () -> Unit,
    onPinch: (Float) -> Unit,
): Modifier = pointerInput(swipeThresholdPx, isRtl) {
    awaitEachGesture {
        val first = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val start = first.position
        var last = start
        var startDistance = 0f
        var pinched = false
        var claimedAbove = false
        do {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            val pressed = event.changes.filter { it.pressed }
            if (pressed.size >= 2) {
                val distance = (pressed[0].position - pressed[1].position).getDistance()
                if (!pinched) {
                    pinched = true
                    startDistance = distance
                    onPinchBegan()
                } else if (startDistance > 0f) {
                    onPinch(distance / startDistance)
                }
            }
            event.changes.firstOrNull { it.id == first.id }?.let { change ->
                last = change.position
                // Un ancêtre a pris le geste à la passe initiale (le glissé du bord qui revient en arrière) : il n'est plus à nous.
                if (change.isConsumed) claimedAbove = true
            }
        } while (event.changes.any { it.pressed })
        if (!pinched && !claimedAbove) RiverSwipe.direction(last - start, swipeThresholdPx, isRtl)?.let(onStep)
    }
}
