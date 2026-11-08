package me.meeshy.sdk.model.call

/** Ce qui identifie un appel pour décider si une demande de démarrage le concerne déjà. */
data class CallIdentity(
    val conversationId: String,
    val peerId: String,
    val isOutgoing: Boolean,
    val callId: String = "",
) {
    /** Une demande sans identifiant serveur (appel sortant) vise le même appel dès que le reste concorde. */
    fun isSameCallAs(other: CallIdentity): Boolean =
        conversationId == other.conversationId &&
            peerId == other.peerId &&
            isOutgoing == other.isOutgoing &&
            (callId.isBlank() || other.callId.isBlank() || callId == other.callId)
}

/** L'issue d'une demande de démarrage d'appel. */
enum class CallStartAdmission {
    /** Rien en cours : l'appel démarre. */
    Start,

    /** Un état `Ended` résiduel (fenêtre de règlement de 1,5 s) est remis à zéro, puis l'appel démarre. */
    SettleThenStart,

    /** Un autre appel est en cours : « Un appel est déjà en cours », l'appel courant n'est pas touché. */
    Busy,

    /** La même demande rejouée (recomposition, réouverture depuis la pilule) : sans effet. */
    Inert;

    companion object {
        fun decide(state: CallState, current: CallIdentity, requested: CallIdentity): CallStartAdmission = when {
            state is CallState.Idle -> Start
            current.isSameCallAs(requested) -> Inert
            state is CallState.Ended -> SettleThenStart
            requested.isOutgoing -> Busy
            else -> Inert
        }
    }
}
