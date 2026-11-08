package me.meeshy.app.calls

import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallErrorDisposition
import me.meeshy.sdk.model.call.CallErrorSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.socket.CallSignalManager

/**
 * Le sort d'un `call:error` pour l'appel en cours, miroir de iOS `CallSignalingRouter.observeCallErrors` : seule une
 * erreur qui rend l'appel impossible le termine ([CallErrorDisposition]). Le refus d'un rafraîchissement TURN
 * (`NOT_A_PARTICIPANT` d'une passerelle ancienne), l'erreur d'un autre appel ou un rejet de relais ne raccrochent
 * jamais un appel sain ; `CALL_ENDED` se réconcilie en fin d'appel distante.
 */
class CallErrorController(
    private val signals: CallSignalManager,
    private val turn: CallTurnCredentialsController,
    private val isResuming: () -> Boolean,
) {
    fun attach(host: CallSessionHost) {
        host.scope.launch {
            signals.callErrors.collect { error ->
                try {
                    handle(host, error)
                } catch (_: Exception) {
                    // Un échec de traitement d'une erreur ne coupe pas le flux des suivantes.
                }
            }
        }
    }

    internal fun handle(host: CallSessionHost, error: CallErrorSignal) {
        val disposition = CallErrorDisposition.resolve(
            code = error.code,
            errorCallId = error.callId,
            currentCallId = host.callId.takeIf { it.isNotBlank() },
            isTransientDuringResume = isResuming() && error.code == NOT_A_PARTICIPANT,
            answersAccessoryRequest = turn.hasPendingRequest || signals.accessoryRequestAnswered(error),
            callIsActive = host.callState.isActive,
        )
        when (disposition) {
            CallErrorDisposition.Ignore -> Unit
            is CallErrorDisposition.ReconcileEnd -> {
                host.dispatch(CallEvent.RemoteHangUp)
                host.endMedia()
            }
            is CallErrorDisposition.Surface -> if (disposition.endsCall) {
                host.dispatch(CallEvent.ConnectionFailed(error.message ?: error.code ?: GENERIC))
                if (host.callId.isNotBlank()) signals.emitEnd(host.callId)
                host.endMedia()
            }
        }
    }

    private companion object {
        const val NOT_A_PARTICIPANT = "NOT_A_PARTICIPANT"
        const val GENERIC = "Call error"
    }
}
