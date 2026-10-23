package me.meeshy.sdk.model.mediacache

/** Pourquoi une case n'est pas purgeable : limite STRUCTURELLE du cache, jamais une fonction manquante. */
public enum class CachePurgeLimitation {
    /** Aucun stockage dédié : rien n'est conservé localement. */
    NO_DEDICATED_STORE,

    /** Champ du contenu qui le porte : le retirer ne libère rien. */
    EMBEDDED_IN_PAYLOAD,

    /** Publications et réels partagent les mêmes clés : l'un ne se vide pas sans l'autre. */
    INDIVISIBLE_FROM_POSTS,

    /** Croisement sans sens (des messages dans les stories). */
    NOT_APPLICABLE,
}

/** État d'une case : purgeable avec des octets mesurés, ou indisponible avec sa raison. */
public sealed interface CachePurgeAvailability {
    public data class Purgeable(val measuredBytes: Long) : CachePurgeAvailability

    public data class Unavailable(val limitation: CachePurgeLimitation) : CachePurgeAvailability

    public val bytes: Long
        get() = (this as? Purgeable)?.measuredBytes?.coerceAtLeast(0L) ?: 0L

    public val isPurgeable: Boolean
        get() = this is Purgeable
}
