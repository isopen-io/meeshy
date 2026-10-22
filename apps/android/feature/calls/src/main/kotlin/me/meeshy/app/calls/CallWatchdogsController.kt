package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * The guards that keep a call honest, each one armed by the FSM phase and
 * disarmed by any other:
 *
 *  - the **heartbeat** — without it a dead device is indistinguishable from a
 *    live one server-side and zombie calls linger until the 2 h GC;
 *  - the **reconnect budget** — one window per DISTINCT Reconnecting state (an
 *    attempt bump re-arms), escalating to the next attempt or to
 *    `Ended(ConnectionLost)`;
 *  - the **connect watchdog** — ONE continuous window over Offering ∪ Connecting,
 *    the last unbounded hole after answering.
 *
 * Extracted from the [CallViewModel] with no change of behaviour. An expiry
 * that ends the call carries the same duty as a hang-up: the wire and the media
 * must learn of the teardown or the peer stays in a zombie call.
 */
class CallWatchdogsController @Inject constructor(
    private val signals: CallSignalManager,
    private val coordinator: WebRtcCallCoordinator,
    private val heartbeatTicker: CallHeartbeatTicker,
    private val reconnectBudget: CallReconnectBudget,
    private val connectingWatchdog: CallConnectingWatchdog,
) {
    private var host: CallSessionHost? = null

    /** Emits `call:heartbeat` each beat; alive only while media is flowing. */
    private var heartbeatJob: Job? = null

    /** The armed per-attempt reconnection window; escalates ReconnectFailed on expiry. */
    private var reconnectBudgetJob: Job? = null

    /** The exact Reconnecting state the window was armed for — an attempt bump re-arms. */
    private var reconnectBudgetArmedFor: CallState? = null

    /** One continuous connect window over Offering∪Connecting; fails the call on expiry. */
    private var connectingWatchdogJob: Job? = null

    fun attach(host: CallSessionHost) {
        this.host = host
    }

    /** The FSM moved: arm what the new phase needs, disarm what it does not. */
    fun onTransition(next: CallState) {
        syncHeartbeat(next)
        syncReconnectBudget(next)
        syncConnectingWatchdog(next)
    }

    /** A new call begins: no window of the previous one may survive. */
    fun reset() {
        stopReconnectBudget()
        stopConnectingWatchdog()
    }

    /**
     * Emits the gateway liveness heartbeat exactly while media is (or is being
     * re-)established — same window as the clock and quality jobs.
     */
    private fun syncHeartbeat(state: CallState) {
        if (state.carriesMedia) startHeartbeatIfNeeded() else stopHeartbeat()
    }

    private fun startHeartbeatIfNeeded() {
        val host = host ?: return
        if (heartbeatJob != null) return
        heartbeatJob = host.scope.launch {
            heartbeatTicker.beats.collect {
                if (host.callId.isNotBlank()) signals.emitHeartbeat(host.callId)
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * Arms one [CallReconnectBudget] window per DISTINCT Reconnecting state and
     * tears it down on any other phase. Without this watchdog nothing ever fired
     * [CallEvent.ReconnectFailed]: a stall that never recovered left the user on
     * « Reconnexion… » forever (iOS parity: the `.reconnecting` watchdog, 10 s ×
     * 3 attempts ≈ 30 s bounded before `connectionLost`).
     */
    private fun syncReconnectBudget(state: CallState) {
        val host = host ?: return
        if (state !is CallState.Reconnecting) {
            stopReconnectBudget()
            return
        }
        if (state == reconnectBudgetArmedFor) return
        reconnectBudgetArmedFor = state
        reconnectBudgetJob?.cancel()
        reconnectBudgetJob = host.scope.launch {
            reconnectBudget.countdown().collect {
                onReconnectBudgetExpired(host)
            }
        }
    }

    /**
     * Escalate: the FSM either bumps to the next attempt — nudged by a fresh ICE
     * restart, covering the DISCONNECTED-forever stall that never turns FAILED —
     * or ends the call `connectionLost`, which must ALSO reach the wire and tear
     * the media down (same duty as a hang-up).
     */
    private fun onReconnectBudgetExpired(host: CallSessionHost) {
        host.dispatch(CallEvent.ReconnectFailed)
        if (host.callState is CallState.Ended) {
            if (host.callId.isNotBlank()) signals.emitEnd(host.callId)
            coordinator.end()
        } else {
            coordinator.retryIceRestart()
        }
    }

    private fun stopReconnectBudget() {
        reconnectBudgetJob?.cancel()
        reconnectBudgetJob = null
        reconnectBudgetArmedFor = null
    }

    /**
     * One CONTINUOUS window over the whole Offering∪Connecting stretch (an
     * Offering → Connecting transition never re-arms): an answered call whose ICE
     * never established sat on « Connexion… » forever, since the server's ring
     * timeout stops applying once answered and heartbeats only start in Connected.
     */
    private fun syncConnectingWatchdog(state: CallState) {
        val host = host ?: return
        val connecting = state is CallState.Offering || state is CallState.Connecting
        if (!connecting) {
            stopConnectingWatchdog()
            return
        }
        if (connectingWatchdogJob != null) return
        connectingWatchdogJob = host.scope.launch {
            connectingWatchdog.countdown().collect {
                host.dispatch(CallEvent.ConnectionFailed(CONNECT_TIMED_OUT))
                if (host.callId.isNotBlank()) signals.emitEnd(host.callId)
                coordinator.end()
            }
        }
    }

    private fun stopConnectingWatchdog() {
        connectingWatchdogJob?.cancel()
        connectingWatchdogJob = null
    }

    private companion object {
        const val CONNECT_TIMED_OUT = "connect timed out"
    }
}
