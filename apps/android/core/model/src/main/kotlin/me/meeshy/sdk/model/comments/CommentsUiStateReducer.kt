package me.meeshy.sdk.model.comments

/** Ce que la feuille des commentaires dessine pour un fil : un seul état à la fois, dérivé de faits bruts. */
enum class CommentsSheetPhase { SKELETON, CONTENT, EMPTY, ERROR, OFFLINE_EMPTY }

/** Les faits du fil lus par la feuille ; [loadedRows] compte les commentaires racine déjà en mémoire (cache compris). */
data class CommentsSheetInput(
    val loadedRows: Int,
    val isLoading: Boolean,
    val loadFailed: Boolean,
    val isOffline: Boolean,
    val hasSettled: Boolean,
)

data class CommentsSheetUi(val phase: CommentsSheetPhase, val showsOfflineBand: Boolean)

/**
 * Cache-first : le squelette n'existe que sur un cache vide à froid ; un fil déjà chargé reste affiché malgré une
 * panne ; hors ligne sans rien à montrer est un état discret, jamais une erreur.
 */
object CommentsUiStateReducer {
    fun reduce(input: CommentsSheetInput): CommentsSheetUi {
        val hasRows = input.loadedRows > 0
        val phase = when {
            hasRows -> CommentsSheetPhase.CONTENT
            input.loadFailed && input.isOffline -> CommentsSheetPhase.OFFLINE_EMPTY
            input.loadFailed -> CommentsSheetPhase.ERROR
            input.isLoading || !input.hasSettled -> CommentsSheetPhase.SKELETON
            else -> CommentsSheetPhase.EMPTY
        }
        return CommentsSheetUi(phase = phase, showsOfflineBand = hasRows && input.isOffline)
    }
}

object CommentsTitleCount {
    /** Une page n'est qu'une borne basse : le total servi gagne tant qu'il dépasse ce qui est chargé. */
    fun of(serverCount: Int?, loadedRows: Int): Int = maxOf(serverCount ?: 0, loadedRows)

    fun afterSend(current: Int): Int = maxOf(current, 0) + 1
}
