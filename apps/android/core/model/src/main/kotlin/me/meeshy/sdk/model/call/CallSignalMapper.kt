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
