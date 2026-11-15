package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Le dernier doigt quitte le compositeur (#14209) : [onLift] referme le geste continu de l'historique. Observé en passe
 * finale sans rien consommer, après que la scène, ses panneaux et leurs curseurs ont traité le relâcher : aucun geste
 * n'est gêné, et un même réglage glissé deux fois fait deux pas d'annulation.
 */
@Composable
internal fun Modifier.closesGestureOnLift(onLift: () -> Unit): Modifier {
    val lift by rememberUpdatedState(onLift)
    return pointerInput(Unit) {
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Final)
            do {
                val event = awaitPointerEvent(PointerEventPass.Final)
            } while (event.changes.any { it.pressed })
            lift()
        }
    }
}
