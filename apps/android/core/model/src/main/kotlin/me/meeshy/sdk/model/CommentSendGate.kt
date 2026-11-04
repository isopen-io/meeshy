package me.meeshy.sdk.model

/**
 * Envoyer, garder ou ne rien faire (iOS `CommentSendGate`, #9743) — décidé AVANT de toucher au composeur. Jamais « vider
 * puis abandonner » : tant qu'une pièce de la zone n'a pas son fichier, rien ne part et rien ne se vide.
 */
object CommentSendGate {
    /** Une pièce de la zone : prête quand son fichier est téléversé. */
    data class Piece(val id: String, val isReady: Boolean)

    sealed interface Decision {
        /** Tout est prêt : le commentaire part avec ces pièces. */
        data class Send(val pieceIds: List<String>) : Decision

        /** Une pièce se prépare encore : le composeur reste intact. */
        data class KeepWhilePreparing(val loading: Int) : Decision

        /** Rien à envoyer. */
        data object DoNothing : Decision
    }

    fun decide(text: String, pieces: List<Piece>, hasPlace: Boolean): Decision {
        val loading = pieces.count { !it.isReady }
        if (loading > 0) return Decision.KeepWhilePreparing(loading)
        if (text.isBlank() && pieces.isEmpty() && !hasPlace) return Decision.DoNothing
        return Decision.Send(pieces.map { it.id })
    }
}
