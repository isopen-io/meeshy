package me.meeshy.sdk.model.conversationlist

/**
 * L'état de la pagination par curseur de la liste (miroir de iOS `PaginationState`) : au repos, en train
 * de charger la suite, épuisée, ou en échec avec le message à montrer.
 */
sealed interface PaginationState {
    data object Idle : PaginationState
    data object LoadingMore : PaginationState
    data object Exhausted : PaginationState
    data class Failed(val message: String) : PaginationState
}

/** Ce que le pied de liste montre : rien, la sentinelle invisible, le spinner, « tout chargé » ou l'erreur. */
enum class PaginationFooter { Blank, Sentinel, Spinner, AllLoaded, Failure }

/** Le verdict d'une page reçue : la pagination continue depuis un curseur, ou elle est épuisée (et se persiste telle). */
sealed interface PaginationVerdict {
    data class Continue(val nextCursor: String) : PaginationVerdict
    data class Exhausted(val nextCursor: String?) : PaginationVerdict
}

/**
 * Les lois de la pagination de la liste des conversations (miroir de iOS `ConversationListPaginationCursor`
 * et de `ConversationListViewModel.loadMore` / `ConversationPaginationFooterContent`).
 *
 * Le serveur est seul juge de ce qu'il ÉMET, le client de ce qu'il INVENTE : un `nextCursor` servi passe tel
 * quel, un repli fabriqué doit ressembler à ce que la passerelle sert (24 hexadécimaux), sinon la requête
 * demande la première page — un repli sûr.
 */
object ConversationListPagination {

    /** La taille d'une page (plafond de la passerelle). */
    const val PAGE_SIZE: Int = 100

    /** On charge la suite quand la dernière ligne visible est à ce nombre de rangs de la fin, ou moins. */
    const val TRIGGER_DISTANCE: Int = 5

    /** « Toutes les conversations sont chargées » ne s'annonce qu'au-delà de ce nombre. */
    const val ALL_LOADED_THRESHOLD: Int = 30

    private const val SERVER_ID_LENGTH = 24

    private fun isServerId(value: String): Boolean =
        value.length == SERVER_ID_LENGTH && value.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }

    /** Le curseur à envoyer, ou `null` (= la première page). */
    fun cursor(nextCursor: String?, oldestLocalId: String?): String? {
        if (!nextCursor.isNullOrEmpty()) return nextCursor
        return oldestLocalId?.takeIf(::isServerId)
    }

    /**
     * Garde « zéro progrès » : une page qui n'apporte aucun nouvel identifiant, dont le curseur n'avance pas
     * ou qui n'en rend pas alors que le serveur promet une suite, FORCE l'épuisement — jamais de boucle infinie.
     */
    fun verdict(requestCursor: String?, nextCursor: String?, newIds: Int, serverHasMore: Boolean): PaginationVerdict {
        val advanced = nextCursor != null && nextCursor != requestCursor
        return if (serverHasMore && newIds > 0 && advanced) {
            PaginationVerdict.Continue(nextCursor.orEmpty())
        } else {
            PaginationVerdict.Exhausted(nextCursor)
        }
    }

    /** Vrai quand la ligne visible la plus basse est à [TRIGGER_DISTANCE] rangs de la fin ou moins. */
    fun shouldLoadMore(lastVisibleIndex: Int, rowCount: Int): Boolean =
        lastVisibleIndex >= 0 && rowCount > 0 && lastVisibleIndex >= rowCount - 1 - TRIGGER_DISTANCE

    fun footer(state: PaginationState, hasMore: Boolean, conversationCount: Int): PaginationFooter = when (state) {
        PaginationState.LoadingMore -> PaginationFooter.Spinner
        PaginationState.Exhausted ->
            if (conversationCount > ALL_LOADED_THRESHOLD) PaginationFooter.AllLoaded else PaginationFooter.Blank
        is PaginationState.Failed -> PaginationFooter.Failure
        PaginationState.Idle -> if (hasMore) PaginationFooter.Sentinel else PaginationFooter.Blank
    }
}
