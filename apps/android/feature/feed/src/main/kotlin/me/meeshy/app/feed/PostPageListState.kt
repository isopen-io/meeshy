package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiPost

/**
 * Pure, immutable accumulation state for any cursor-paginated post list (the saved-posts
 * feed, a user-profile posts feed, …) — the SSOT of the list inside its ViewModel. Lifts
 * the `posts` / `nextCursor` / `hasMore` trio into a testable value type so the pagination
 * and optimistic-removal laws stay unit-covered independently of any one screen.
 *
 * The first page is fetched with a `null` cursor; each fetched page is [appended]
 * (de-duplicating by post id so a page that re-includes a boundary post never doubles
 * it), advancing [cursor]/[hasMore] to the gateway's pagination meta. An optimistic
 * removal [removed]s a post instantly; a rollback simply restores a prior snapshot.
 */
@Immutable
data class PostPageListState(
    val posts: List<ApiPost> = emptyList(),
    val cursor: String? = null,
    val hasMore: Boolean = true,
    val hasLoaded: Boolean = false,
) {
    /**
     * Whether an additional page can be fetched: the gateway still reports [hasMore]
     * **and** it handed back a [cursor] to fetch from. Both are required — a `hasMore`
     * with no cursor (a malformed tail) must not spin an unbounded fetch loop.
     */
    val canLoadMore: Boolean get() = hasMore && cursor != null

    /**
     * Fold a freshly-fetched [page] onto the list: append only the posts whose id is
     * not already present (order preserved: existing first, then new arrivals), and
     * advance the pagination watermark to [nextCursor]/[hasMore]. Always marks the
     * list [hasLoaded] — even an empty page proves the network has answered, so the
     * cold-start skeleton must stand down.
     */
    fun appended(page: List<ApiPost>, nextCursor: String?, hasMore: Boolean): PostPageListState {
        val existing = posts.mapTo(HashSet(posts.size)) { it.id }
        val fresh = page.filter { it.id !in existing }
        return copy(
            posts = posts + fresh,
            cursor = nextCursor,
            hasMore = hasMore,
            hasLoaded = true,
        )
    }

    /**
     * Drop the post with [postId] (optimistic removal). Inert — returns the same
     * instance — when no post carries that id, so a stray removal never churns state.
     */
    fun removed(postId: String): PostPageListState =
        if (posts.none { it.id == postId }) this
        else copy(posts = posts.filterNot { it.id == postId })

    /**
     * Pose l'état « aimé » de [postId] et ajuste son total d'un cran (jamais sous zéro) —
     * le geste optimiste ; un retour arrière rejoue l'instantané précédent. Inerte (même
     * instance) si le post est absent ou déjà dans cet état.
     */
    fun liked(postId: String, liked: Boolean): PostPageListState {
        val target = posts.firstOrNull { it.id == postId } ?: return this
        if ((target.isLikedByMe == true) == liked) return this
        val count = ((target.likeCount ?: 0) + if (liked) 1 else -1).coerceAtLeast(0)
        return copy(posts = posts.map { if (it.id == postId) it.copy(isLikedByMe = liked, likeCount = count) else it })
    }

    /** Jumeau de [liked] pour l'enregistrement du post (`isBookmarkedByMe`, `bookmarkCount`). */
    fun bookmarked(postId: String, bookmarked: Boolean): PostPageListState {
        val target = posts.firstOrNull { it.id == postId } ?: return this
        if ((target.isBookmarkedByMe == true) == bookmarked) return this
        val count = ((target.bookmarkCount ?: 0) + if (bookmarked) 1 else -1).coerceAtLeast(0)
        return copy(
            posts = posts.map { if (it.id == postId) it.copy(isBookmarkedByMe = bookmarked, bookmarkCount = count) else it },
        )
    }

    companion object {
        val Empty = PostPageListState()
    }
}

/** Fold a fetched [PostPage] onto the list — the one adapter every paginated post VM uses. */
internal fun PostPageListState.foldPage(page: me.meeshy.sdk.post.PostPage): PostPageListState =
    appended(page.posts, page.nextCursor, page.hasMore)
