package me.meeshy.sdk.model

/**
 * The public link to a post — the single source behind "Share" and "Copy link" on a
 * feed card, a reel and the post detail, and the shape the app's deep links receive.
 *
 * Mirrors iOS `PostDetailView+ShareLink.swift` (fallback `https://meeshy.me/feeds/post/<id>`)
 * and the web's `lib/feed/share-url.ts`. The gateway's tracked links still use the legacy
 * `/post/<id>` segment, which the web serves too ([LEGACY_SEGMENT]) — both open the detail.
 */
object PostShareLink {

    const val WEB_HOST: String = "meeshy.me"
    const val WWW_HOST: String = "www.meeshy.me"
    const val CANONICAL_SEGMENT: String = "feeds/post"
    const val LEGACY_SEGMENT: String = "post"

    fun webLink(postId: String): String =
        "https://$WEB_HOST/$CANONICAL_SEGMENT/${encodePathSegment(postId)}"

    private const val UNRESERVED: String =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    private fun encodePathSegment(segment: String): String =
        buildString {
            segment.toByteArray(Charsets.UTF_8).forEach { byte ->
                val code = byte.toInt() and 0xFF
                val char = code.toChar()
                if (char in UNRESERVED) append(char) else append("%%%02X".format(code))
            }
        }
}

/** Le lien à remettre à la feuille de partage : [tracked] vaut `true` pour le lien court suivi. */
data class PostShareTarget(val url: String, val tracked: Boolean)

/** Le repli d'un partage de post — l'URL brute, jamais « rien à partager ». */
object PostShareLinkLaw {
    fun rawUrl(postId: String): String = PostShareLink.webLink(postId)

    /** Le lien suivi quand la passerelle en a frappé un lisible, sinon l'URL brute. */
    fun resolve(postId: String, shortUrl: String?): PostShareTarget {
        val minted = shortUrl?.trim()?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
        return if (minted != null) PostShareTarget(minted, tracked = true) else PostShareTarget(rawUrl(postId), tracked = false)
    }
}
