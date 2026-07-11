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
                val payload = json.decodeFromString<CallParticipantPayload>(rawJson)
                CallEvent.ParticipantJoined(payload.participant?.userId)
            }
            "call:signal" -> mapSignal(json.decodeFromString<CallSignalEnvelope>(rawJson))
            // `call:ended` / `call:missed` are **identity-gated** teardown — decoded
            // by [endedSignal], not folded here. They are inert to the identity-less
            // FSM-facing stream so a *waiting* call's teardown (fanned out to a busy
            // user's rooms) can never blindly reduce the *active* call.
            "call:ended", "call:missed" -> null
            "call:media-toggled" -> {
                json.decodeFromString<CallMediaTogglePayload>(rawJson)
                null
            }
            "call:error" -> mapError(json.decodeFromString<CallErrorPayload>(rawJson))
            "call:already-answered" -> {
                json.decodeFromString<CallAlreadyAnsweredPayload>(rawJson)
                CallEvent.RemoteHangUp
            }
            // Group/UX side-channels — decoded by the dedicated parallel decodes
            // ([participantLeft]/[qualityAlert]/[screenCaptureAlert]/[translatedSegment]),
            // inert to the 1:1 FSM: a participant leaving is not a teardown
            // (`call:ended` is), and quality/capture/caption frames never drive a
            // phase transition.
            "call:participant-left", "call:quality-alert",
            "call:screen-capture-alert", "call:translated-segment",
            -> null
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
     * Decode a `call:signal` frame into its full [CallSignalEnvelope] — the SDP or
     * ICE payload the WebRTC engine consumes. The FSM-facing [map] keeps only a
     * marker (and drops offers/candidates); this parallel, total, side-effect-free
     * decode is the WebRTC data path. `null` on a malformed frame.
     */
    fun signalEnvelope(rawJson: String): CallSignalEnvelope? = runCatching {
        json.decodeFromString<CallSignalEnvelope>(rawJson)
    }.getOrNull()

    /**
     * Decode a `call:ice-servers-refreshed` frame into the fresh STUN/TURN servers
     * the callee's WebRTC engine needs (the caller already has them from the
     * initiate ACK). `null` on a malformed frame.
     */
    fun iceServersRefreshed(rawJson: String): List<SocketIceServer>? = runCatching {
        json.decodeFromString<IceServersRefreshedPayload>(rawJson).iceServers
    }.getOrNull()

    /**
     * Decode an inbound teardown frame (`call:ended` / `call:missed`) into the
     * identity-carrying [CallEndedSignal] — the ended call's id plus the
     * [CallEvent] the FSM reduces iff that id is the *active* call's — or `null`
     * when the frame is not a teardown, is malformed, or carries no (blank) id.
     *
     * The FSM-facing [map] deliberately returns `null` for both frames; this
     * parallel, total, side-effect-free decode is the **only** teardown path, so
     * the consumer can gate the FSM teardown on the active id (only the active
     * call's own end reduces it) while dismissing a call-waiting banner keyed by
     * the *waiting* call's id via [CallWaitingEvent.RemotelyEnded]. A blank/absent
     * id yields `null` — an untargetable teardown is dropped, never applied to an
     * arbitrary call.
     */
    fun endedSignal(eventName: String, rawJson: String): CallEndedSignal? = runCatching {
        when (eventName) {
            "call:ended" -> {
                val payload = json.decodeFromString<CallEndedPayload>(rawJson)
                payload.callId.takeIf { it.isNotBlank() }?.let { CallEndedSignal(it, endedEvent(payload)) }
            }
            "call:missed" -> {
                val payload = json.decodeFromString<CallMissedPayload>(rawJson)
                payload.callId.takeIf { it.isNotBlank() }?.let { CallEndedSignal(it, CallEvent.RingTimeout) }
            }
            else -> null
        }
    }.getOrNull()

    /**
     * Decode a `call:participant-left` frame — a participant left the room
     * without ending the call (group calls; a 1:1 teardown rides `call:ended`).
     * `null` on a malformed frame or a blank call id, so an untargetable roster
     * change is dropped rather than applied to an arbitrary call.
     */
    fun participantLeft(rawJson: String): CallParticipantLeftPayload? = runCatching {
        json.decodeFromString<CallParticipantLeftPayload>(rawJson).takeIf { it.callId.isNotBlank() }
    }.getOrNull()

    /**
     * Decode a `call:quality-alert` frame — the gateway flagging the REMOTE
     * peer's sustained bad network. `null` on a malformed frame or a blank
     * call id (the indicator is gated on the active call's id).
     */
    fun qualityAlert(rawJson: String): CallQualityAlertPayload? = runCatching {
        json.decodeFromString<CallQualityAlertPayload>(rawJson).takeIf { it.callId.isNotBlank() }
    }.getOrNull()

    /**
     * Decode a `call:screen-capture-alert` frame — the remote peer
     * starting/stopping a screen capture of the call. A frame missing the
     * `isCapturing` flag fails to decode (it IS the signal); `null` then, and on
     * a blank call id.
     */
    fun screenCaptureAlert(rawJson: String): CallScreenCaptureAlertPayload? = runCatching {
        json.decodeFromString<CallScreenCaptureAlertPayload>(rawJson).takeIf { it.callId.isNotBlank() }
    }.getOrNull()

    /**
     * Decode a `call:translated-segment` frame — a live caption from the remote
     * speaker, translated server-side when available. A frame missing the
     * segment or its `text` fails to decode; `null` then, and on a blank call id.
     */
    fun translatedSegment(rawJson: String): CallTranslatedSegmentPayload? = runCatching {
        json.decodeFromString<CallTranslatedSegmentPayload>(rawJson).takeIf { it.callId.isNotBlank() }
    }.getOrNull()

    /**
     * Decode a `call:media-toggled` frame — the remote peer muting/unmuting the
     * mic or turning the camera off/on. Inert to the FSM ([map] keeps returning
     * `null`); this parallel, total, side-effect-free decode feeds the "peer is
     * muted / camera off" indicators (iOS parity: `callMediaToggled` →
     * `isRemoteAudioEnabled`/`isRemoteVideoEnabled`). `null` on a malformed
     * frame or a blank call id.
     */
    fun mediaToggle(rawJson: String): CallMediaTogglePayload? = runCatching {
        json.decodeFromString<CallMediaTogglePayload>(rawJson).takeIf { it.callId.isNotBlank() }
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
     * teardown except a ring-timeout carries [CallEvent.RemoteHangUp]; a
     * `missed` reason carries [CallEvent.RingTimeout] (parity with the dedicated
     * `call:missed` event the gateway emits alongside).
     */
    private fun endedEvent(payload: CallEndedPayload): CallEvent =
        when (payload.reason) {
            "missed" -> CallEvent.RingTimeout
            else -> CallEvent.RemoteHangUp
        }

    private fun mapError(payload: CallErrorPayload): CallEvent =
        CallEvent.ConnectionFailed(payload.message ?: payload.code ?: "Call error")
}
