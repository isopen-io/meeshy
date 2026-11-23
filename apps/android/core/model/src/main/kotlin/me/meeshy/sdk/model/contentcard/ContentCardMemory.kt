package me.meeshy.sdk.model.contentcard

import me.meeshy.sdk.model.deeplink.ContentLinkTarget

/**
 * Ce que les cartes de contenu savent déjà, en MÉMOIRE (#19331, contrat § 2) — valeur pure, même régime que la carte
 * de conversation : fraîche 60 s, servie périmée jusqu'à 24 h, oubliée au-delà. Un « indisponible » n'est jamais servi
 * périmé : c'est un repli, pas un contenu, et le post a pu revenir dans l'audience du lecteur. Un jeton de lien suivi
 * ne change jamais de cible : sa résolution (un contenu, ou rien) se garde sans échéance. Les deux tables sont
 * bornées, la plus ancienne entrée partant la première.
 */
data class ContentCardMemory(
    private val posts: Map<String, Entry> = emptyMap(),
    private val tokens: Map<String, ContentLinkTarget.Content?> = emptyMap(),
) {
    data class Entry(val resolution: ContentCardResolution, val storedAtMillis: Long)

    sealed interface Lookup {
        data class Fresh(val resolution: ContentCardResolution) : Lookup
        data class Stale(val resolution: ContentCardResolution) : Lookup
        data object Missing : Lookup
    }

    sealed interface TokenLookup {
        /** [target] `null` : le jeton mène ailleurs qu'à un contenu. */
        data class Known(val target: ContentLinkTarget.Content?) : TokenLookup
        data object Unknown : TokenLookup
    }

    fun lookup(postId: String, nowMillis: Long): Lookup {
        val entry = posts[postId] ?: return Lookup.Missing
        val age = nowMillis - entry.storedAtMillis
        return when {
            age < FRESH_MILLIS -> Lookup.Fresh(entry.resolution)
            entry.resolution is ContentCardResolution.Unavailable -> Lookup.Missing
            age < STALE_MILLIS -> Lookup.Stale(entry.resolution)
            else -> Lookup.Missing
        }
    }

    fun storing(postId: String, resolution: ContentCardResolution, nowMillis: Long): ContentCardMemory =
        copy(posts = (posts - postId + (postId to Entry(resolution, nowMillis))).newest(MAX_POSTS))

    fun token(token: String): TokenLookup =
        if (tokens.containsKey(token)) TokenLookup.Known(tokens[token]) else TokenLookup.Unknown

    fun storingToken(token: String, target: ContentLinkTarget.Content?): ContentCardMemory =
        copy(tokens = (tokens - token + (token to target)).newest(MAX_TOKENS))

    private fun <V> Map<String, V>.newest(limit: Int): Map<String, V> =
        if (size <= limit) this else entries.drop(size - limit).associate { it.key to it.value }

    companion object {
        const val MAX_POSTS: Int = 128
        const val MAX_TOKENS: Int = 256
        private const val FRESH_MILLIS = 60_000L
        private const val STALE_MILLIS = 24 * 60 * 60 * 1000L
    }
}
