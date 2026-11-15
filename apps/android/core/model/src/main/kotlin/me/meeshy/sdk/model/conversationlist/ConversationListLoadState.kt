package me.meeshy.sdk.model.conversationlist

/**
 * L'état de chargement explicite de la liste des conversations (miroir de iOS
 * `ConversationListViewModel.loadState`, `ConversationListViewModel+Loading.swift`).
 *
 * - [Idle] : rien n'a encore été lu.
 * - [CachedFresh] / [CachedStale] : le cache a peint la première image ; une synchro silencieuse suit.
 * - [Loading] : cache vide (ou expiré sans rien de récupérable) — le seul état qui montre le squelette.
 * - [Offline] : la synchro a échoué mais des données sont à l'écran — un état discret, JAMAIS une erreur.
 * - [Loaded] : une synchro a abouti.
 * - [Error] : la synchro a échoué et rien n'est à l'écran.
 */
sealed interface ConversationListLoadState {
    data object Idle : ConversationListLoadState
    data object CachedFresh : ConversationListLoadState
    data object CachedStale : ConversationListLoadState
    data object Loading : ConversationListLoadState
    data object Offline : ConversationListLoadState
    data object Loaded : ConversationListLoadState
    data class Error(val message: String) : ConversationListLoadState
}

/** Ce que la lecture du disque a trouvé, indépendamment du type de cache qui l'a servi. */
enum class ConversationListCacheReading { FRESH, STALE, EXPIRED, EMPTY }

/** Les transitions pures de [ConversationListLoadState]. */
object ConversationListLoadStates {

    /**
     * La première lecture du cache : frais ou périmé peignent ; un cache expiré mais
     * récupérable s'affiche HORS LIGNE (la resynchro qui suit le remplacera) ; un cache vide charge.
     */
    fun onCacheRead(reading: ConversationListCacheReading, hasData: Boolean): ConversationListLoadState =
        when (reading) {
            ConversationListCacheReading.FRESH -> ConversationListLoadState.CachedFresh
            ConversationListCacheReading.STALE -> ConversationListLoadState.CachedStale
            ConversationListCacheReading.EXPIRED ->
                if (hasData) ConversationListLoadState.Offline else ConversationListLoadState.Loading
            ConversationListCacheReading.EMPTY -> ConversationListLoadState.Loading
        }

    fun onSyncSucceeded(): ConversationListLoadState = ConversationListLoadState.Loaded

    /** Une synchro qui échoue avec des données à l'écran ne remplace jamais la liste : hors ligne. */
    fun onSyncFailed(hasData: Boolean, message: String): ConversationListLoadState =
        if (hasData) ConversationListLoadState.Offline else ConversationListLoadState.Error(message)

    /** Un rafraîchissement demandé : le squelette seulement si rien n'est à l'écran. */
    fun onRefreshStarted(current: ConversationListLoadState, hasData: Boolean): ConversationListLoadState =
        if (hasData) current else ConversationListLoadState.Loading

    fun showsSkeleton(state: ConversationListLoadState, hasData: Boolean): Boolean =
        state == ConversationListLoadState.Loading && !hasData

    fun isError(state: ConversationListLoadState): Boolean = state is ConversationListLoadState.Error

    /** La réparation (iOS #10927) : seulement sur un FRONT MONTANT du réseau, et seulement après un échec. */
    fun repairsOnReconnect(state: ConversationListLoadState, wasOnline: Boolean, isOnline: Boolean): Boolean =
        !wasOnline && isOnline && isError(state)
}
