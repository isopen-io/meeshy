package me.meeshy.app.chat

import me.meeshy.sdk.model.ConversationLoadingPhase

/**
 * La phase de chargement du fil, projetee de l'etat existant (aucun champ ajoute a [ChatUiState]) :
 * le squelette de demarrage a froid est le seul chargement bloquant, la pagination vers le haut
 * ([ChatUiState.isLoadingOlder]) et vers le bas ([isLoadingNewer], tenu par le controleur
 * d'atterrissage) laissent la liste visible, et une synchronisation sur une liste deja peinte
 * n'est qu'une revalidation discrete.
 */
internal fun ChatUiState.loadingPhase(isLoadingNewer: Boolean = false): ConversationLoadingPhase =
    ConversationLoadingPhase.derive(
        isLoadingInitial = showSkeleton,
        isLoadingOlder = isLoadingOlder,
        isLoadingNewer = isLoadingNewer,
        isRevalidating = isSyncing && messages.isNotEmpty(),
        hasObservedAnyData = messages.isNotEmpty(),
    )
