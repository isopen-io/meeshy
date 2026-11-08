package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallConnectedCatchUpPolicy
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallQualityThresholds
import me.meeshy.sdk.model.call.CallReliabilityPolicy
import me.meeshy.sdk.model.call.CallReliabilityWatchdog
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.ConnectingStep
import me.meeshy.sdk.model.call.HalfOpenOutcome
import me.meeshy.sdk.model.call.ReconnectTriggerOutcome
import me.meeshy.sdk.socket.CallSignalManager

/** Les compteurs RTP cumulés de la connexion : de quoi dire si le média passe dans les deux sens. */
data class CallPacketCounts(val inbound: Int, val outbound: Int)

/**
 * Ce que le moniteur de fiabilité demande au média d'UN appel (le [WebRtcCallCoordinator] l'implémente). Une
 * couture : les décisions sont dans `:core:model`, ici seulement la lecture de l'état du pair et les actes.
 */
interface CallReliabilityMedia {
    /** La connexion ICE du pair se dit établie. */
    val peerConnected: Boolean

    /** L'appelé n'a pas encore l'offre du pair : aucune négociation ICE n'est en panne. */
    val awaitingRemoteOffer: Boolean

    /** Les compteurs RTP, `null` quand le pair ne répond pas ou n'existe plus. */
    suspend fun packetCounts(): CallPacketCounts?

    /** Un cycle de reconnexion vient de s'ouvrir hors ICE : le retour `CONNECTED` doit le refermer. */
    fun beginReconnectCycle()

    /** Rattrapage « connecté » par niveau : la FSM suit un pair déjà établi. */
    fun catchUpConnected()

    /** Relance ICE (et renégociation par l'appelant initial), sans condition de stall préalable. */
    fun restartIceNow()
}

/**
 * La demande de reconnexion, arbitrée (iOS `CallReconnector.attemptReconnection`). Les déclencheurs extérieurs
 * (arêtes réseau, lien à moitié ouvert, chien de garde `Connecting`) ouvrent UN cycle : tant qu'il est en vol
 * les suivants se COALESCENT — ils réarment sa relance ICE sans consommer le budget de tentatives, de sorte
 * qu'une seule coupure dont les arêtes perdu/retour tirent toutes deux ne coûte pas deux tentatives.
 */
internal class CallReconnectionTrigger(private val signals: CallSignalManager) {
    fun request(host: CallSessionHost, media: CallReliabilityMedia) {
        val state = host.callState
        if (!CallReliabilityPolicy.reconnectingAllowed(state)) return
        val outcome = CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting = state is CallState.Reconnecting,
            isEscalation = false,
        )
        if (outcome == ReconnectTriggerOutcome.StartCycle && state is CallState.Connected) {
            host.dispatch(CallEvent.ConnectionStalled)
            media.beginReconnectCycle()
        }
        media.restartIceNow()
    }
}

/**
 * Le moniteur périodique (iOS `CallReliabilityMonitor`, §5.8) : à chaque tick il branche sur l'état de l'appel.
 *
 *  - `Connecting` : rattrapage par niveau si le pair est déjà connecté, sinon chien de garde ICE/DTLS — UN
 *    restart ICE, puis l'échec de l'appel plutôt qu'un « Connexion… » sans fin ;
 *  - `Offering` : aucun chien de garde, l'appelé sonne encore (l'horloge est le délai de sonnerie) ;
 *  - `Connected` : auto-guérison du lien à moitié ouvert — nous envoyons du RTP, celui du pair n'arrive pas :
 *    UN seul restart ICE par appel ;
 *  - le budget de chaque tentative en `Reconnecting` est celui du [CallWatchdogsController].
 */
internal class CallReliabilityMonitor(
    private val clock: CallClock,
    private val signals: CallSignalManager,
    private val trigger: CallReconnectionTrigger,
    private val intervalMs: Long = (CallQualityThresholds.RTP_GATE_POLL_INTERVAL_SECONDS * MS_PER_SECOND).toLong(),
) {
    private var watchdog = CallReliabilityWatchdog()

    /** L'époque de connexion : incrémentée à chaque passage en Connected, elle réarme la détection half-open. */
    var connectionEpoch: Int = 0
        private set

    fun onTransition(next: CallState) {
        if (next is CallState.Connected) connectionEpoch += 1
    }

    fun start(host: CallSessionHost, media: CallReliabilityMedia): Job = host.scope.launch {
        watchdog = CallReliabilityWatchdog()
        while (true) {
            delay(intervalMs)
            if (!tick(host, media)) return@launch
        }
    }

    /** Un tick. `false` une fois l'appel failli : le moniteur s'arrête. */
    private suspend fun tick(host: CallSessionHost, media: CallReliabilityMedia): Boolean {
        when (host.callState) {
            is CallState.Offering -> watchdog = watchdog.offering()
            is CallState.Connecting -> return superviseConnecting(host, media)
            is CallState.Connected -> {
                watchdog = watchdog.connected()
                superviseHalfOpen(host, media)
            }
            else -> watchdog = watchdog.otherState()
        }
        return true
    }

    private fun superviseConnecting(host: CallSessionHost, media: CallReliabilityMedia): Boolean {
        if (CallConnectedCatchUpPolicy.shouldCatchUp(host.callState, media.peerConnected)) {
            media.catchUpConnected()
            watchdog = watchdog.connectingCaughtUp()
            return true
        }
        val tick = watchdog.connecting(nowMs = clock.nowMs(), awaitingRemoteOffer = media.awaitingRemoteOffer)
        watchdog = tick.watchdog
        when (tick.step) {
            ConnectingStep.Waiting -> Unit
            is ConnectingStep.RestartIce -> media.restartIceNow()
            is ConnectingStep.Fail -> {
                host.dispatch(CallEvent.ConnectionFailed(CONNECT_TIMED_OUT))
                if (host.callId.isNotBlank()) signals.emitEnd(host.callId)
                host.endMedia()
                return false
            }
        }
        return true
    }

    private suspend fun superviseHalfOpen(host: CallSessionHost, media: CallReliabilityMedia) {
        val epoch = connectionEpoch
        if (!watchdog.halfOpen.needsEvaluation(epoch)) return
        val counts = media.packetCounts() ?: return
        val step = watchdog.halfOpen.evaluate(epoch, counts.inbound, counts.outbound, clock.nowMs())
        watchdog = watchdog.withHalfOpen(step.state)
        if (step.outcome == HalfOpenOutcome.HealHalfOpen) trigger.request(host, media)
    }

    private companion object {
        const val MS_PER_SECOND = 1_000.0
        const val CONNECT_TIMED_OUT = "connect timed out"
    }
}
