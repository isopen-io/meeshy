package me.meeshy.sdk.model.profile

/**
 * La fenêtre de rendu de l'onglet Postes (miroir de `renderWindow` de `ProfileUserPostsViewModel` iOS) :
 * la liste n'ajoute au défilement de la fiche que [size] cartes à la fois, et grandit par pas de
 * [STEP] quand une carte à [PREFETCH_DISTANCE] ou moins de la fin paraît — AVANT de demander la page réseau
 * suivante. [revealScheduled] coalesce les déclencheurs d'un même instant (les trois dernières cartes
 * ne font pas bondir la fenêtre de trois pas).
 */
data class ProfilePostsRenderWindow(
    val size: Int = INITIAL,
    val revealScheduled: Boolean = false,
) {
    fun visibleCount(filteredCount: Int): Int = minOf(size, filteredCount)

    fun hasMoreToRender(filteredCount: Int): Boolean = size < filteredCount

    /** La carte [index] est-elle à [PREFETCH_DISTANCE] ou moins de la fin des [visibleCount] cartes rendues ? */
    fun isNearTail(index: Int, visibleCount: Int): Boolean = index >= visibleCount - PREFETCH_DISTANCE

    /** Arme la révélation, ou `null` si une est déjà programmée (coalescence). */
    fun schedulingReveal(): ProfilePostsRenderWindow? = if (revealScheduled) null else copy(revealScheduled = true)

    fun revealSettled(): ProfilePostsRenderWindow = copy(revealScheduled = false)

    fun grown(filteredCount: Int): ProfilePostsRenderWindow = copy(size = minOf(size + STEP, maxOf(filteredCount, size)))

    /** Un changement de filtre repart de la taille initiale : jamais tous les réels connus d'un coup. */
    fun reset(): ProfilePostsRenderWindow = ProfilePostsRenderWindow()

    companion object {
        const val INITIAL: Int = 5
        const val STEP: Int = 5
        const val PREFETCH_DISTANCE: Int = 3
    }
}
