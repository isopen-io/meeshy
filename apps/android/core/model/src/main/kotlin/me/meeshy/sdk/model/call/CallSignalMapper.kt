package me.meeshy.sdk.model.call

import kotlinx.serialization.json.Json

/**
 * Pure mapper: an inbound `call:*` Socket.IO frame → the [CallEvent] the
 * [CallStateMachine] understands, or `null` when the frame is inert to the FSM
 * (plumbing such as ICE candidates / renegotiation offers / media-toggles) or
 * cannot be decoded.
 *
 * Faithful to the iOS `MessageSocketManager` listen table: `call:initiated`,
 * `call:signal` (offer|answer|ice-candidate), `call:participant-joined`,
 * `call:ended`, `call:missed`, `call:media-toggled`, `call:error`,
 * `call:already-answered`. Total and side-effect-free — an unknown event name,
 * an unhandled signal type, or a malformed payload all yield `null` so a bad
 * frame can never crash or drive an illegal transition.
 */
object CallSignalMapper {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun map(eventName: String, rawJson: String): CallEvent? = runCatching {
        when (eventName) {
            "call:initiated" -> {
                json.decodeFromString<CallInitiatedPayload>(rawJson)
                CallEvent.ReceiveIncoming
            }
            "call:participant-joined" -> {
                json.decodeFromString<CallParticipantPayload>(rawJson)
                CallEvent.ParticipantJoined
            }
            "call:signal" -> mapSignal(json.decodeFromString<CallSignalEnvelope>(rawJson))
            "call:ended" -> mapEnded(json.decodeFromString<CallEndedPayload>(rawJson))
            "call:missed" -> {
                json.decodeFromString<CallMissedPayload>(rawJson)
                CallEvent.RingTimeout
            }
            "call:media-toggled" -> {
                json.decodeFromString<CallMediaTogglePayload>(rawJson)
                null
            }
            "call:error" -> mapError(json.decodeFromString<CallErrorPayload>(rawJson))
            "call:already-answered" -> {
                json.decodeFromString<CallAlreadyAnsweredPayload>(rawJson)
                CallEvent.RemoteHangUp
            }
            else -> null
        }
    }.getOrNull()

    /**
     * Decode the **identity** of an inbound `call:initiated` frame into a
     * [WaitingCall], or `null` when the frame is malformed or carries no call id.
     *
     * The FSM-facing [map] deliberately discards identity ([CallEvent.ReceiveIncoming]
     * carries none); this parallel, side-effect-free decode surfaces the caller +
     * media so a *second* incoming call arriving while busy can be rendered as a
     * call-waiting banner (and rejected / answered by its own id).
     */
    fun incomingOffer(rawJson: String): WaitingCall? = runCatching {
        WaitingCall.from(json.decodeFromString<CallInitiatedPayload>(rawJson))
    }.getOrNull()

    /**
     * Decode the **identity** of an inbound teardown frame (`call:ended` /
     * `call:missed`) into the id of the call that ended, or `null` when the frame
     * is not a teardown, is malformed, or carries no (blank) call id.
     *
     * The FSM-facing [map] routes both frames to identity-less events
     * ([CallEvent.RemoteHangUp] / [CallEvent.RingTimeout]); this parallel, total,
     * side-effect-free decode surfaces the ended call's id so a call-waiting banner
     * whose caller hangs up (or whose ring times out) before the user acts can be
     * auto-dismissed via [CallWaitingEvent.RemotelyEnded] — keyed by the id, so an
     * unrelated teardown never dismisses the wrong banner.
     */
    fun endedCallId(eventName: String, rawJson: String): String? = runCatching {
        when (eventName) {
            "call:ended" -> json.decodeFromString<CallEndedPayload>(rawJson).callId
            "call:missed" -> json.decodeFromString<CallMissedPayload>(rawJson).callId
            else -> null
        }?.takeIf { it.isNotBlank() }
    }.getOrNull()

    /**
     * Only the callee's SDP `answer` advances the FSM (Offering → Connecting).
     * Renegotiation `offer`s and `ice-candidate`s are WebRTC plumbing — inert to
     * the phase machine.
     */
    private fun mapSignal(envelope: CallSignalEnvelope): CallEvent? =
        when (envelope.signal.type) {
            "answer" -> CallEvent.RemoteAnswer
            else -> null
        }

    /**
     * The FSM has no distinct remote-reject/failed event, so every remote
     * teardown except a ring-timeout maps to [CallEvent.RemoteHangUp]; a
     * `missed` reason maps to [CallEvent.RingTimeout] (parity with the dedicated
     * `call:missed` event the gateway emits alongside).
     */
    private fun mapEnded(payload: CallEndedPayload): CallEvent =
        when (payload.reason) {
            "missed" -> CallEvent.RingTimeout
            else -> CallEvent.RemoteHangUp
        }

    private fun mapError(payload: CallErrorPayload): CallEvent =
        CallEvent.ConnectionFailed(payload.message ?: payload.code ?: "Call error")
}
