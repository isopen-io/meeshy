package me.meeshy.sdk.model.call

/**
 * Ce que l'en-tête d'une conversation sait de l'appel local : deux faits, jamais l'état complet
 * de la pile d'appel (miroir de `CallHeaderSnapshot`, iOS `CallHeaderSnapshot.swift`).
 */
data class CallHeaderSnapshot(
    val isActive: Boolean,
    val conversationId: String?,
) {
    /**
     * Un appel actif ne s'affiche que dans la conversation qui l'héberge. Un identifiant inconnu
     * dégrade en affichant la pastille : jamais priver l'utilisateur d'un chemin de retour.
     */
    fun showsReturnIndicator(conversationId: String): Boolean {
        if (!isActive) return false
        val hosting = this.conversationId?.takeIf { it.isNotBlank() } ?: return true
        return hosting == conversationId
    }

    companion object {
        val IDLE = CallHeaderSnapshot(isActive = false, conversationId = null)
    }
}

/** Ce que la place d'appel de l'en-tête montre (miroir de `CallHeaderPresentation`, iOS). */
sealed interface CallHeaderPresentation {
    data object None : CallHeaderPresentation
    data object Start : CallHeaderPresentation
    data object ReturnToCall : CallHeaderPresentation
    data class Rejoin(val call: ActiveCallSession) : CallHeaderPresentation

    companion object {
        fun resolve(
            snapshot: CallHeaderSnapshot,
            reconciled: ActiveCallSession?,
            canStart: Boolean,
            conversationId: String,
        ): CallHeaderPresentation {
            if (snapshot.isActive) {
                return if (snapshot.showsReturnIndicator(conversationId)) ReturnToCall else None
            }
            if (reconciled != null) return Rejoin(reconciled)
            return if (canStart) Start else None
        }

        /** Le serveur n'est sondé que si la pile locale ne sait pas déjà : une course pourrait la contredire. */
        fun shouldReconcile(snapshot: CallHeaderSnapshot): Boolean = !snapshot.isActive
    }
}
