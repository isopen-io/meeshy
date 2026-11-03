package me.meeshy.sdk.model

/**
 * Chasse paginée BORNÉE d'un commentaire ciblé par une notification — iso `CommentTargetHunter` iOS. On suit le curseur
 * existant page après page jusqu'à ce que la cible soit chargée (liste contiguë, « Charger plus » et cache restent
 * cohérents), au plus [DEFAULT_MAX_PAGES] pages pour ne pas aspirer un fil viral entier.
 */
object CommentTargetHunter {
    const val DEFAULT_MAX_PAGES: Int = 15

    /** `true` si la cible est présente à l'issue de la chasse. [loadNextPage] doit faire progresser le curseur. */
    suspend fun hunt(
        maxPages: Int = DEFAULT_MAX_PAGES,
        isPresent: () -> Boolean,
        hasMore: () -> Boolean,
        loadNextPage: suspend () -> Unit,
    ): Boolean {
        var pages = 0
        while (!isPresent() && hasMore() && pages < maxPages) {
            loadNextPage()
            pages += 1
        }
        return isPresent()
    }
}
