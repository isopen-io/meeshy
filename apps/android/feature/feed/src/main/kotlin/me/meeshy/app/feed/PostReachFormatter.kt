package me.meeshy.app.feed

import java.util.Locale
import me.meeshy.sdk.model.format.CompactCountFormat

/**
 * Pure formatter for the author "reach line" (`@pseudo · views · impressions`) on the post
 * detail screen — port of iOS `PostReachFormatter`. Stats are author-only: a reader who is
 * not the post's author never sees view/impression counts, only the `@pseudo`.
 */
object PostReachFormatter {

    /** Compact count in the reader locale, through the single [CompactCountFormat]. */
    fun compact(value: Int, locale: Locale = Locale.getDefault()): String = CompactCountFormat.text(value, locale)

    data class Components(
        val pseudo: String?,
        val views: String?,
        val impressions: String?,
        /** Personnes distinctes (`uniqueViewCount`), pour l'auteur seul ; `null` quand le serveur ne la sert pas. */
        val uniqueViews: String? = null,
    )

    fun components(
        username: String?,
        isAuthor: Boolean,
        viewCount: Int,
        impressionCount: Int,
        uniqueViewCount: Int? = null,
        locale: Locale = Locale.getDefault(),
    ): Components {
        val pseudo = username?.takeIf { it.isNotEmpty() }?.let { "@$it" }
        if (!isAuthor) return Components(pseudo = pseudo, views = null, impressions = null)
        return Components(
            pseudo = pseudo,
            views = compact(viewCount, locale),
            impressions = compact(impressionCount, locale),
            uniqueViews = uniqueViewCount?.takeIf { it > 0 }?.let { compact(it, locale) },
        )
    }
}
