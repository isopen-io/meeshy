package me.meeshy.app.feed

/**
 * The saved-posts (bookmarked) feed list is just a cursor-paginated post list — it shares
 * the one accumulation law in [PostPageListState] (append-dedup + watermark + optimistic
 * removal). Kept as an alias so `BookmarksViewModel` reads intention-revealingly.
 */
typealias BookmarksListState = PostPageListState
