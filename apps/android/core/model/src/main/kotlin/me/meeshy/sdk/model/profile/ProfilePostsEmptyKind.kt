package me.meeshy.sdk.model.profile

/**
 * Le vide à dire dans l'onglet Postes (miroir de `emptyState` / `filteredEmptyState` d'iOS) :
 * [NO_PUBLICATION] quand la personne n'a rien publié, [NO_REELS] / [NO_POSTS] quand des publications
 * existent mais aucune ne passe le filtre actif — muet tant qu'une page reste à venir (la fin de liste
 * porte déjà l'indicateur de chargement).
 */
enum class ProfilePostsEmptyKind {
    NONE,
    NO_PUBLICATION,
    NO_REELS,
    NO_POSTS;

    companion object {
        fun of(filter: ProfilePostsFilter, loadedCount: Int, filteredCount: Int, hasMore: Boolean, isLoading: Boolean): ProfilePostsEmptyKind = when {
            isLoading -> NONE
            loadedCount == 0 -> if (hasMore) NONE else NO_PUBLICATION
            filteredCount > 0 || hasMore -> NONE
            filter == ProfilePostsFilter.REELS -> NO_REELS
            filter == ProfilePostsFilter.POSTS -> NO_POSTS
            else -> NONE
        }
    }
}
