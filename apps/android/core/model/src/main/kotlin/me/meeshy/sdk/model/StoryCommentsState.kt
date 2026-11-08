package me.meeshy.sdk.model

/** Une page servie de commentaires (racines ou réponses) avec de quoi demander la suivante. */
data class StoryCommentPage(
    val comments: List<StoryComment>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/**
 * Le fil de commentaires de la story à l'écran : racines, réponses par parent, compteur et état des fils. Les
 * transitions vivent dans [StoryCommentsReducer] ; ce type ne porte que la forme.
 */
data class StoryCommentsState(
    val roots: List<StoryComment> = emptyList(),
    val replies: Map<String, List<StoryComment>> = emptyMap(),
    val count: Int = 0,
    val rootCursor: String? = null,
    val rootsHasMore: Boolean = false,
    val hasLoaded: Boolean = false,
    val thread: StoryCommentThreadState = StoryCommentThreadState(),
    val likesInFlight: Set<String> = emptySet(),
) {
    val canLoadMoreRoots: Boolean get() = rootsHasMore && !rootCursor.isNullOrBlank()

    fun repliesOf(rootId: String): List<StoryComment> = replies[rootId].orEmpty()

    fun contains(id: String): Boolean = find(id) != null

    fun find(id: String): StoryComment? =
        roots.firstOrNull { it.id == id } ?: replies.values.firstNotNullOfOrNull { rows -> rows.firstOrNull { it.id == id } }

    fun parentOf(replyId: String): String? =
        replies.entries.firstOrNull { (_, rows) -> rows.any { it.id == replyId } }?.key
}
