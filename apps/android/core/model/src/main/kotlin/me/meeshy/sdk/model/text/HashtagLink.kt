package me.meeshy.sdk.model.text

/**
 * Le lien d'un `#tag` rendu dans un texte : `https://meeshy.me/hashtag/<tag>`
 * (voir `MessageTextParser`). Un toucher sur ce lien ouvre la liste des résultats
 * du hashtag, comme iOS (`Route.hashtagResults`), au lieu de sortir vers le navigateur.
 */
object HashtagLink {
    private const val PREFIX = "https://meeshy.me/hashtag/"

    /** Le tag minuscule d'un lien de hashtag, ou `null` si [url] n'en est pas un. */
    fun tagFrom(url: String): String? =
        url.takeIf { it.startsWith(PREFIX) }
            ?.removePrefix(PREFIX)
            ?.substringBefore('?')
            ?.substringBefore('#')
            ?.trim('/')
            ?.takeIf { it.isNotEmpty() && '/' !in it }
            ?.lowercase()
}
