package me.meeshy.sdk.model

/**
 * La tranche de l'historique d'une conversation que le fil observe (miroir de `MessageStore.WindowMode` iOS).
 * Trois modes explicites ; les transitions sont pures, dans [MessageWindowReducer].
 */
public sealed interface MessageWindowMode {

    /** Le nominal : les [limit] messages les plus récents, grandi par la pagination vers le haut. */
    public data class Latest(val limit: Int = DEFAULT_LIMIT) : MessageWindowMode

    /**
     * Un saut vers un ancien message : les lignes de [fromMillis] à [throughMillis] (bornes incluses),
     * `null` = jusqu'au présent. [anchorId] est le message visé.
     */
    public data class Jumped(
        val anchorId: String,
        val fromMillis: Long,
        val throughMillis: Long?,
    ) : MessageWindowMode {
        /** Du plus récent reste à paginer tant que le bord récent n'a pas rejoint le présent. */
        val hasNewer: Boolean get() = throughMillis != null
    }

    /** Une recherche : exactement ces messages, dans l'ordre chronologique. */
    public data class Search(val ids: List<String>) : MessageWindowMode

    public companion object {
        public const val DEFAULT_LIMIT: Int = 30
    }
}
