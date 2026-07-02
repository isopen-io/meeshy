package me.meeshy.app.navigation

import android.net.Uri
import me.meeshy.app.calls.CallConfig
import me.meeshy.sdk.model.call.CallRecord

/**
 * Single source of truth for the outgoing-call navigation route: how the chat
 * destination encodes a call's context into a path, and how that path's decoded
 * arguments map back into the immutable [CallConfig] the call screen drives.
 *
 * Threading the real [CallConfig.conversationId] is what makes an outgoing call
 * functional — `CallViewModel.start` → `emitInitiate(conversationId, …)` needs a
 * real room id. Before this the route dropped it, so every outgoing call
 * initiated into an empty room and the gateway rejected it.
 *
 * Every navigation decision lives here (pure, unit-tested) so the [MeeshyApp]
 * `NavHost` glue stays a thin wiring layer.
 */
object CallRoute {
    const val CONVERSATION_ID_ARG: String = "conversationId"
    const val PEER_NAME_ARG: String = "peerName"
    const val VIDEO_ARG: String = "video"

    /** The `NavHost` route pattern with its three named placeholders. */
    const val PATTERN: String = "call/{$CONVERSATION_ID_ARG}/{$PEER_NAME_ARG}/{$VIDEO_ARG}"

    /**
     * Build the concrete route for an outgoing call placed from a chat. Both the
     * conversation id and the free-text peer name are percent-encoded so a name
     * containing `/` or `&` never introduces spurious path segments.
     */
    fun path(conversationId: String, peerName: String, isVideo: Boolean): String =
        "call/${Uri.encode(conversationId)}/${Uri.encode(peerName)}/$isVideo"

    /**
     * Map already-decoded navigation arguments into the outgoing [CallConfig].
     * Null / absent args degrade to blank (or audio) so a malformed deep link
     * yields an inert call that simply can't initiate — never a crash. The
     * `callId` stays blank: an outgoing call mints its own via the initiate ACK.
     */
    fun config(conversationId: String?, peerName: String?, isVideo: Boolean?): CallConfig =
        CallConfig(
            peerId = "",
            peerName = peerName.orEmpty(),
            isVideo = isVideo ?: false,
            isOutgoing = true,
            conversationId = conversationId.orEmpty(),
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
