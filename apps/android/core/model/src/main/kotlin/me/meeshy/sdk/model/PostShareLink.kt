package me.meeshy.sdk.model

import me.meeshy.sdk.model.text.LinkDisplayLaw

/** Le lien à remettre à la feuille de partage : [tracked] vaut `true` pour le lien court suivi. */
data class PostShareLink(val url: String, val tracked: Boolean)

/** Le repli d'un partage de post — l'URL brute, jamais « rien à partager ». */
object PostShareLinkLaw {
    /** `https://meeshy.me/feeds/post/{id}` : la page web du post, sans attribution. */
    fun rawUrl(postId: String, origin: String = LinkDisplayLaw.DEFAULT_WEB_ORIGIN): String =
        "${origin.trimEnd('/')}/feeds/post/$postId"

    /** Le lien suivi quand la passerelle en a frappé un lisible, sinon l'URL brute. */
    fun resolve(postId: String, shortUrl: String?): PostShareLink {
        val minted = shortUrl?.trim()?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
        return if (minted != null) PostShareLink(minted, tracked = true) else PostShareLink(rawUrl(postId), tracked = false)
    }
}
