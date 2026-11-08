package me.meeshy.sdk.model

/**
 * **LES RÉPONSES D'UN FIL, PAR PAGES DE [PAGE_SIZE]** (« Voir plus de réponses »). Le curseur est l'identifiant de la
 * dernière réponse reçue ; une page plus courte que [PAGE_SIZE] clôt le fil. Pur et immuable : le ViewModel décide
 * QUAND appeler la passerelle, ceci dit ce que l'état devient.
 */
public data class CommentRepliesPager(
    private val byParent: Map<String, List<ApiPostComment>> = emptyMap(),
    private val exhausted: Set<String> = emptySet(),
    private val loadingMore: Set<String> = emptySet(),
) {
    public fun repliesFor(parentId: String): List<ApiPostComment> = byParent[parentId].orEmpty()

    public fun hasMore(parentId: String): Boolean = parentId in byParent && parentId !in exhausted

    public fun nextCursor(parentId: String): String? = if (hasMore(parentId)) byParent[parentId]?.lastOrNull()?.id else null

    public fun isLoadingMore(parentId: String): Boolean = parentId in loadingMore

    /** Les réponses encore cachées au regard du compte servi par la racine. */
    public fun remaining(parentId: String, totalReplyCount: Int): Int =
        (totalReplyCount - repliesFor(parentId).size).coerceAtLeast(0)

    /** `null` quand rien à charger ou déjà en vol : l'appelant saute la requête. */
    public fun beginLoadMore(parentId: String): CommentRepliesPager? =
        if (!hasMore(parentId) || isLoadingMore(parentId)) null else copy(loadingMore = loadingMore + parentId)

    public fun failedMore(parentId: String): CommentRepliesPager = copy(loadingMore = loadingMore - parentId)

    /** Range une page reçue : ajoutée sans doublon, fil clos si la page est courte. */
    public fun loaded(parentId: String, page: List<ApiPostComment>, pageSize: Int = PAGE_SIZE): CommentRepliesPager {
        val known = byParent[parentId].orEmpty()
        val knownIds = known.mapTo(HashSet()) { it.id }
        val merged = known + page.filter { it.id !in knownIds }
        return copy(
            byParent = byParent + (parentId to merged),
            exhausted = if (page.size < pageSize) exhausted + parentId else exhausted - parentId,
            loadingMore = loadingMore - parentId,
        )
    }

    public companion object {
        public const val PAGE_SIZE: Int = 20
    }
}
