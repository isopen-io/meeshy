package me.meeshy.sdk.model.call

/**
 * The state an OS-level telecom connection should be reported in for a call
 * phase. Framework-agnostic port of the states an Android
 * `android.telecom.Connection` moves through in a self-managed
 * `ConnectionService` (the Android analogue of the iOS `CXProvider` /
 * `CXCallUpdate` reports the `CallManager` makes to CallKit):
 *
 *  - [Dialing] — an outgoing call placed, not yet answered (`setDialing`).
 *  - [Ringing] — an incoming call alerting, not yet answered (`setRinging`).
 *  - [Active] — the call is answered / in progress (`setActive`); the system
 *    call UI shows the running call. A reconnect stays [Active] — an ICE restart
 *    must never tear the system call down.
 *  - [Disconnected] — terminal (`setDisconnected(cause)` then `destroy()`).
 */
enum class TelecomConnectionState { Dialing, Ringing, Active, Disconnected }

/**
 * Why a telecom connection was disconnected. Framework-agnostic vocabulary the
 * glue maps to `android.telecom.DisconnectCause` codes, ported from the iOS
 * `CXCallEndedReason` mapping in `CallManager`. [Error] covers every
 * non-user-initiated failure (a lost media path or an initiate failure), keeping
 * the system log/recents faithful to *why* the call ended.
 */
enum class TelecomDisconnectCause { Local, Remote, Rejected, Missed, Error, Busy }

/**
 * The single report to push to the telecom layer for one genuine transition:
 * the [state] to move the connection into, plus the [cause] — non-null **iff**
 * [state] is [TelecomConnectionState.Disconnected], null for every live state.
 */
data class TelecomConnectionUpdate(
    val state: TelecomConnectionState,
    val cause: TelecomDisconnectCause? = null,
)

/**
 * The pure, side-effect-free SSOT mapping the call lifecycle → the OS telecom
 * connection reports a self-managed `ConnectionService` must make. It is the
 * Android analogue of the `CXProvider.reportCall(...)` / `report(_:endedAt:)`
 * calls the iOS `CallManager` scatters across its state transitions, collected
 * here into one total function so every branch is unit-tested and the future
 * `ConnectionService` glue is left decision-free.
 *
 * Design choices (documented, keyed purely on [CallState] — no direction leak):
 *  - **Answered = [TelecomConnectionState.Active]** — [CallState.Connecting],
 *    [CallState.Connected] and [CallState.Reconnecting] all map to `Active`. Once
 *    a call is past the ring (the answer has landed — the very edge at which
 *    [CallSoundPolicy] stops the ringback), telecom convention is a single
 *    `setActive`; media negotiation is an internal detail with no distinct
 *    connection state. Collapsing the three onto `Active` also means
 *    `Connecting → Connected` and `Connected → Reconnecting` emit **no** report
 *    ([plan] dedupes), so an ICE restart never tears the system call down.
 *  - **A connection is only disconnected if it was ever created.** A phantom
 *    `Idle → Ended` (a call that never registered a telecom connection — e.g. a
 *    self-fanout push) emits nothing, mirroring [CallSoundPolicy]'s
 *    `previous.isActive` ended-cue guard.
 *  - **[CallState.Idle] has no telecom connection** — [connectionStateFor]
 *    returns `null`, so settling a terminal call back to `Idle` emits no report
 *    (the connection was already `Disconnected` at [CallState.Ended]).
 */
object TelecomCallPolicy {

    /**
     * The telecom connection state for [state], or `null` when no connection
     * exists ([CallState.Idle]). Total over every [CallState].
     */
    fun connectionStateFor(state: CallState): TelecomConnectionState? = when (state) {
        is CallState.Idle -> null
        is CallState.Ringing ->
            if (state.isOutgoing) TelecomConnectionState.Dialing else TelecomConnectionState.Ringing
        is CallState.Offering -> TelecomConnectionState.Dialing
        is CallState.Connecting,
        is CallState.Connected,
        is CallState.Reconnecting,
        -> TelecomConnectionState.Active
        is CallState.Ended -> TelecomConnectionState.Disconnected
    }

    /** The telecom disconnect cause for [reason]. Total over every [CallEndReason]. */
    fun disconnectCauseFor(reason: CallEndReason): TelecomDisconnectCause = when (reason) {
        is CallEndReason.Local -> TelecomDisconnectCause.Local
        is CallEndReason.Remote -> TelecomDisconnectCause.Remote
        is CallEndReason.Rejected -> TelecomDisconnectCause.Rejected
        is CallEndReason.Missed -> TelecomDisconnectCause.Missed
        is CallEndReason.ConnectionLost -> TelecomDisconnectCause.Error
        is CallEndReason.Failed -> TelecomDisconnectCause.Error
    }

    /**
     * The telecom report (if any) for the [previous] → [next] transition. Returns
     * `null` when the transition warrants no report:
     *  - [next] has no telecom connection ([CallState.Idle]);
     *  - the connection state does not genuinely change (dedupe — e.g.
     *    `Connecting → Connected`, `Connected → Reconnecting`, `Ended → Ended`);
     *  - a disconnect of a connection that was never created (phantom
     *    `Idle → Ended`).
     */
    fun plan(previous: CallState, next: CallState): TelecomConnectionUpdate? {
        val to = connectionStateFor(next) ?: return null
        val from = connectionStateFor(previous)
        if (to == from) return null
        if (to == TelecomConnectionState.Disconnected) {
            if (from == null) return null
            return TelecomConnectionUpdate(to, disconnectCauseFor((next as CallState.Ended).reason))
        }
        return TelecomConnectionUpdate(to)
    }
}
