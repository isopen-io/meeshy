package me.meeshy.ui.component.scene

import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.DrawScope

/**
 * L'horloge DÉDIÉE d'une scène en lecture : le moteur y publie la tête de lecture à 60-120 Hz, et seule la phase de
 * DESSIN la lit ([drawWithSceneClock]). Le parent n'est jamais recomposé par un tic — la valeur ne traverse aucune
 * lecture de composition.
 */
@Stable
public class SceneClock(initialSeconds: Double = 0.0) {

    private val state = mutableDoubleStateOf(initialSeconds)

    /** La tête de lecture. À ne lire qu'en phase de dessin ou de mise en page : une lecture en composition recompose. */
    public val seconds: Double get() = state.doubleValue

    public fun publish(seconds: Double) {
        if (seconds.isFinite() && seconds >= 0.0) state.doubleValue = seconds
    }

    public fun reset() {
        state.doubleValue = 0.0
    }
}

/** Dessine avec la tête de lecture courante : la lecture a lieu dans le bloc de dessin, donc sans recomposition. */
public fun Modifier.drawWithSceneClock(clock: SceneClock, onDraw: DrawScope.(seconds: Double) -> Unit): Modifier =
    drawBehind { onDraw(clock.seconds) }
