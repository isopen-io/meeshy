package me.meeshy.sdk.model.composer.timeline

/**
 * **L'horloge de lecture de la frise** (#14293) : la tête vaut l'origine de la lecture plus le temps ÉCOULÉ depuis, lu en
 * temps absolu. Jamais un pas ajouté à chaque image à la tête que l'hôte rend : l'hôte ne recompose pas à chaque image, sa
 * tête a du retard, et chaque pas perdu ralentissait la lecture (mi-vitesse sur le S8). Un scrub de l'auteur réancre.
 */
data class FrisePlayClock(val originHead: Float, val originNanos: Long) {

    fun headAt(nanos: Long, duration: Float): Float =
        FriseViewport.advanced(originHead, (nanos - originNanos) / NANOS_PER_SECOND, duration)

    private companion object {
        const val NANOS_PER_SECOND = 1_000_000_000f
    }
}
