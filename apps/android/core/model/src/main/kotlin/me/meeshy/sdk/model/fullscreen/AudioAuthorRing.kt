package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ServedProfileDecorItem

/**
 * **Quel contour de profil porte la page d'un vocal** : celui que la page a reçu avec son auteur, sinon celui que le fil a
 * déjà servi pour ce MÊME auteur (un vocal cité n'embarque que le nom ; la bulle voisine du même auteur porte son contour).
 * Jamais celui d'un autre, jamais un contour fabriqué.
 */
public object AudioAuthorRing {

    public fun elect(
        authorUserId: String?,
        served: ServedProfileDecorItem?,
        known: Map<String, ServedProfileDecorItem>,
    ): ServedProfileDecorItem? {
        if (served != null) return served
        val id = authorUserId?.takeIf { it.isNotBlank() } ?: return null
        return known[id]
    }
}
