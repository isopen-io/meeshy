package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable

/**
 * The gateway's `callSessionSchema` payload — `GET /conversations/:id/active-call`
 * and the crash-recovery `GET /calls/active`. Port of iOS `ActiveCallSession`
 * (`CallModels.swift`): reconciles a device's local call state with the
 * server's after the local call session was lost (app relaunch, crash) while
 * the call itself is still ongoing.
 *
 * Wire truths (bug 2026-07-12, fixed gateway-side `223e07134`):
 * - [mode] carries the WebRTC ARCHITECTURE (p2p|sfu) — it is never "video";
 * - the audio/video nature travels in the whitelisted [metadata] `type`;
 * - pre-whitelist sessions carry no metadata and must decode as audio.
 */
@Serializable
data class ActiveCallSession(
    val id: String,
    val conversationId: String,
    val mode: String,
    val status: String,
    val metadata: ActiveCallMetadata? = null,
    val participants: List<ActiveCallParticipant> = emptyList(),
) {
    /** `metadata.type` is the REST source of truth; [mode] stays as a forward-compatibility fallback only. */
    val isVideo: Boolean get() = (metadata?.type ?: mode) == "video"

    /**
     * The other participant of a direct call — the first entry whose userId
     * isn't [currentUserId]. Null for group calls or an unpopulated roster.
     */
    fun remoteParticipant(currentUserId: String): ActiveCallParticipant? =
        participants.firstOrNull { it.userId != currentUserId }
}

/**
 * The whitelisted slice of `CallSession.metadata` the gateway serializes
 * (`callSessionSchema` — every other metadata key is stripped for privacy).
 */
@Serializable
data class ActiveCallMetadata(
    val type: String? = null,
)

/** One roster entry of an active call, with its populated user when available. */
@Serializable
data class ActiveCallParticipant(
    val userId: String,
    val user: ActiveCallParticipantUser? = null,
)

/** The `userMinimalSchema` slice populated on call participants. */
@Serializable
data class ActiveCallParticipantUser(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
)
