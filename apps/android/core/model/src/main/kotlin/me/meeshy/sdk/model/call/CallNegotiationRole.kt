package me.meeshy.sdk.model.call

/**
 * Le rôle poli / impoli de la négociation parfaite (W3C), miroir de iOS `CallManager.isPolitePeer`. Les deux
 * pairs le calculent à l'identique depuis les deux identifiants : le plus petit est poli, sans rien signaler.
 * Une identité manquante ou identique rend IMPOLI : un côté mal configuré ne cède jamais à l'aveugle.
 */
object CallNegotiationRole {
    fun isPolite(localUserId: String, remoteUserId: String): Boolean {
        if (localUserId.isEmpty() || remoteUserId.isEmpty() || localUserId == remoteUserId) return false
        return localUserId < remoteUserId
    }

    /** Ce que fait un pair qui reçoit une offre alors que la sienne est en vol (collision). */
    fun glare(polite: Boolean, localOfferPending: Boolean): GlareVerdict = when {
        !localOfferPending -> GlareVerdict.Answer
        polite -> GlareVerdict.RollbackThenAnswer
        else -> GlareVerdict.Ignore
    }
}

enum class GlareVerdict { Answer, RollbackThenAnswer, Ignore }
