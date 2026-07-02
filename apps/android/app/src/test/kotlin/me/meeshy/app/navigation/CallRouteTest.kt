package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
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
}
