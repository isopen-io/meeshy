package me.meeshy.sdk.model

/** Ce que « Réessayer » reprend : la première page si aucune n'est encore venue, sinon la même page suivante. */
enum class ShareLinkArrivalsRetry { FirstPage, NextPage }

/**
 * La liste COMPLÈTE des arrivées d'un lien, au-delà des récentes — miroir de `ShareLinkArrivalsListViewModel` (iOS).
 *
 * Cache-first : la liste se peint des arrivées récentes que la fiche a déjà en main (la graine), puis la
 * première page serveur les remplace. La suite se charge page par page près de la fin, sans jamais montrer
 * deux fois la même ligne. Un échec de page suivante ne retire rien. Chaque rechargement de la première
 * page ouvre une génération : une page suivante demandée avant lui n'entre pas dans la liste neuve.
 */
data class ShareLinkArrivalsListState(
    val totalCount: Int = 0,
    val arrivals: List<ShareLinkArrivalEntry> = emptyList(),
    val isLoadingFirstPage: Boolean = false,
    val isLoadingNextPage: Boolean = false,
    val firstPageFailed: Boolean = false,
    val nextPageFailed: Boolean = false,
    val hasLoadedServerPage: Boolean = false,
    val nextCursor: String? = null,
    val generation: Int = 0,
) {
    val hasMore: Boolean get() = hasLoadedServerPage && nextCursor != null
    val showsSkeleton: Boolean get() = arrivals.isEmpty() && isLoadingFirstPage
    val showsEmpty: Boolean get() = arrivals.isEmpty() && hasLoadedServerPage && !isLoadingFirstPage
    val showsFullError: Boolean get() = arrivals.isEmpty() && firstPageFailed && !isLoadingFirstPage

    /** Une erreur qui ne cache rien : la liste reste, le pied propose de réessayer. */
    val showsFooterError: Boolean
        get() = arrivals.isNotEmpty() && (nextPageFailed || (firstPageFailed && !hasLoadedServerPage))

    val retryTarget: ShareLinkArrivalsRetry
        get() = if (hasLoadedServerPage) ShareLinkArrivalsRetry.NextPage else ShareLinkArrivalsRetry.FirstPage

    val canRequestFirstPage: Boolean get() = !isLoadingFirstPage
    val canRequestNextPage: Boolean get() = hasMore && !isLoadingNextPage && !isLoadingFirstPage

    /** Les récentes de la fiche, arrivées APRÈS l'ouverture : elles ne remplacent jamais une page serveur ni une liste déjà peinte. */
    fun withSeed(total: Int, seed: List<ShareLinkArrivalEntry>): ShareLinkArrivalsListState =
        if (hasLoadedServerPage || arrivals.isNotEmpty()) this else copy(totalCount = total, arrivals = unique(seed))

    fun firstPageRequested(): ShareLinkArrivalsListState =
        copy(generation = generation + 1, isLoadingFirstPage = true, firstPageFailed = false, isLoadingNextPage = false)

    fun firstPageLoaded(requestedGeneration: Int, page: ShareLinkArrivalsPage): ShareLinkArrivalsListState {
        if (requestedGeneration != generation) return this
        return copy(
            arrivals = unique(page.arrivals),
            nextCursor = page.cursorOrNull,
            nextPageFailed = false,
            hasLoadedServerPage = true,
            isLoadingFirstPage = false,
        )
    }

    fun firstPageFailedAt(requestedGeneration: Int): ShareLinkArrivalsListState {
        if (requestedGeneration != generation) return this
        return copy(firstPageFailed = true, isLoadingFirstPage = false)
    }

    fun nextPageRequested(): ShareLinkArrivalsListState =
        if (canRequestNextPage) copy(isLoadingNextPage = true, nextPageFailed = false) else this

    fun nextPageLoaded(requestedGeneration: Int, page: ShareLinkArrivalsPage): ShareLinkArrivalsListState {
        if (requestedGeneration != generation) return this
        val known = arrivals.mapTo(HashSet()) { it.key }
        return copy(
            arrivals = arrivals + unique(page.arrivals).filter { it.key !in known },
            nextCursor = page.cursorOrNull,
            isLoadingNextPage = false,
        )
    }

    fun nextPageFailedAt(requestedGeneration: Int): ShareLinkArrivalsListState {
        if (requestedGeneration != generation) return this
        return copy(nextPageFailed = true, isLoadingNextPage = false)
    }

    /** Appelé quand une ligne apparaît : près de la fin, la suite se demande. */
    fun shouldPrefetchAt(index: Int): Boolean =
        hasMore && !nextPageFailed && !isLoadingNextPage && !isLoadingFirstPage &&
            index >= arrivals.size - PREFETCH_DISTANCE

    companion object {
        const val PAGE_SIZE = 30

        /** À combien de lignes de la fin la page suivante se demande. */
        const val PREFETCH_DISTANCE = 5

        fun seeded(total: Int, seed: List<ShareLinkArrivalEntry>): ShareLinkArrivalsListState =
            ShareLinkArrivalsListState(totalCount = total, arrivals = unique(seed))

        private fun unique(entries: List<ShareLinkArrivalEntry>): List<ShareLinkArrivalEntry> =
            entries.distinctBy { it.key }
    }
}
