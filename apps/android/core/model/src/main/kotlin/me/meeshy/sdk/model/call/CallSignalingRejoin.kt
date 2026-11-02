package me.meeshy.sdk.model.call

/** What the call in flight said of its media, to say again when the signalling socket comes back. */
data class CallRejoinMedia(val isMuted: Boolean, val isCameraOn: Boolean)

/** One thing a rejoined call does, in the order [CallSignalingRejoinLaw.plan] lists them. */
sealed interface CallRejoinStep {
    /** The gateway ended the call while the socket was down: settle it. */
    data class End(val event: CallEvent) : CallRejoinStep

    /** `call:toggle-video`: the peer sees my camera again. */
    data class AnnounceVideo(val enabled: Boolean) : CallRejoinStep

    /** `call:toggle-audio`: the peer hears my microphone state again. */
    data class AnnounceAudio(val enabled: Boolean) : CallRejoinStep

    /** The fresh TURN credentials the join ACK carries, applied mid-call. */
    data class RefreshIceServers(val servers: List<SocketIceServer>) : CallRejoinStep
}

/**
 * The return of the signalling socket during a call (#13765), iOS `CallSignalingRouter.observeSocketReconnect`.
 * The gateway takes a dropped socket out of the call room and forgets its media; on its return the call joins
 * again WITH the ACK (room membership confirmed before anything else is emitted, fresh per-user TURN set in the
 * ACK — never a separate `call:request-ice-servers`), then says its camera and microphone again. The media path
 * itself is the ICE restart's business, and the screen share re-announces itself (#13736).
 */
object CallSignalingRejoinLaw {
    const val CALL_ENDED = "CALL_ENDED"

    /** A return is a dropped socket coming back; the first connection is not one. */
    fun returns(wasConnected: Boolean?, isConnected: Boolean): Boolean = wasConnected == false && isConnected

    /**
     * A call this device is in the room of. A ringing callee has not joined yet (Android joins on answer, the
     * preview never makes it a participant): joining for it would answer the call on every other device.
     */
    fun rejoins(state: CallState, callId: String): Boolean =
        callId.isNotBlank() && state.isActive && state != CallState.Ringing(isOutgoing = false)

    /**
     * What follows the join ACK. A call already ended server-side settles with its real cause (a transient one
     * keeps « Réessayer »); any other refusal or silence proceeds anyway, as iOS. A camera that is off is not
     * announced, and the microphone always is — it overwrites whatever the peer believed.
     */
    fun plan(result: CallJoinResult, media: CallRejoinMedia): List<CallRejoinStep> {
        if (result is CallJoinResult.Failure && result.code == CALL_ENDED) {
            return listOf(CallRejoinStep.End(CallSignalMapper.endedEvent(result.endReason)))
        }
        val servers = (result as? CallJoinResult.Success)?.iceServers.orEmpty()
        return listOfNotNull(
            CallRejoinStep.AnnounceVideo(enabled = true).takeIf { media.isCameraOn },
            CallRejoinStep.AnnounceAudio(enabled = !media.isMuted),
            CallRejoinStep.RefreshIceServers(servers).takeIf { servers.isNotEmpty() },
        )
    }
}
