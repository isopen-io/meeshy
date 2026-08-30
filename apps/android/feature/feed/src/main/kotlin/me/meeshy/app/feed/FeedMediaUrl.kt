package me.meeshy.app.feed

import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Resolve a possibly-relative media path against the gateway origin — one law shared
 * across the feed module's projections (posts, repost embeds, comments) so a stored
 * `/uploads/…` path and an absolute `https://…` URL are handled identically everywhere.
 *
 * Depuis #4324, la loi vit dans `me.meeshy.sdk.util.resolveMediaUrl` — le site
 * UNIQUE, partagé par les quatre modules qui en portaient chacun une copie
 * identique. Cette fonction n'en est plus qu'un alias, conservé pour ne pas
 * repointer d'un coup tous ses appelants.
 */
/**
 * Alias historique vers le site UNIQUE (#4324) — `me.meeshy.sdk.util.resolveMediaUrl`.
 * Cette fonction existait en QUATRE exemplaires identiques, tous incapables de
 * poser la route d'une clé de stockage.
 */
internal fun resolveFeedMediaUrl(url: String, apiBaseUrl: String?): String =
    resolveMediaUrl(url, apiBaseUrl)
