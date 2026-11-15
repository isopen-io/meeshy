package me.meeshy.sdk.model.call

/** La garde locale de sonnerie qu'une phase arme, ou aucune. */
sealed interface CallRingGuard {
    val timeoutMs: Long

    /** Appelant : sans réponse après [timeoutMs], l'appel se range en manqué même si `call:ended` est perdu. */
    data object Outgoing : CallRingGuard {
        override val timeoutMs: Long = CallRingGuardPolicy.OUTGOING_MS
    }

    /** Appelé : jumeau avec marge, pour que la passerelle garde le premier mot. */
    data object Incoming : CallRingGuard {
        override val timeoutMs: Long = CallRingGuardPolicy.INCOMING_MS
    }
}

/**
 * Miroir de iOS `CallRingTimeouts` : la passerelle a son propre délai et son `call:ended`, mais un événement
 * perdu laissait la sonnerie sans issue — chaque appel suivant se voyait « occupé ». Les gardes ne font que
 * fermer un appel que personne ne fermera.
 */
object CallRingGuardPolicy {
    const val OUTGOING_MS: Long = CallRules.RING_TIMEOUT_MS
    const val INCOMING_MARGIN_MS: Long = 30_000
    const val INCOMING_MS: Long = OUTGOING_MS + INCOMING_MARGIN_MS

    /**
     * Sortant : tant que ça sonne, `Offering` compris — le join de l'appelé est automatique à la sonnerie et
     * l'offre part avant tout décroché humain ; seule la réponse SDP désarme. Entrant : tant que ça sonne.
     */
    fun guardFor(state: CallState): CallRingGuard? = when (state) {
        is CallState.Ringing -> if (state.isOutgoing) CallRingGuard.Outgoing else CallRingGuard.Incoming
        CallState.Offering -> CallRingGuard.Outgoing
        else -> null
    }
}
