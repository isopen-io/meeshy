package me.meeshy.sdk.model.sync

/**
 * Plan pur du chargement de la liste de conversations page après page — miroir de
 * `ConversationSyncEngine+Chargement.swift` (`fullSyncForOwner`, `fetchPageWithRetry`) : la page 1
 * sert tout de suite, les suivantes partent en parallèle (4 au plus) avec un réessai par page, les
 * pages perdues sont récupérées une à une, et la boucle de queue est bornée à 50 itérations.
 */
object PageFetchPlan {
    const val PAGE_SIZE: Int = 100
    const val MAX_PARALLEL: Int = 4
    const val MAX_ATTEMPTS: Int = 3
    const val MAX_TAIL_ITERATIONS: Int = 50

    /** Plafond dur de pages d'un balayage (10 000 conversations à 100 par page). */
    const val MAX_PAGES: Int = 100

    /**
     * Les indices des pages restantes (la page 0 est déjà servie) quand le total est annoncé. Le
     * pas est le nombre de lignes RÉELLEMENT rendues par la page 1 : le serveur peut plafonner sa
     * page sous la taille demandée, et les décalages doivent suivre ses vraies frontières.
     */
    fun remainingPageIndices(total: Int?, firstPageCount: Int, maxPages: Int = MAX_PAGES): List<Int> {
        if (total == null || total <= firstPageCount) return emptyList()
        val stride = stride(firstPageCount)
        val totalPages = minOf((total + stride - 1) / stride, maxPages)
        return (1 until totalPages).toList()
    }

    fun stride(firstPageCount: Int): Int = maxOf(firstPageCount, 1)

    fun offsetOf(pageIndex: Int, stride: Int): Int = pageIndex * stride

    /** Attente avant le réessai qui suit la tentative [attempt] (0 puis 1) : 1 s, 2 s. */
    fun retryDelayMillis(attempt: Int): Long = 1_000L shl attempt

    fun shouldRetry(attempt: Int): Boolean = attempt < MAX_ATTEMPTS - 1

    /** Les pages planifiées qu'aucune réponse n'a livrées, dans l'ordre. */
    fun droppedPages(planned: List<Int>, fetched: Set<Int>): List<Int> = planned.filterNot { it in fetched }

    /** L'état de la boucle de queue séquentielle. */
    data class Tail(val offset: Int, val hasMore: Boolean, val iterations: Int = 0) {
        val canContinue: Boolean get() = hasMore && iterations < MAX_TAIL_ITERATIONS
        val hitCeiling: Boolean get() = hasMore && iterations >= MAX_TAIL_ITERATIONS
    }

    /**
     * Fait avancer la queue d'une page. [backendHasMore] est la parole du serveur ; sans elle, une
     * page pleine laisse supposer une suite. Une page vide ou sans aucune ligne nouvelle arrête la
     * boucle : zéro progrès (le serveur rejoue la même fenêtre).
     */
    fun advance(tail: Tail, returned: Int, newItems: Int, backendHasMore: Boolean?, pageSize: Int = PAGE_SIZE): Tail {
        val more = backendHasMore ?: (returned >= pageSize)
        val stalled = returned == 0 || newItems == 0
        return Tail(offset = tail.offset + returned, hasMore = more && !stalled, iterations = tail.iterations + 1)
    }
}
