package me.meeshy.sdk.model.call

/**
 * Why a call ended. Faithful port of iOS `CallEndReason`
 * (`WebRTCTypes.swift`). `Failed` carries the originating error message exactly
 * as iOS's `failed(String)` does.
 */
sealed interface CallEndReason {
    data object Local : CallEndReason
    data object Remote : CallEndReason
    data object Rejected : CallEndReason
    data object Missed : CallEndReason
    data object ConnectionLost : CallEndReason
    data class Failed(val message: String) : CallEndReason
}

/**
 * The phase of a 1:1 call. Faithful port of iOS `CallState`
 * (`CallManager.swift`): the lifecycle every call moves through, independent of
 * the WebRTC plumbing that will later drive it.
 *
 * Phase only — media type (audio/video) and mute/camera intent are separate
 * concerns that ride alongside the state, never inside it (matching iOS).
 */
sealed interface CallState {
    /** No call. The only state from which a new call may start. */
    data object Idle : CallState

    /** Ringing. [isOutgoing] distinguishes the caller's wait from the callee's incoming alert. */
    data class Ringing(val isOutgoing: Boolean) : CallState

    /** Outgoing only: the peer has joined and the SDP offer is out, awaiting the answer. */
    data object Offering : CallState

    /** ICE/DTLS negotiating; media is not yet flowing. */
    data object Connecting : CallState

    /** RTC connected, media flowing. */
    data object Connected : CallState

    /** Media path lost; an ICE restart is in progress. [attempt] is 1-based. */
    data class Reconnecting(val attempt: Int) : CallState

    /** Terminal. [reason] explains the termination. */
    data class Ended(val reason: CallEndReason) : CallState

    /** Active = a live call: every state except [Idle] and [Ended]. */
    val isActive: Boolean
        get() = this !is Idle && this !is Ended

    val isRinging: Boolean
        get() = this is Ringing

    val isEnded: Boolean
        get() = this is Ended

    /** A new call may only be started from [Idle]. */
    val canStart: Boolean
        get() = this is Idle
}
