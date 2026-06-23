package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryViewer

/**
 * Pure ordering rule for the story-viewers sheet — a product UX decision, not an
 * SDK atom, so it lives in `:feature:stories`.
 *
 * iOS renders viewers in raw gateway order; Android does better: most-recent view
 * first ([viewedAt] descending, ISO-8601 strings sort chronologically), viewers
 * whose timestamp the gateway omitted sink to the bottom, and a viewer id that
 * appears twice (defensive — the gateway shouldn't repeat) collapses to its single
 * most-recent row.
 */
object StoryViewersPresentation {
    fun order(viewers: List<StoryViewer>): List<StoryViewer> =
        viewers
            .sortedWith(
                compareByDescending<StoryViewer> { it.viewedAt != null }
                    .thenByDescending { it.viewedAt.orEmpty() },
            )
            .distinctBy { it.id }
}
