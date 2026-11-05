package me.meeshy.sdk.model

/**
 * Curseur de la revalidation par delta du plateau (iOS `StoryViewModel.deltaSince`) : `max(updatedAt)` des stories
 * tenues. `null` (plateau vide, cache antérieur au champ) ⇒ liste complète. Dérivé du plateau APRÈS purge : le
 * dériver d'une story retirée avancerait le curseur au-delà de l'état réel et le delta suivant sauterait les
 * tombstones de cet intervalle.
 */
public object StoryDeltaCursor {
    public fun of(posts: List<ApiPost>): String? =
        posts.mapNotNull { post -> post.updatedAt?.let { it to isoToEpochMillisOrNull(it) } }
            .filter { it.second != null }
            .maxByOrNull { it.second ?: Long.MIN_VALUE }
            ?.first
}
