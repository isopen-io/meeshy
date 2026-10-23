package me.meeshy.app.conversations

import me.meeshy.sdk.model.search.SearchLoadState

/** Ce que l'ecran de recherche globale rend sous les onglets — une projection de [GlobalSearchUiState]. */
enum class GlobalSearchContent { RECENTS, INITIAL, SEARCHING, OFFLINE, ERROR, NO_RESULTS, RESULTS }

/**
 * Projection unique etat -> ecran (parite iOS `resultsList` / `emptyTabStateView`) :
 * des resultats affiches ne sont jamais remplaces par un etat ; hors ligne et erreur ne
 * prennent l'ecran que lorsque l'onglet courant est vide, et un volet en panne n'est jamais
 * un « aucun resultat ».
 */
fun GlobalSearchUiState.screenContent(): GlobalSearchContent = when {
    isSearching -> GlobalSearchContent.SEARCHING
    !hasSearched -> if (recentSearches.isNotEmpty()) GlobalSearchContent.RECENTS else GlobalSearchContent.INITIAL
    countFor(selectedTab) > 0 -> GlobalSearchContent.RESULTS
    loadState == SearchLoadState.OFFLINE -> GlobalSearchContent.OFFLINE
    loadState == SearchLoadState.ERROR || failure != null || isFailed(selectedTab) -> GlobalSearchContent.ERROR
    else -> GlobalSearchContent.NO_RESULTS
}

/** Bandeau discret au-dessus d'une liste gardee : hors ligne ou volet(s) tombe(s). */
val GlobalSearchUiState.showsPartialBanner: Boolean
    get() = loadState == SearchLoadState.OFFLINE || failure != null
