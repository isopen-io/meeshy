package me.meeshy.sdk.model.call

/**
 * L'aperçu avant décroché (#8480) : un canal DISTINCT de `call:signal`, où une réponse
 * décrocherait l'appel. [type] ∈ offer | answer | ice-candidate.
 */
data class CallPreviewSignal(
    val callId: String,
    val type: String,
    val from: String,
    val to: String,
    val negotiationId: Int,
    val fields: Map<String, Any?> = emptyMap(),
) {
    /** L'objet `signal` : le socle imposé puis les champs propres (sdp, candidate…), sans les écraser. */
    fun signalFields(): Map<String, Any?> =
        fields + mapOf("type" to type, "from" to from, "to" to to, "negotiationId" to negotiationId)
}

/** Cycle de vie d'une négociation d'aperçu : la PeerConnection secondaire se libère à la fin. */
sealed interface CallPreviewState {
    data object Idle : CallPreviewState
    data class Negotiating(val callId: String, val negotiationId: Int?) : CallPreviewState
}

object CallPreviewLaw {
    fun request(callId: String): CallPreviewState = CallPreviewState.Negotiating(callId, null)

    fun onSignal(state: CallPreviewState, envelope: CallSignalEnvelope): CallPreviewState =
        when (state) {
            is CallPreviewState.Negotiating ->
                if (state.callId != envelope.callId) state
                else state.copy(negotiationId = envelope.signal.negotiationId ?: state.negotiationId)
            CallPreviewState.Idle -> state
        }

    /** Décroché, refus, appel fini ou écran quitté : l'aperçu se libère. */
    fun release(state: CallPreviewState): CallPreviewState = CallPreviewState.Idle

    fun shouldRelease(state: CallPreviewState, endedCallId: String): Boolean =
        state is CallPreviewState.Negotiating && state.callId == endedCallId
}
