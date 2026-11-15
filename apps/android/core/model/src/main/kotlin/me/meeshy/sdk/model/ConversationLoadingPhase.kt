package me.meeshy.sdk.model

/**
 * Phase de chargement du fil, mutuellement exclusive (miroir de iOS `ConversationLoadingPhase`).
 * Seul [LOADING_INITIAL] autorise un spinner ou un squelette bloquant ; la pagination
 * ([LOADING_OLDER], [LOADING_NEWER]) laisse la liste visible et la revalidation
 * ([REVALIDATING]) n'a qu'un indice discret dans l'en-tete.
 */
enum class ConversationLoadingPhase {
    IDLE,
    LOADING_INITIAL,
    LOADING_OLDER,
    LOADING_NEWER,
    REVALIDATING,
    LOADED,
    ;

    /** Seul le premier chargement a froid (rien a peindre) peut bloquer l'ecran. */
    val isBlockingSpinnerNeeded: Boolean get() = this == LOADING_INITIAL

    val isPaginating: Boolean get() = this == LOADING_OLDER || this == LOADING_NEWER

    companion object {
        /** Priorite : initial > older > newer > revalidating > (loaded si des donnees ont ete vues, sinon idle). */
        fun derive(
            isLoadingInitial: Boolean,
            isLoadingOlder: Boolean,
            isLoadingNewer: Boolean,
            isRevalidating: Boolean,
            hasObservedAnyData: Boolean,
        ): ConversationLoadingPhase = when {
            isLoadingInitial -> LOADING_INITIAL
            isLoadingOlder -> LOADING_OLDER
            isLoadingNewer -> LOADING_NEWER
            isRevalidating -> REVALIDATING
            hasObservedAnyData -> LOADED
            else -> IDLE
        }
    }
}
