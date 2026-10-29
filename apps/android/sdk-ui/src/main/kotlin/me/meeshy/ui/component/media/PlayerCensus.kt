package me.meeshy.ui.component.media

import androidx.annotation.VisibleForTesting
import java.util.concurrent.atomic.AtomicInteger

/**
 * Combien de lecteurs ExoPlayer les surfaces vidéo et audio des scènes ont instanciés (#13663). Un compteur, rien d'autre :
 * il rend mesurable le coût d'un fil — une scène au repos doit en créer zéro, seule la scène élue prépare les siens.
 */
object PlayerCensus {

    private val born = AtomicInteger(0)

    val created: Int get() = born.get()

    internal fun record() {
        born.incrementAndGet()
    }

    @VisibleForTesting
    fun reset() {
        born.set(0)
    }
}
