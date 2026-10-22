package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.socket.CallSignalManager
import org.webrtc.PeerConnection

/**
 * Réconciliation ICE ↔ FSM/serveur — le maillon résilience : avant lui, un
 * handoff réseau (WiFi→LTE) figeait le média Android pour toujours, l'appel
 * restant « actif » côté serveur (les heartbeats de la socket survivent au média
 * mort). Parité iOS `CallManager` :
 *  - `DISCONNECTED` mid-call = stall transitoire (souvent auto-guéri) — FSM
 *    Reconnecting + `call:reconnecting` (le serveur suspend son cleanup), sans
 *    restart : s'il dégénère, `FAILED` suit et restart alors.
 *  - `FAILED` mid-call = restart ICE immédiat (et renégociation par l'APPELANT
 *    INITIAL seul, anti-glare — c'est le [restartIce] fourni qui le décide).
 *  - retour `CONNECTED`/`COMPLETED` après un stall = `call:reconnected` +
 *    MediaConnected (FSM Reconnecting → Connected).
 * L'ICE pré-connexion (checking initial) reste hors sujet : c'est la phase
 * Connecting de la FSM, pas un stall.
 */
internal class CallIceStateMonitor(
    private val engine: WebRtcEngine,
    private val signals: CallSignalManager,
) {
    private var callId: String = ""
    private var selfId: String = ""
    private var connected: Boolean = false
    private var onMediaConnected: (() -> Unit)? = null
    private var onMediaStalled: (() -> Unit)? = null
    private var restartIce: () -> Unit = {}

    /** `true` between a mid-call ICE stall and its recovery; gates the reconnect signalling. */
    var stalled: Boolean = false
        private set

    /** 1-based count of stall cycles this call, carried on `call:reconnecting`. */
    private var reconnectAttempt: Int = 0

    /** A call opens: forget everything of the previous one. */
    fun begin(
        callId: String,
        selfId: String,
        onMediaConnected: () -> Unit,
        onMediaStalled: () -> Unit,
    ) {
        this.callId = callId
        this.selfId = selfId
        this.connected = false
        this.stalled = false
        this.reconnectAttempt = 0
        this.onMediaConnected = onMediaConnected
        this.onMediaStalled = onMediaStalled
    }

    /** Follow the engine's ICE state in [scope]; [restartIce] is the restart (+ renegotiation) to run on FAILED. */
    fun observe(scope: CoroutineScope, restartIce: () -> Unit) {
        this.restartIce = restartIce
        engine.iceConnectionState
            .onEach(::onIceState)
            .launchIn(scope)
    }

    /** The call is over: drop the callbacks and the stall bookkeeping. */
    fun end() {
        onMediaConnected = null
        onMediaStalled = null
        connected = false
        stalled = false
        reconnectAttempt = 0
    }

    private fun onIceState(state: PeerConnection.IceConnectionState) {
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            -> onIceUp()
            PeerConnection.IceConnectionState.DISCONNECTED -> onIceStalled(restart = false)
            PeerConnection.IceConnectionState.FAILED -> onIceStalled(restart = true)
            else -> Unit
        }
    }

    private fun onIceUp() {
        if (!connected) {
            connected = true
            onMediaConnected?.invoke()
            return
        }
        if (!stalled) return
        stalled = false
        signals.emitReconnected(callId, selfId)
        onMediaConnected?.invoke()
    }

    private fun onIceStalled(restart: Boolean) {
        if (!connected) return
        if (!stalled) {
            stalled = true
            // Clampé à la borne du schéma gateway (attempt ≤ 10, Zod) : au-delà
            // la validation rejetterait le signal en silence (fire-and-forget)
            // et le serveur ne saurait plus que l'appel se reconnecte encore.
            reconnectAttempt = minOf(reconnectAttempt + 1, MAX_WIRE_ATTEMPT)
            signals.emitReconnecting(callId, selfId, attempt = reconnectAttempt)
            onMediaStalled?.invoke()
        }
        if (restart) restartIce()
    }

    private companion object {
        /** Borne du schéma gateway `socketReconnectingSchema` (`attempt ≤ 10`). */
        const val MAX_WIRE_ATTEMPT = 10
    }
}
