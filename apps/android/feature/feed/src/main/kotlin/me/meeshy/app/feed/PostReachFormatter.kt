package me.meeshy.app.feed

/**
 * Pure formatter for the author "reach line" (`@pseudo · views · impressions`) on the post
 * detail screen — port of iOS `PostReachFormatter`. Stats are author-only: a reader who is
 * not the post's author never sees view/impression counts, only the `@pseudo`.
 */
object PostReachFormatter {

    /** Compact count: 1.2k / 3.4M. */
    fun compact(value: Int): String = when {
        value >= 1_000_000 -> "%.1fM".format(value / 1_000_000.0)
        value >= 1_000 -> "%.1fk".format(value / 1_000.0)
        else -> value.toString()
    }

    data class Components(
        val pseudo: String?,
        val views: String?,
        val impressions: String?,
    )

    fun components(username: String?, isAuthor: Boolean, viewCount: Int, impressionCount: Int): Components {
        val pseudo = username?.takeIf { it.isNotEmpty() }?.let { "@$it" }
        if (!isAuthor) return Components(pseudo = pseudo, views = null, impressions = null)
        return Components(pseudo = pseudo, views = compact(viewCount), impressions = compact(impressionCount))
    }
}
