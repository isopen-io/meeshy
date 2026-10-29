package me.meeshy.sdk.socket

import me.meeshy.sdk.model.UserPresence

/**
 * Là où se déposent les présences qu'une charge REST a servies (la page de conversations) : la carte
 * de présence de la session les sème sans attendre `presence:snapshot`. Les couches qui synchronisent
 * ne connaissent que cette porte, pas la carte.
 */
fun interface ServedPresenceSink {
    fun seed(served: Map<String, UserPresence>)

    companion object {
        /** Sans carte (tests, outils) : ce qui est servi n'est semé nulle part. */
        val None: ServedPresenceSink = ServedPresenceSink { }
    }
}
