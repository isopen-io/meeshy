package me.meeshy.sdk.model

/** Ce que le bouton d'un fil affiche : « Masquer » quand il est déplié, « Voir N réponses de plus » sinon. */
sealed interface StoryCommentToggle {
    data object Hide : StoryCommentToggle
    data class SeeMore(val remaining: Int) : StoryCommentToggle
}

/**
 * L'état des fils sous les commentaires racines d'une story — iso `StoryCommentThread` iOS : l'aperçu automatique des
 * deux premières réponses, le bouton « Voir N autres réponses » / « Masquer » et « Voir plus de réponses » en bas d'un
 * fil déplié (endpoint replies paginé à [REPLIES_PAGE_SIZE]). Pure : le ViewModel décide QUAND appeler le réseau.
 */
data class StoryCommentThreadState(
    val expanded: Set<String> = emptySet(),
    val loading: Set<String> = emptySet(),
    val loaded: Set<String> = emptySet(),
    val repliesCursor: Map<String, String?> = emptyMap(),
    val repliesHasMore: Map<String, Boolean> = emptyMap(),
) {
    fun isExpanded(rootId: String): Boolean = rootId in expanded

    fun isLoading(rootId: String): Boolean = rootId in loading

    fun hasMoreReplies(rootId: String): Boolean = repliesHasMore[rootId] == true && !repliesCursor[rootId].isNullOrBlank()

    /** Les réponses visibles sous [root] : l'aperçu tant que le fil est replié, tout le chargé une fois déplié. */
    fun visibleReplies(root: StoryComment, replies: List<StoryComment>): List<StoryComment> =
        if (isExpanded(root.id)) replies else replies.take(PREVIEW_SIZE)

    /** `null` tant que le fil tient dans l'aperçu : aucun bouton. */
    fun toggle(root: StoryComment): StoryCommentToggle? = when {
        root.replyCount <= PREVIEW_SIZE -> null
        isExpanded(root.id) -> StoryCommentToggle.Hide
        else -> StoryCommentToggle.SeeMore(remaining = root.replyCount - PREVIEW_SIZE)
    }

    /** Les réponses à demander à la bascule : jamais deux chargements d'un même fil en vol. */
    fun toggled(rootId: String): StoryCommentThreadState =
        if (isExpanded(rootId)) copy(expanded = expanded - rootId) else copy(expanded = expanded + rootId)

    fun expandedThread(rootId: String): StoryCommentThreadState =
        if (isExpanded(rootId)) this else copy(expanded = expanded + rootId)

    /** `null` quand un chargement de ce fil est déjà en vol (anti double-tap). */
    fun beginLoad(rootId: String): StoryCommentThreadState? =
        if (rootId in loading) null else copy(loading = loading + rootId)

    /** Une page de réponses est arrivée : le curseur n'avance que si le fil n'a pas déjà été plus loin. */
    fun pageLoaded(rootId: String, nextCursor: String?, hasMore: Boolean, firstPage: Boolean): StoryCommentThreadState {
        val keepAhead = firstPage && rootId in loaded && hasMoreReplies(rootId)
        return copy(
            loading = loading - rootId,
            loaded = loaded + rootId,
            repliesCursor = if (keepAhead) repliesCursor else repliesCursor + (rootId to nextCursor),
            repliesHasMore = if (keepAhead) repliesHasMore else repliesHasMore + (rootId to (hasMore && !nextCursor.isNullOrBlank())),
        )
    }

    fun loadFailed(rootId: String): StoryCommentThreadState = copy(loading = loading - rootId)

    fun purged(rootId: String): StoryCommentThreadState =
        copy(
            expanded = expanded - rootId,
            loading = loading - rootId,
            loaded = loaded - rootId,
            repliesCursor = repliesCursor - rootId,
            repliesHasMore = repliesHasMore - rootId,
        )

    companion object {
        const val PREVIEW_SIZE: Int = 2
        const val REPLIES_PAGE_SIZE: Int = 20
        const val ROOTS_PAGE_SIZE: Int = 50
    }
}
