package me.meeshy.sdk.model.conversationlist

/**
 * Les conversations que ce client vient de créer (ou d'adopter) et que la réponse serveur
 * d'une synchro complète peut ne pas encore porter (réplication en retard, page déjà servie) :
 * pendant [TTL_MILLIS] elles survivent à la fusion, au-delà elles sont évincées.
 *
 * [createdAt] associe un identifiant de conversation à l'instant (epoch ms) où ce client l'a créée.
 */
object RecentlyCreatedMerge {

    /** La fenêtre de protection d'une conversation créée localement (iOS : 30 s). */
    const val TTL_MILLIS: Long = 30_000L

    /** Les identifiants encore protégés à [nowMillis]. */
    fun protectedIds(createdAt: Map<String, Long>, nowMillis: Long, ttlMillis: Long = TTL_MILLIS): Set<String> =
        createdAt.filterValues { isRecent(it, nowMillis, ttlMillis) }.keys

    /** Le registre débarrassé des entrées dont la fenêtre est passée. */
    fun evictExpired(createdAt: Map<String, Long>, nowMillis: Long, ttlMillis: Long = TTL_MILLIS): Map<String, Long> =
        createdAt.filterValues { isRecent(it, nowMillis, ttlMillis) }

    /**
     * La liste serveur, augmentée en tête des conversations locales récentes qu'elle ne porte
     * pas encore. Une conversation présente des deux côtés garde la version serveur.
     */
    fun <T> merge(
        server: List<T>,
        local: List<T>,
        idOf: (T) -> String,
        createdAt: Map<String, Long>,
        nowMillis: Long,
        ttlMillis: Long = TTL_MILLIS,
    ): List<T> {
        val keep = protectedIds(createdAt, nowMillis, ttlMillis)
        if (keep.isEmpty()) return server
        val served = server.mapTo(HashSet()) { idOf(it) }
        val carried = local.filter { idOf(it) in keep && idOf(it) !in served }
        return carried + server
    }

    private fun isRecent(createdAtMillis: Long, nowMillis: Long, ttlMillis: Long): Boolean =
        nowMillis - createdAtMillis in 0 until ttlMillis
}
