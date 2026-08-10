package me.meeshy.sdk.model.search

/**
 * Transitions PURES de l'historique des recherches recentes de la recherche
 * globale — parite iOS `GlobalSearchViewModel.addToRecentSearches`
 * (UserDefaults `globalSearch.recentSearches`) : max 10, dedoublonnage
 * insensible a la casse, insertion en tete, la nouvelle graphie gagne.
 */
public object RecentSearches {

    public const val MAX: Int = 10

    public fun add(current: List<String>, query: String): List<String> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return current
        val without = current.filterNot { it.equals(trimmed, ignoreCase = true) }
        return (listOf(trimmed) + without).take(MAX)
    }

    public fun remove(current: List<String>, query: String): List<String> =
        current.filterNot { it.equals(query.trim(), ignoreCase = true) }
}
