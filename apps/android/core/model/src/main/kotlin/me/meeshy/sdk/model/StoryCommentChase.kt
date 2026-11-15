package me.meeshy.sdk.model

/** L'issue d'une chasse : la cible est chargée, absente de ce que le serveur sert, ou le réseau a manqué. */
sealed interface StoryCommentChaseOutcome {
    val state: StoryCommentsState

    data class Found(override val state: StoryCommentsState) : StoryCommentChaseOutcome
    data class NotFound(override val state: StoryCommentsState) : StoryCommentChaseOutcome
    data class Failed(override val state: StoryCommentsState) : StoryCommentChaseOutcome
}

/**
 * La chasse paginée du commentaire visé par une notification — iso `loadRootsUntilPresent` /
 * `loadRepliesUntilPresent` iOS : on charge page après page jusqu'à ce que la cible (ou son parent) soit là, bornée
 * à [MAX_PAGES] pages pour qu'une cible supprimée ne fasse pas parcourir tout le fil. La réponse ciblée déplie son
 * parent d'abord. Pure : la source des pages est injectée.
 */
object StoryCommentChase {
    const val MAX_PAGES: Int = 10

    suspend fun roots(
        start: StoryCommentsState,
        anchors: Set<String>,
        maxPages: Int = MAX_PAGES,
        fetch: suspend (cursor: String?) -> StoryCommentPage?,
    ): StoryCommentChaseOutcome {
        var state = start
        var fetched = 0
        while (true) {
            if (anchors.any { state.contains(it) }) return StoryCommentChaseOutcome.Found(state)
            if (state.hasLoaded && !state.canLoadMoreRoots) return StoryCommentChaseOutcome.NotFound(state)
            if (fetched >= maxPages) return StoryCommentChaseOutcome.NotFound(state)
            val page = fetch(state.rootCursor.takeIf { state.hasLoaded }) ?: return StoryCommentChaseOutcome.Failed(state)
            fetched++
            state = StoryCommentsReducer.rootsPage(state, page)
        }
    }

    suspend fun reply(
        start: StoryCommentsState,
        parentId: String,
        replyId: String,
        maxPages: Int = MAX_PAGES,
        fetch: suspend (cursor: String?) -> StoryCommentPage?,
    ): StoryCommentChaseOutcome {
        var state = start.copy(thread = start.thread.expandedThread(parentId))
        var fetched = 0
        while (true) {
            if (state.repliesOf(parentId).any { it.id == replyId }) return StoryCommentChaseOutcome.Found(state)
            val loaded = parentId in state.thread.loaded
            if (loaded && !state.thread.hasMoreReplies(parentId)) return StoryCommentChaseOutcome.NotFound(state)
            if (fetched >= maxPages) return StoryCommentChaseOutcome.NotFound(state)
            val cursor = state.thread.repliesCursor[parentId].takeIf { loaded }
            val page = fetch(cursor) ?: return StoryCommentChaseOutcome.Failed(state)
            fetched++
            state = StoryCommentsReducer.repliesPage(state, parentId, page, firstPage = !loaded)
        }
    }
}
