package me.meeshy.sdk.model.call

/**
 * The banner-lifecycle state for the call-waiting scenario: at most one [pending]
 * second incoming call awaiting the user's accept-swap or reject. There is never
 * more than one — a newer offer replaces the older (see [CallWaitingReducer]),
 * mirroring the iOS `CallManager.pendingIncomingCall` single slot.
 */
data class CallWaitingState(val pending: WaitingCall? = null) {
    /** The banner is shown iff a second call is pending. */
    val isBannerVisible: Boolean get() = pending != null

    companion object {
        val EMPTY: CallWaitingState = CallWaitingState(pending = null)
    }
}

/**
 * Drives [CallWaitingReducer]. Faithful to the iOS `CallManager` pending-call
 * table (`rejectPendingCall` / `endCurrentAndAnswerPending` /
 * `clearPendingIncomingCall(ifMatching:)` + the 15 s auto-dismiss-as-reject).
 */
sealed interface CallWaitingEvent {
    /**
     * A second call arrived while a call is already active — show, or replace,
     * the banner. Newest wins (parity with iOS reassigning `pendingIncomingCall`).
     */
    data class Offered(val call: WaitingCall) : CallWaitingEvent

    /** User tapped *Refuser*, or the auto-dismiss window elapsed — clear the banner. */
    data object Rejected : CallWaitingEvent

    /** User tapped *Répondre* (end current & answer) — clear the banner. */
    data object Accepted : CallWaitingEvent

    /**
     * The waiting call's caller hung up, or it was answered on another device —
     * clear the banner **only** when the ended id matches the pending one, so an
     * unrelated `call:ended` (e.g. for the still-active call) never dismisses it.
     */
    data class RemotelyEnded(val callId: String) : CallWaitingEvent
}

/**
 * Pure, total reducer for the call-waiting banner: `(state, event) -> state`.
 * Side-effect-free — the ViewModel performs the reject/answer emits *around* this
 * transition. Every event maps to a defined next state; a [RemotelyEnded] whose id
 * does not match the pending call (or that arrives with no pending call) is inert.
 */
object CallWaitingReducer {
    fun reduce(state: CallWaitingState, event: CallWaitingEvent): CallWaitingState = when (event) {
        is CallWaitingEvent.Offered -> CallWaitingState(pending = event.call)
        CallWaitingEvent.Rejected -> CallWaitingState.EMPTY
        CallWaitingEvent.Accepted -> CallWaitingState.EMPTY
        is CallWaitingEvent.RemotelyEnded ->
            if (state.pending?.callId == event.callId) CallWaitingState.EMPTY else state
    }
}
