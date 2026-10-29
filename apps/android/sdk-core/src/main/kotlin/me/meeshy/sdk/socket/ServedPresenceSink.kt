package me.meeshy.sdk.socket

import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.ServedPresencePage

/**
 * Là où se déposent les présences qu'une charge REST a servies (la page de conversations) : la carte
 * de présence de la session les sème sans attendre `presence:snapshot`. Les couches qui synchronisent
 * ne connaissent que cette porte, pas la carte.
 */
fun interface ServedPresenceSink {
    fun seed(served: Map<String, UserPresence>)

    /** La page entière : ce qu'elle sert ET ceux qu'elle masque (par défaut, seulement ce qu'elle sert). */
    fun seed(page: ServedPresencePage) = seed(page.served)

    /**
     * La marque de réception à poser sur une page dont la réponse vient d'arriver ([ServedPresencePage.receipt]) :
     * ce que le socket dira ensuite l'emporte sur ce qu'elle masque, rien de ce qu'il a dit avant. `null` sans carte.
     */
    fun receipt(): Long? = null

    companion object {
        /** Sans carte (tests, outils) : ce qui est servi n'est semé nulle part. */
        val None: ServedPresenceSink = ServedPresenceSink { }
    }
}
