package me.meeshy.sdk.socket

import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.ServedPresencePage
import me.meeshy.sdk.model.presence.combined

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
     * Les pages d'un parcours, chacune sous ses marques (#13798) : la carte les ordonne entre elles, avec le socket
     * et avec les autres parcours. Par défaut, sans carte qui ordonne, ce qu'elles servent ensemble.
     */
    fun seedSweep(pages: List<ServedPresencePage>) = seed(pages.combined())

    /**
     * Une marque NEUVE de la carte, à poser sur une page quand on la demande ([ServedPresencePage.requested]) puis
     * quand sa réponse arrive ([ServedPresencePage.receipt]) : ce que le serveur dira ensuite l'emporte sur ce
     * qu'elle masque, et ce qu'elle sert ne défait aucun masque posé après sa demande. `null` sans carte.
     */
    fun receipt(): Long? = null

    companion object {
        /** Sans carte (tests, outils) : ce qui est servi n'est semé nulle part. */
        val None: ServedPresenceSink = ServedPresenceSink { }
    }
}
