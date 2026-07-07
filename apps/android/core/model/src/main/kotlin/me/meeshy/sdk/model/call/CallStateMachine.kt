package me.meeshy.sdk.model.call

/**
 * The pure call-lifecycle reducer: `(state, event) -> state`. The single source
 * of truth for legal call transitions, faithfully mirroring the iOS
 * `CallManager` transition table.
 *
 * Total and side-effect-free: every (state, event) pair yields a state, and an
 * event that does not apply to the current phase is **inert** — the same state
 * is returned. Terminal [CallState.Ended] only leaves via [CallEvent.Settle], so
 * the machine always settles and never loops.
 */
object CallStateMachine {

    /** iOS caps reconnection at 3 ICE-restart attempts before giving up. */
    const val DEFAULT_MAX_RECONNECT_ATTEMPTS = 3

    fun reduce(
        state: CallState,
        event: CallEvent,
        maxReconnectAttempts: Int = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    ): CallState = when (state) {
        is CallState.Idle -> reduceIdle(event)
        is CallState.Ringing -> reduceRinging(state, event)
        is CallState.Offering -> reduceOffering(event)
        is CallState.Connecting -> reduceConnecting(event)
        is CallState.Connected -> reduceConnected(event)
        is CallState.Reconnecting -> reduceReconnecting(state, event, maxReconnectAttempts)
        is CallState.Ended -> reduceEnded(state, event)
    }

    /** Local hang-up / remote end / hard failure — legal from any active phase. */
    private fun terminal(event: CallEvent): CallState? = when (event) {
        CallEvent.LocalHangUp -> CallState.Ended(CallEndReason.Local)
        CallEvent.RemoteHangUp -> CallState.Ended(CallEndReason.Remote)
        is CallEvent.ConnectionFailed -> CallState.Ended(CallEndReason.Failed(event.message))
        else -> null
    }

    private fun reduceIdle(event: CallEvent): CallState = when (event) {
        CallEvent.StartOutgoing -> CallState.Ringing(isOutgoing = true)
        CallEvent.ReceiveIncoming -> CallState.Ringing(isOutgoing = false)
        else -> CallState.Idle
    }

    private fun reduceRinging(state: CallState.Ringing, event: CallEvent): CallState = when (event) {
        is CallEvent.ParticipantJoined -> if (state.isOutgoing) CallState.Offering else state
        CallEvent.LocalAnswer -> if (state.isOutgoing) state else CallState.Connecting
        CallEvent.Reject -> if (state.isOutgoing) state else CallState.Ended(CallEndReason.Rejected)
        CallEvent.RingTimeout -> CallState.Ended(CallEndReason.Missed)
        else -> terminal(event) ?: state
    }

    private fun reduceOffering(event: CallEvent): CallState = when (event) {
        CallEvent.RemoteAnswer -> CallState.Connecting
        else -> terminal(event) ?: CallState.Offering
    }

    private fun reduceConnecting(event: CallEvent): CallState = when (event) {
        CallEvent.MediaConnected -> CallState.Connected
        else -> terminal(event) ?: CallState.Connecting
    }

    private fun reduceConnected(event: CallEvent): CallState = when (event) {
        CallEvent.ConnectionStalled -> CallState.Reconnecting(attempt = 1)
        else -> terminal(event) ?: CallState.Connected
    }

    private fun reduceReconnecting(
        state: CallState.Reconnecting,
        event: CallEvent,
        maxReconnectAttempts: Int,
    ): CallState = when (event) {
        CallEvent.MediaConnected -> CallState.Connected
        CallEvent.ReconnectFailed ->
            if (state.attempt >= maxReconnectAttempts) {
                CallState.Ended(CallEndReason.ConnectionLost)
            } else {
                CallState.Reconnecting(attempt = state.attempt + 1)
            }
        else -> terminal(event) ?: state
    }

    private fun reduceEnded(state: CallState.Ended, event: CallEvent): CallState = when (event) {
        CallEvent.Settle -> CallState.Idle
        else -> state
    }
}
