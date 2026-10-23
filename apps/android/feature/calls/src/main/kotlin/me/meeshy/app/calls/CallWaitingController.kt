package me.meeshy.app.calls

import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallWaitingEvent
import me.meeshy.sdk.model.call.CallWaitingReducer
import me.meeshy.sdk.model.call.CallWaitingState
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * Owns call waiting: a second incoming call while this one is active. It holds
 * the [CallWaitingState] (at most one pending call), the 15 s auto-dismiss timer
 * of the banner, and the two ways out of it — reject (end the waiting call on
 * the wire, keep this one) and accept (hand the pending call back to the host,
 * which ends this call and re-presents the waiting one).
 *
 * Extracted from the [CallViewModel] with no change of behaviour; every decision
 * is still the pure [CallWaitingReducer]'s.
 */
class CallWaitingController @Inject constructor(
    private val signals: CallSignalManager,
    private val timer: CallWaitingTimer,
    private val haptics: CallHaptics,
) {
    /** The pending-call slice republished by the host after every change. */
    var state: CallWaitingState = CallWaitingState.EMPTY
        private set

    private var host: CallSessionHost? = null

    /** The 15 s auto-dismiss timer for the current banner; cancelled on any resolution. */
    private var timerJob: Job? = null

    /** Start listening to second incoming offers in the host's scope. */
    fun attach(host: CallSessionHost) {
        this.host = host
        host.scope.launch { signals.incomingOffers.collect(::onIncomingOffer) }
    }

    /** A new call begins: forget any banner of the previous one (the host publishes). */
    fun reset() {
        state = CallWaitingState.EMPTY
        stopTimer()
    }

    /**
     * Reject the waiting call: end it on the wire (keyed by its own id, leaving
     * the active call untouched) and dismiss the banner. Also the resolution the
     * 15 s auto-dismiss reuses — an ignored banner must free the caller, not
     * leave them ringing.
     */
    fun reject() {
        val pending = state.pending ?: return
        stopTimer()
        haptics.play(CallHapticKind.Light)
        end(pending)
    }

    /**
     * End-this-and-answer, first half: dismiss the banner and hand back the
     * waiting call, or `null` when none is pending. The host hangs up the active
     * call and re-presents the returned one as a fresh incoming call.
     */
    fun accept(): WaitingCall? {
        val pending = state.pending ?: return null
        stopTimer()
        haptics.play(CallHapticKind.Light)
        reduce(CallWaitingEvent.Accepted)
        return pending
    }

    /**
     * A call ended remotely. When it is the WAITING call's, its caller hung up
     * (or the ring timed out) before the user chose: the banner is dismissed and
     * its auto-reject timer cancelled **without** an `emitEnd` — nothing is left
     * to end once the caller has gone. Any other id is inert.
     */
    fun onRemotelyEnded(callId: String) {
        val pending = state.pending ?: return
        if (pending.callId != callId) return
        stopTimer()
        reduce(CallWaitingEvent.RemotelyEnded(callId))
    }

    /**
     * A second incoming offer arrived on the socket. It becomes a call-waiting
     * banner **only** while a call is already active (parity with iOS busy-path)
     * and only for a *different* call than the one in progress — a redelivery of
     * the active call's own offer is ignored. A newer offer replaces an older
     * pending one and restarts the auto-dismiss window; the displaced caller is refused on the
     * wire so it never keeps ringing for a banner that no longer exists.
     */
    private fun onIncomingOffer(call: WaitingCall) {
        val host = host ?: return
        if (!host.callState.isActive) return
        if (call.callId == host.callId) return
        CallWaitingReducer.displacedBy(state, call)?.let { displaced ->
            signals.emitEnd(displaced.callId, reason = END_REASON_REJECTED)
        }
        if (state.pending?.callId != call.callId) haptics.play(CallHapticKind.Light)
        reduce(CallWaitingEvent.Offered(call))
        startTimer(host, call.callId)
    }

    private fun end(pending: WaitingCall) {
        signals.emitEnd(pending.callId, reason = END_REASON_REJECTED)
        reduce(CallWaitingEvent.Rejected)
    }

    private fun startTimer(host: CallSessionHost, offeredId: String) {
        timerJob?.cancel()
        timerJob = host.scope.launch {
            timer.countdown().collect {
                val pending = state.pending ?: return@collect
                if (pending.callId != offeredId) return@collect
                // The single-shot countdown completes right after this — mark the
                // job done so `end` never cancels the coroutine it runs in.
                timerJob = null
                end(pending)
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    private fun reduce(event: CallWaitingEvent) {
        state = CallWaitingReducer.reduce(state, event)
        host?.publish()
    }
}
