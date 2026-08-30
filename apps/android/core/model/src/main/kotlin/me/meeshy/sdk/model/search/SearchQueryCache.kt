package me.meeshy.sdk.model.search

/**
 * Cache LRU borne + TTL des resultats d'une recherche, keye par requete normalisee
 * (trim + lowercase). Port pur de la LRU in-memory de iOS `GlobalSearchViewModel`
 * (`messageQueryCache` : capacite 5, `messageQueryCacheStaleTTL` 120 s) — le
 * mecanisme "cache-first" qui ressert une requete deja vue sans repartir en reseau
 * (dimension 2 Performance : jamais de spinner quand le cache a des donnees).
 *
 * Immuable : chaque [put]/[invalidate] rend une NOUVELLE instance ; [get] est une
 * lecture PURE — une entree perimee est un MISS, jamais un etat mute (l'eviction se
 * fait au [put], par la capacite). Ce type ne connait ni horloge ni reseau ni
 * socket : le "quand" (le [nowMillis] a passer, l'invalidation sur evenement)
 * appartient a l'appelant. C'est un building block `:core:model` stateless.
 *
 * @param V le type des resultats mis en cache (agnostique : messages, la reponse
 *   unifiee des trois volets, etc.).
 */
@ConsistentCopyVisibility
data class SearchQueryCache<V> private constructor(
    private val entries: List<Entry<V>>,
    val capacity: Int,
    val ttlMillis: Long,
) {
    private data class Entry<V>(val key: String, val value: V, val cachedAtMillis: Long)

    /** Nombre d'entrees actuellement gardees (perimees comprises jusqu'a leur eviction). */
    val size: Int get() = entries.size

    /**
     * La valeur mise en cache pour [query] si elle existe ET est encore fraiche
     * ([nowMillis] − cachedAt < [ttlMillis], borne exclue comme iOS `< staleTTL`),
     * sinon `null`. Une [query] vide/blanche est toujours un MISS. Lecture pure :
     * une entree perimee renvoie `null` sans muter le cache.
     */
    fun get(query: String, nowMillis: Long): V? {
        val key = normalize(query)
        if (key.isEmpty()) return null
        val entry = entries.firstOrNull { it.key == key } ?: return null
        if (nowMillis - entry.cachedAtMillis >= ttlMillis) return null
        return entry.value
    }

    /**
     * Rend un cache ou [query] pointe sur [value], horodatee a [nowMillis]. Une cle
     * deja presente est REMPLACEE et remontee en fraicheur (retiree puis re-ajoutee),
     * si bien qu'une mise a jour ne consomme pas de slot. Au-dela de [capacity], la
     * PLUS ANCIENNE entree est evincee. Une [query] vide/blanche est un no-op qui
     * rend la meme instance.
     */
    fun put(query: String, value: V, nowMillis: Long): SearchQueryCache<V> {
        val key = normalize(query)
        if (key.isEmpty()) return this
        val withoutKey = entries.filterNot { it.key == key }
        val appended = withoutKey + Entry(key, value, nowMillis)
        val bounded = if (appended.size > capacity) appended.takeLast(capacity) else appended
        return copy(entries = bounded)
    }

    /**
     * Vide tout le cache — appele quand une donnee sous-jacente a change (une
     * conversation mise a jour/supprimee via socket) et que tout resultat garde
     * pourrait etre perime (parite iOS `invalidateMessageQueryCache`). Rend la meme
     * instance si le cache est deja vide (inertie sans copie).
     */
    fun invalidate(): SearchQueryCache<V> =
        if (entries.isEmpty()) this else copy(entries = emptyList())

    companion object {
        const val DEFAULT_CAPACITY: Int = 5
        const val DEFAULT_TTL_MILLIS: Long = 120_000L

        /** La regle de cle partagee : trim puis lowercase (SSOT, parite iOS). */
        fun normalize(query: String): String = query.trim().lowercase()

        fun <V> empty(
            capacity: Int = DEFAULT_CAPACITY,
            ttlMillis: Long = DEFAULT_TTL_MILLIS,
        ): SearchQueryCache<V> {
            require(capacity > 0) { "capacity must be > 0, was $capacity" }
            require(ttlMillis > 0) { "ttlMillis must be > 0, was $ttlMillis" }
            return SearchQueryCache(emptyList(), capacity, ttlMillis)
        }
    }
}
