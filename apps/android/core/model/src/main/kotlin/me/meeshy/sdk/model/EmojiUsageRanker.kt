package me.meeshy.sdk.model

/**
 * Deterministic usage-based ordering for the quick-reaction strip — port of
 * `EmojiUsageTracker.topEmojis` / `sortedEmojis` (MessageOverlayMenu.swift).
 *
 * `Map` has no specified iteration order, so a naive `sortedByDescending { value }`
 * would let equal-score emojis reshuffle on every recomposition. We sort by an
 * explicit total order — usage count desc, then the emoji's canonical rank in
 * [defaults] (unknowns last), then the emoji string — so the strip's order stays
 * fixed across renders for a given usage table.
 */
object EmojiUsageRanker {

    /** The recent-emoji history keeps the twenty latest (iOS `RecentEmojiHistory.capacity`). */
    const val HISTORY_CAPACITY: Int = 20

    /**
     * The [count] most-used emojis, padded with [defaults] to fill the strip.
     * Tracked emojis come first (usage desc, canonical-rank asc, emoji asc),
     * then any remaining defaults in their canonical order, de-duplicated.
     */
    fun topEmojis(
        usage: Map<String, Int>,
        defaults: List<String>,
        count: Int,
    ): List<String> {
        if (count <= 0) return emptyList()
        val canonicalRank = defaults.withIndex().associate { (index, emoji) -> emoji to index }
        fun rank(emoji: String): Int = canonicalRank[emoji] ?: Int.MAX_VALUE

        val trackedSorted = usage.keys.sortedWith(
            compareByDescending<String> { usage[it] ?: 0 }
                .thenBy { rank(it) }
                .thenBy { it },
        )

        val result = LinkedHashSet<String>()
        for (emoji in trackedSorted) {
            if (result.size >= count) break
            result.add(emoji)
        }
        for (emoji in defaults) {
            if (result.size >= count) break
            result.add(emoji)
        }
        return result.toList()
    }

    /**
     * Reorders [emojis] by descending usage, preserving the original order as a
     * stable tie-break. When no usage is recorded the input order is returned
     * unchanged (mirrors iOS `sortedEmojis(from:)`).
     */
    fun sortedByUsage(emojis: List<String>, usage: Map<String, Int>): List<String> {
        if (usage.isEmpty()) return emojis
        val originalRank = emojis.withIndex().associate { (index, emoji) -> emoji to index }
        return emojis.sortedWith(
            compareByDescending<String> { usage[it] ?: 0 }
                .thenBy { originalRank[it] ?: Int.MAX_VALUE },
        )
    }

    /** Records one use of [emoji], returning the updated usage table. */
    fun record(usage: Map<String, Int>, emoji: String): Map<String, Int> =
        usage + (emoji to ((usage[emoji] ?: 0) + 1))

    /**
     * Folds [emojis], given in the order they were used (the last is the most recent),
     * into [history] (most recent first): a re-used emoji jumps to the front without a
     * duplicate, and only the [HISTORY_CAPACITY] latest survive.
     */
    fun recordRecent(history: List<String>, emojis: List<String>): List<String> {
        if (emojis.isEmpty()) return history
        val fresh = emojis.asReversed().distinct()
        return (fresh + history.filterNot { it in fresh }).take(HISTORY_CAPACITY)
    }

    fun recordRecent(history: List<String>, emoji: String): List<String> =
        recordRecent(history, listOf(emoji))
}
