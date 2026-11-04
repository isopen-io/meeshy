package me.meeshy.sdk.model

/**
 * Réconciliation locale des stories mortes du plateau (iOS `[StoryGroup].purgingDeadStories`, `StoryTrayPurge.swift`),
 * posée sur les lignes du cache ([ApiPost]) : le cache survit à la fenêtre de visibilité d'une story (20 h), il porte
 * donc des stories que le serveur ne renverra plus.
 *
 * Une story est morte quand son id figure dans `deletedIds` (suppression explicite, valable pour tout le monde,
 * auteur compris) ou qu'elle est expirée ET n'est pas celle de `currentUserId` : l'auteur garde l'accès à ses propres
 * stories expirées pour y lire réactions et commentaires. Un groupe vidé sort du plateau de lui-même (le groupe est
 * dérivé des lignes). `nowMillis = null` n'évalue PAS l'expiration : seul `deletedIds` compte (retrait ciblé).
 */
public object StoryTrayPurge {

    /** Les ids que [purging] retirerait, dans l'ordre reçu — de quoi dépingler leurs médias. */
    public fun deadIds(
        posts: List<ApiPost>,
        currentUserId: String?,
        deletedIds: Set<String> = emptySet(),
        nowMillis: Long? = null,
    ): List<String> = posts.filter { isDead(it, currentUserId, deletedIds, nowMillis) }.map { it.id }

    public fun purging(
        posts: List<ApiPost>,
        currentUserId: String?,
        deletedIds: Set<String> = emptySet(),
        nowMillis: Long? = null,
    ): List<ApiPost> = posts.filterNot { isDead(it, currentUserId, deletedIds, nowMillis) }

    /** Prédicat unique : la boucle de purge et l'inventaire des ids retirés ne peuvent pas diverger. */
    public fun isDead(
        post: ApiPost,
        currentUserId: String?,
        deletedIds: Set<String>,
        nowMillis: Long?,
    ): Boolean {
        if (post.id in deletedIds) return true
        if (nowMillis == null) return false
        if (currentUserId != null && post.author?.id == currentUserId) return false
        return effectiveExpiryMillis(post) <= nowMillis
    }

    /** Expiration servie, sinon 20 h après la création ([StoryItem.DEFAULT_EXPIRY_MILLIS]) ; sans aucune date, vivante. */
    private fun effectiveExpiryMillis(post: ApiPost): Long {
        val explicit = isoToEpochMillis(post.expiresAt)
        if (explicit > 0L) return explicit
        val created = isoToEpochMillis(post.createdAt)
        if (created <= 0L) return Long.MAX_VALUE
        return created + StoryItem.DEFAULT_EXPIRY_MILLIS
    }
}
