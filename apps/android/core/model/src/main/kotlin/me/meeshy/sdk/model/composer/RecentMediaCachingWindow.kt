package me.meeshy.sdk.model.composer

/**
 * Thumbnail prefetch window around the last cell that appeared — port of iOS
 * `RecentMediaCachingWindow`: what is about to scroll in is prepared, what left is released.
 */
object RecentMediaCachingWindow {
    data class Delta(val start: List<String>, val stop: List<String>)

    const val ROWS_BEFORE = 2
    const val ROWS_AFTER = 4

    fun ids(around: String, ids: List<String>, columns: Int): List<String> {
        val index = ids.indexOf(around)
        if (index < 0) return emptyList()
        val lower = (index - ROWS_BEFORE * columns).coerceAtLeast(0)
        val upper = (index + (ROWS_AFTER + 1) * columns).coerceAtMost(ids.size)
        return ids.subList(lower, upper)
    }

    fun delta(from: List<String>, to: List<String>): Delta {
        val before = from.toSet()
        val after = to.toSet()
        return Delta(start = to.filter { it !in before }, stop = from.filter { it !in after })
    }
}
