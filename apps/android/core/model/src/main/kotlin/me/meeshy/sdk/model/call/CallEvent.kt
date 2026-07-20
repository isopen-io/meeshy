package me.meeshy.sdk.model.call

/**
 * The inputs that drive [CallStateMachine]. Each event corresponds to a real
 * trigger in the iOS `CallManager` lifecycle — a local user action, a signalling
 * message from the peer/server, or a timer/watchdog firing — decoupled from the
 * transport that will later raise it.
 */
sealed interface CallEvent {
    /** Local user places a call (`call:initiate`). */
    data object StartOutgoing : CallEvent

    /** An incoming-call offer arrives while idle (`call:offer` / VoIP push). */
    data object ReceiveIncoming : CallEvent

    /**
     * Outgoing: the callee joined the room (`call:participant-joined`); send the offer.
     * Carries the joiner's [peerId] (their userId) so the caller can address its SDP
     * offer + ICE `to` field at them — an outgoing call has no peerId threaded through
     * the route, so this is where the caller first learns who to answer.
     */
    data class ParticipantJoined(val peerId: String? = null) : CallEvent

    /** Incoming: the local user taps Accept (`call:answer` is sent). */
    data object LocalAnswer : CallEvent

    /** Outgoing: the callee's SDP answer arrives (`call:signal-answer`). */
    data object RemoteAnswer : CallEvent

    /** RTC connection established / media flowing (post RTP gate). */
    data object MediaConnected : CallEvent

    /** Connected: the media path stalled (half-open) or the network changed. */
    data object ConnectionStalled : CallEvent

    /** Reconnecting: the current ICE-restart attempt's budget elapsed. */
    data object ReconnectFailed : CallEvent

    /** Incoming: the local user declines (`call:reject`). */
    data object Reject : CallEvent

    /** Local user hangs up (`call:end-with-ack`). */
    data object LocalHangUp : CallEvent

    /** The peer ended the call (`call:ended` reason local/remote). */
    data object RemoteHangUp : CallEvent

    /** Ringing timed out with no answer (`call:missed`). */
    data object RingTimeout : CallEvent

    /** A non-recoverable setup/connection failure, carrying the error detail. */
    data class ConnectionFailed(val message: String) : CallEvent

    /** Terminal settle window elapsed; return to idle. */
    data object Settle : CallEvent
}
