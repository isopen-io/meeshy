package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import kotlin.math.abs

/**
 * **L'horloge que SEULE la barre de progression lit** (iOS `StoryPlaybackProgressClock`, #9859).
 *
 * Le lecteur la tient par référence et ne la lit pas : publier une fraction n'invalide que le dessin de la barre, jamais
 * la composition de l'écran. La barre fait au plus ~300 px : un écart plus fin ne déplace aucun pixel, il n'est pas publié.
 */
internal class StoryPlaybackProgressClock {
    var fraction by mutableFloatStateOf(0f)
        private set

    /** Une fraction reçue du compte à rebours ; ne publie que ce qui se voit. */
    fun publish(raw: Double) {
        committedFraction(raw, fraction)?.let { fraction = it }
    }

    /** Début de story, changement de story, boucle : la barre repart de zéro. */
    fun reset() = publish(0.0)

    companion object {
        /** Un trois-centième de la largeur de la barre. */
        const val GRANULARITY: Float = 1f / 300f

        /**
         * La règle de publication, pure : la fraction à publier, ou `null` quand le changement est invisible. Zéro et la fin
         * se publient toujours — un départ ou une boucle ne laisse jamais la barre pleine, la fin ne s'arrête jamais à un
         * cheveu du bord.
         */
        fun committedFraction(raw: Double, current: Float): Float? {
            val clamped = if (raw.isFinite()) raw.coerceIn(0.0, 1.0).toFloat() else 0f
            if (clamped == current) return null
            if (clamped == 0f || clamped >= 1f) return clamped
            return if (abs(clamped - current) >= GRANULARITY) clamped else null
        }
    }
}
