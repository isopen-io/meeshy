package me.meeshy.sdk.model

/** Où en est la ligne de file d'une publication au moment où l'auteur la supprime. */
sealed interface PublicationRowState {
    data object Absent : PublicationRowState
    data object Pending : PublicationRowState
    data object InFlight : PublicationRowState
    data object Exhausted : PublicationRowState
}

/** Les quatre issues d'un « Supprimer » sur une publication en file (iOS `OfflineQueue+PublicationCancel`). */
enum class PublicationCancelOutcome(val removesBubble: Boolean) {
    /** La ligne a été retirée : rien ne partira. */
    REMOVED(removesBubble = true),

    /** La requête est en vol : une marque durable est posée, vérifiée avant le prochain envoi. */
    CANCEL_REQUESTED(removesBubble = false),

    /** La ligne n'existe plus : le serveur a déjà tout reçu. */
    ALREADY_SENT(removesBubble = false),

    /** La suppression n'a pas pu s'écrire. */
    FAILED(removesBubble = false),
}

object PublicationCancelRule {

    fun decide(state: PublicationRowState): PublicationCancelOutcome = when (state) {
        PublicationRowState.Absent -> PublicationCancelOutcome.ALREADY_SENT
        PublicationRowState.InFlight -> PublicationCancelOutcome.CANCEL_REQUESTED
        PublicationRowState.Pending, PublicationRowState.Exhausted -> PublicationCancelOutcome.REMOVED
    }
}

/**
 * Un envoi resté en file plus d'une minute se propose à la reprise : « Reprendre » rouvre le composer avec son contenu
 * (iOS `StuckPublicationRetry`). Un vocal n'est jamais recueilli ainsi : sa piste ne se reconstitue pas dans le composer.
 */
object StuckPublicationRule {
    const val STUCK_AFTER_MS: Long = 60_000L

    fun isRecoverable(state: PublicationRowState, waitedMillis: Long, hasVoice: Boolean): Boolean =
        !hasVoice &&
            (state == PublicationRowState.Pending || state == PublicationRowState.InFlight) &&
            waitedMillis > STUCK_AFTER_MS
}
