package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDeclineReplyTargetTest {

    private fun incoming(peerId: String = "", conversationId: String = "") =
        CallConfig(peerId = peerId, peerName = "Ana", isVideo = false, isOutgoing = false, conversationId = conversationId, callId = "call-1")

    @Test
    fun `un appel entrant routé avec sa conversation mais sans l'identifiant de l'appelant offre la réponse par message`() {
        assertThat(CallDeclineReplyTarget.of(incoming(conversationId = "conv-1")))
            .isEqualTo(CallDeclineReplyTarget(peerId = "", conversationId = "conv-1"))
    }

    @Test
    fun `un appel entrant qui connaît l'appelant sans conversation offre la réponse, la conversation directe se résout à l'envoi`() {
        assertThat(CallDeclineReplyTarget.of(incoming(peerId = "u-ana")))
            .isEqualTo(CallDeclineReplyTarget(peerId = "u-ana", conversationId = ""))
    }

    @Test
    fun `un appel entrant qui connaît l'appelant et la conversation garde les deux`() {
        assertThat(CallDeclineReplyTarget.of(incoming(peerId = "u-ana", conversationId = "conv-1")))
            .isEqualTo(CallDeclineReplyTarget(peerId = "u-ana", conversationId = "conv-1"))
    }

    @Test
    fun `un appel entrant sans conversation ni appelant n'a nulle part où répondre`() {
        assertThat(CallDeclineReplyTarget.of(incoming())).isNull()
    }

    @Test
    fun `un appel sortant ne se refuse pas avec un message`() {
        val outgoing = incoming(peerId = "u-ana", conversationId = "conv-1").copy(isOutgoing = true)
        assertThat(CallDeclineReplyTarget.of(outgoing)).isNull()
    }
}
