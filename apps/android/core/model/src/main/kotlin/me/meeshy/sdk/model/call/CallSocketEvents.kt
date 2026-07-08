package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable

/**
 * Kotlin payload types for the inbound `call:*` Socket.IO events, at parity with
 * the iOS `MessageSocketManager` listen table (`MessageSocketManager.swift`).
 * Faithful field names mirror the gateway wire format so a frame decodes 1:1.
 *
 * These are pure data carriers. The decision of "which frame becomes which
 * [CallEvent]" lives in [CallSignalMapper] — the single tested source of truth.
 *
 * Unknown/extra keys are tolerated by the mapper's lenient `Json`; only the
 * fields required to identify a call are non-nullable, so a frame missing them
 * fails to decode and is treated as inert rather than mapped.
 */

/** Nested SDP/ICE signal carried by `call:signal`. `type` ∈ offer|answer|ice-candidate. */
@Serializable
data class CallSignalPayload(
    val type: String,
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMLineIndex: Int? = null,
    val sdpMid: String? = null,
    val from: String? = null,
    val to: String? = null,
    val negotiationId: Int? = null,
)

/** `call:initiated` — an incoming-call offer arriving on the callee's sockets. */
@Serializable
data class CallInitiatedPayload(
    val callId: String,
    val conversationId: String? = null,
    /** Architecture mode (`"p2p"`/`"sfu"`), NOT the media type. */
    val mode: String? = null,
    /** Media type (`"audio"`/`"video"`); absence is treated as audio. */
    val type: String? = null,
    val initiator: CallInitiatorInfo? = null,
)

@Serializable
data class CallInitiatorInfo(
    val userId: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)

/** `call:signal` — the SDP/ICE envelope. */
@Serializable
data class CallSignalEnvelope(
    val callId: String,
    val signal: CallSignalPayload,
)

/** `call:ice-servers-refreshed` — fresh STUN/TURN servers for the WebRTC engine. */
@Serializable
data class IceServersRefreshedPayload(
    val callId: String? = null,
    val iceServers: List<SocketIceServer> = emptyList(),
    val ttl: Int? = null,
)

/** `call:participant-joined` — the peer joined the room; the caller now offers. */
@Serializable
data class CallParticipantPayload(
    val callId: String,
    val participant: CallParticipantRef? = null,
    val mode: String? = null,
)

/** The nested participant object a `call:participant-joined` frame carries. */
@Serializable
data class CallParticipantRef(
    val userId: String? = null,
)

/** `call:ended` — the definitive teardown, carrying the end [reason]. */
@Serializable
data class CallEndedPayload(
    val callId: String,
    val duration: Int? = null,
    val endedBy: String? = null,
    /** `"missed"`/`"rejected"`/`"completed"`/`"connectionLost"`/`"failed"`/… */
    val reason: String? = null,
)

/** `call:missed` — dedicated ring-timeout event (emitted alongside `call:ended`). */
@Serializable
data class CallMissedPayload(
    val callId: String,
    val conversationId: String? = null,
    val callerId: String? = null,
    val callerName: String? = null,
)

/** `call:media-toggled` — the remote peer muted/unmuted their mic or camera. */
@Serializable
data class CallMediaTogglePayload(
    val callId: String,
    val participantId: String? = null,
    val mediaType: String,
    val enabled: Boolean,
)

/** `call:error` — a call-level failure outside the initiate ACK path. */
@Serializable
data class CallErrorPayload(
    val code: String? = null,
    val message: String? = null,
)

/** `call:already-answered` — one of the user's OTHER devices took the call. */
@Serializable
data class CallAlreadyAnsweredPayload(
    val callId: String,
)
