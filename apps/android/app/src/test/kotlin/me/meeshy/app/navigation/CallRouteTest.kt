package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural coverage for the outgoing-call route SSOT. The critical behaviour
 * is that a real [conversationId] survives the round trip into the [CallConfig]
 * the call screen drives — without it `emitInitiate` fires into an empty room.
 */
@RunWith(RobolectricTestRunner::class)
class CallRouteTest {

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
    fun `path embeds the conversationId and round-trips a peerName with reserved characters`() {
        val path = CallRoute.path(
            conversationId = "6650f0aa11bb22cc33dd44ee",
            peerName = "Ann / Bob & Co",
            isVideo = true,
        )

        val segments = path.split("/")
        // call / {conversationId} / {peerName} / {video} — the encoded peerName must not
        // introduce extra path separators, so exactly four segments survive.
        assertThat(segments).hasSize(4)
        assertThat(segments[0]).isEqualTo("call")
        assertThat(Uri.decode(segments[1])).isEqualTo("6650f0aa11bb22cc33dd44ee")
        assertThat(Uri.decode(segments[2])).isEqualTo("Ann / Bob & Co")
        assertThat(segments[3]).isEqualTo("true")
    }

    @Test
    fun `pattern exposes all three named arguments`() {
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.CONVERSATION_ID_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.PEER_NAME_ARG}}")
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.VIDEO_ARG}}")
    }

    @Test
    fun `redial threads a history record's conversation, resolved name and media into the route`() {
        val path = CallRoute.redial(callRecord(conversationId = "conv-99", isVideo = true))

        val config = CallRoute.config(
            conversationId = Uri.decode(path.split("/")[1]),
            peerName = Uri.decode(path.split("/")[2]),
            isVideo = path.split("/")[3].toBoolean(),
        )
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

        val path = CallRoute.redial(record)

        val segments = path.split("/")
        // The encoded, reserved-char display name must not spawn extra path segments.
        assertThat(segments).hasSize(4)
        assertThat(Uri.decode(segments[2])).isEqualTo("Ann / Bob & Co")
    }

    @Test
    fun `redial carries an audio-only record as an audio call`() {
        val path = CallRoute.redial(callRecord(isVideo = false))

        assertThat(path.split("/")[3]).isEqualTo("false")
    }

    @Test
    fun `redial falls back to the record's display name when the peer is absent`() {
        val record = callRecord(peer = null, conversationTitle = "Design Team")

        val path = CallRoute.redial(record)

        assertThat(Uri.decode(path.split("/")[2])).isEqualTo("Design Team")
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
