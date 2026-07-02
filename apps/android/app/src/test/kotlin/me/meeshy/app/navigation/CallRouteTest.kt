package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.calls.CallConfig
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural coverage for the call route SSOT. The critical behaviours: a real
 * [conversationId] survives the round trip into the [CallConfig] the screen drives
 * (without it `emitInitiate` fires into an empty room), and an **incoming** deep
 * link carries the server [callId] and non-outgoing direction (without which the
 * ring cannot be answered). Every route is decoded back through [CallRoute.config]
 * so the assertions are on real config, not string literals.
 */
@RunWith(RobolectricTestRunner::class)
class CallRouteTest {

    private fun configOf(route: String): CallConfig {
        val uri = Uri.parse(route)
        return CallRoute.config(
            conversationId = uri.getQueryParameter(CallRoute.CONVERSATION_ID_ARG),
            peerName = uri.getQueryParameter(CallRoute.PEER_NAME_ARG),
            isVideo = uri.getQueryParameter(CallRoute.VIDEO_ARG)?.toBoolean(),
            callId = uri.getQueryParameter(CallRoute.CALL_ID_ARG),
            incoming = uri.getQueryParameter(CallRoute.INCOMING_ARG)?.toBoolean() ?: false,
        )
    }

    @Test
    fun `config threads the conversationId for an outgoing call`() {
        val config = CallRoute.config(
            conversationId = "6650f0aa11bb22cc33dd44ee",
            peerName = "Alice",
            isVideo = true,
        )

        assertThat(config.conversationId).isEqualTo("6650f0aa11bb22cc33dd44ee")
        assertThat(config.peerName).isEqualTo("Alice")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isTrue()
    }

    @Test
    fun `config leaves the callId blank so an outgoing call mints its own`() {
        val config = CallRoute.config(conversationId = "c1", peerName = "Bob", isVideo = false)

        assertThat(config.callId).isEmpty()
        assertThat(config.peerId).isEmpty()
    }

    @Test
    fun `config defaults an absent video flag to an audio call`() {
        val config = CallRoute.config(conversationId = "c1", peerName = "Bob", isVideo = null)

        assertThat(config.isVideo).isFalse()
    }

    @Test
    fun `config keeps an explicit audio call as audio`() {
        val config = CallRoute.config(conversationId = "c1", peerName = "Bob", isVideo = false)

        assertThat(config.isVideo).isFalse()
    }

    @Test
    fun `config degrades a null conversationId to blank rather than crashing`() {
        val config = CallRoute.config(conversationId = null, peerName = "Bob", isVideo = true)

        assertThat(config.conversationId).isEmpty()
        assertThat(config.isOutgoing).isTrue()
    }

    @Test
    fun `config degrades a null peerName to blank`() {
        val config = CallRoute.config(conversationId = "c1", peerName = null, isVideo = true)

        assertThat(config.peerName).isEmpty()
    }

    @Test
    fun `config adopts an explicit incoming callId and flips direction`() {
        val config = CallRoute.config(
            conversationId = "c1",
            peerName = "Bob",
            isVideo = false,
            callId = "call-9",
            incoming = true,
        )

        assertThat(config.callId).isEqualTo("call-9")
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `config degrades a null incoming callId to blank`() {
        val config = CallRoute.config(
            conversationId = "c1",
            peerName = "Bob",
            isVideo = true,
            callId = null,
            incoming = true,
        )

        assertThat(config.callId).isEmpty()
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `path round-trips the conversationId and a peerName with reserved characters`() {
        val config = configOf(
            CallRoute.path(
                conversationId = "6650f0aa11bb22cc33dd44ee",
                peerName = "Ann / Bob & Co = X",
                isVideo = true,
            ),
        )

        assertThat(config.conversationId).isEqualTo("6650f0aa11bb22cc33dd44ee")
        assertThat(config.peerName).isEqualTo("Ann / Bob & Co = X")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isTrue()
    }

    @Test
    fun `path stays a single static segment so a blank conversationId never collapses it`() {
        val route = CallRoute.path(conversationId = "", peerName = "", isVideo = false)

        assertThat(Uri.parse(route).pathSegments).containsExactly("call")
        val config = configOf(route)
        assertThat(config.conversationId).isEmpty()
        assertThat(config.isOutgoing).isTrue()
    }

    @Test
    fun `pattern exposes all five named arguments`() {
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.CONVERSATION_ID_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.PEER_NAME_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.VIDEO_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.CALL_ID_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.INCOMING_ARG}}")
    }

    @Test
    fun `incoming threads the server id, room, name and media into a non-outgoing config`() {
        val config = configOf(
            CallRoute.incoming(
                callId = "call-777",
                conversationId = "conv-42",
                callerName = "Alice",
                isVideo = true,
            ),
        )

        assertThat(config.callId).isEqualTo("call-777")
        assertThat(config.conversationId).isEqualTo("conv-42")
        assertThat(config.peerName).isEqualTo("Alice")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `incoming percent-encodes a reserved-char call id without breaking the query`() {
        val config = configOf(
            CallRoute.incoming(
                callId = "call/7&7=z",
                conversationId = "conv-1",
                callerName = "Bob",
                isVideo = false,
            ),
        )

        assertThat(config.callId).isEqualTo("call/7&7=z")
        assertThat(config.conversationId).isEqualTo("conv-1")
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `incoming with a blank room still yields an answerable ring`() {
        val config = configOf(
            CallRoute.incoming(
                callId = "call-1",
                conversationId = "",
                callerName = "Alice",
                isVideo = false,
            ),
        )

        assertThat(config.callId).isEqualTo("call-1")
        assertThat(config.conversationId).isEmpty()
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `redial threads a history record's conversation, resolved name and media into the route`() {
        val config = configOf(CallRoute.redial(callRecord(conversationId = "conv-99", isVideo = true)))

        assertThat(config.conversationId).isEqualTo("conv-99")
        assertThat(config.peerName).isEqualTo("Alice Martin")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isTrue()
    }

    @Test
    fun `redial resolves the display name over the raw username, then encodes it safely`() {
        val record = callRecord(
            peer = CallHistoryPeer(userId = "u1", username = "amartin", displayName = "Ann / Bob & Co"),
        )

        val config = configOf(CallRoute.redial(record))

        assertThat(config.peerName).isEqualTo("Ann / Bob & Co")
    }

    @Test
    fun `redial carries an audio-only record as an audio call`() {
        val config = configOf(CallRoute.redial(callRecord(isVideo = false)))

        assertThat(config.isVideo).isFalse()
    }

    @Test
    fun `redial falls back to the record's display name when the peer is absent`() {
        val record = callRecord(peer = null, conversationTitle = "Design Team")

        val config = configOf(CallRoute.redial(record))

        assertThat(config.peerName).isEqualTo("Design Team")
    }

    private fun callRecord(
        conversationId: String = "conv-1",
        isVideo: Boolean = false,
        conversationTitle: String? = null,
        peer: CallHistoryPeer? = CallHistoryPeer(
            userId = "u1",
            username = "amartin",
            displayName = "Alice Martin",
        ),
    ): CallRecord = CallRecord(
        callId = "call-1",
        conversationId = conversationId,
        conversationType = "direct",
        conversationTitle = conversationTitle,
        mode = "p2p",
        status = "ended",
        direction = "outgoing",
        isVideo = isVideo,
        startedAt = "2026-07-02T10:00:00Z",
        durationSec = 42,
        peer = peer,
    )
}
