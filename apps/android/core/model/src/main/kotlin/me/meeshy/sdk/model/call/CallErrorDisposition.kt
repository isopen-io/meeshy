package me.meeshy.sdk.model.call

/**
 * Ce que fait un `call:error` à l'appel en cours, miroir de iOS `CallErrorDisposition`. Seule une erreur qui
 * rend l'appel impossible le termine : le refus d'une requête ACCESSOIRE (rafraîchissement TURN, bascule de
 * média, état) ne dit rien de l'appel — une passerelle ancienne refusait le rafraîchissement TURN d'un appareil
 * qui venait de décrocher (`NOT_A_PARTICIPANT`) et l'appel raccrochait 0,3 s plus tard.
 */
sealed interface CallErrorDisposition {
    data object Ignore : CallErrorDisposition
    data class ReconcileEnd(val callId: String) : CallErrorDisposition
    data class Surface(val endsCall: Boolean) : CallErrorDisposition

    companion object {
        private val NON_FATAL_RELAY_CODES = setOf("INVALID_SIGNAL", "RATE_LIMIT_EXCEEDED", "TARGET_NOT_FOUND")

        fun resolve(
            code: String?,
            errorCallId: String?,
            currentCallId: String?,
            isTransientDuringResume: Boolean,
            answersAccessoryRequest: Boolean,
            callIsActive: Boolean,
        ): CallErrorDisposition = when {
            errorCallId != null && errorCallId != currentCallId -> Ignore
            code != null && code in NON_FATAL_RELAY_CODES -> Ignore
            code == "CALL_ENDED" -> (errorCallId ?: currentCallId)?.let(::ReconcileEnd) ?: Ignore
            isTransientDuringResume -> Ignore
            answersAccessoryRequest -> Ignore
            else -> Surface(endsCall = callIsActive)
        }
    }
}

/** Un `call:error` décodé : son code, l'appel qu'il vise (absent chez une passerelle ancienne) et son texte. */
data class CallErrorSignal(val code: String?, val callId: String?, val message: String?)
