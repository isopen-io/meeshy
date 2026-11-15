package me.meeshy.app.feed

/**
 * The nearby-posts feed list is just a cursor-paginated post list — it shares the one
 * accumulation law in [PostPageListState] (append-dedup + watermark), exactly like
 * [BookmarksListState].
 */
internal typealias NearbyListState = PostPageListState
