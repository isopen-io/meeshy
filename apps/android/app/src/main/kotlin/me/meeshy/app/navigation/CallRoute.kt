package me.meeshy.app.navigation

import android.net.Uri
import me.meeshy.app.calls.CallConfig
import me.meeshy.sdk.model.call.CallRecord

/**
 * Single source of truth for the call navigation route: how a caller (chat header,
 * journal re-dial, or an incoming-call notification tap) encodes a call's context
 * into a route, and how that route's decoded arguments map back into the immutable
 * [CallConfig] the call screen drives.
 *
 * Threading the real [CallConfig.conversationId] is what makes an outgoing call
 * functional — `CallViewModel.start` → `emitInitiate(conversationId, …)` needs a
 * real room id. Threading the server [CallConfig.callId] is what makes an
 * **incoming** call answerable — `emitJoin`/`emitEnd` are keyed by it.
 *
 * The route is a **static `call` path + all-optional query args**: no free-text or
 * id value ever occupies a required path segment, so a blank conversation id or
 * peer name can never collapse the route or fail to match (Compose Navigation
 * requires non-empty path segments). Outgoing and incoming are the same route with
 * a different query string. Every navigation decision lives here (pure,
 * unit-tested) so the [MeeshyApp] `NavHost` glue stays a thin wiring layer.
 */
object CallRoute {
    const val CONVERSATION_ID_ARG: String = "conversationId"
    const val PEER_NAME_ARG: String = "peerName"
    const val VIDEO_ARG: String = "video"
    const val CALL_ID_ARG: String = "callId"
    const val INCOMING_ARG: String = "incoming"

    /** The `NavHost` route pattern: a static path with five optional query placeholders. */
    const val PATTERN: String =
        "call?$CONVERSATION_ID_ARG={$CONVERSATION_ID_ARG}" +
            "&$PEER_NAME_ARG={$PEER_NAME_ARG}" +
            "&$VIDEO_ARG={$VIDEO_ARG}" +
            "&$CALL_ID_ARG={$CALL_ID_ARG}" +
            "&$INCOMING_ARG={$INCOMING_ARG}"

    /**
     * Build the concrete route for an outgoing call placed from a chat. The
     * conversation id and the free-text peer name are percent-encoded so a value
     * containing `/`, `&` or `=` never breaks the query string.
     */
    fun path(conversationId: String, peerName: String, isVideo: Boolean): String =
        "call?$CONVERSATION_ID_ARG=${Uri.encode(conversationId)}" +
            "&$PEER_NAME_ARG=${Uri.encode(peerName)}" +
            "&$VIDEO_ARG=$isVideo"

    /**
     * Build the concrete route for an **incoming** call surfaced by a full-screen
     * notification tap. Reuses [path] for the shared context, then appends the
     * server-minted [callId] (percent-encoded) and the incoming flag. Decoding this
     * through [config] yields a non-outgoing [CallConfig] that already carries the
     * real id, so the call screen answers the existing call rather than initiating
     * a new one.
     */
    fun incoming(
        callId: String,
        conversationId: String,
        callerName: String,
        isVideo: Boolean,
    ): String =
        "${path(conversationId, callerName, isVideo)}" +
            "&$CALL_ID_ARG=${Uri.encode(callId)}" +
            "&$INCOMING_ARG=true"

    /**
     * Map already-decoded navigation arguments into the [CallConfig] the call
     * screen drives. Null / absent args degrade to blank (or audio / outgoing) so
     * a malformed deep link yields an inert call that simply can't initiate —
     * never a crash. For an **outgoing** call [callId] stays blank (it mints its
     * own via the initiate ACK) and [incoming] is false; an **incoming** deep link
     * supplies both, adopting the server id and flipping the direction.
     */
    fun config(
        conversationId: String?,
        peerName: String?,
        isVideo: Boolean?,
        callId: String? = null,
        incoming: Boolean = false,
    ): CallConfig =
        CallConfig(
            peerId = "",
            peerName = peerName.orEmpty(),
            isVideo = isVideo ?: false,
            isOutgoing = !incoming,
            conversationId = conversationId.orEmpty(),
            callId = callId.orEmpty(),
        )

    /**
     * Re-dial route from a call-journal row: the natural "tap a past call to
     * call back" gesture. Threads the record's own conversation, its resolved
     * [CallRecord.displayName] and its media type straight into [path], so the
     * outgoing call re-initiates into the exact room — identical to a call
     * placed from the chat header.
     */
    fun redial(record: CallRecord): String =
        path(
            conversationId = record.conversationId,
            peerName = record.displayName,
            isVideo = record.isVideo,
        )
}
