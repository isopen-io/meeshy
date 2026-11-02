package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.net.api.ActiveCallApi
import org.junit.Test

/**
 * #13504 — « Répondre » ne décroche qu'un appel que la passerelle tient pour EN COURS dans cette conversation, sous
 * cet identifiant : jamais un `callId` arbitraire. Faute de confirmation (aucun appel, un autre appel, sonde en
 * échec), l'écran d'appel entrant reste affiché et l'utilisateur décroche lui-même.
 */
class IncomingAutoAnswerViewModelTest {

    private val api: ActiveCallApi = mockk()
    private val gate = IncomingAutoAnswerViewModel(ActiveCallRepository(api))

    private fun incoming(callId: String = "call-1", conversationId: String = "conv-1") = CallConfig(
        peerId = "",
        peerName = "Alice",
        isVideo = true,
        isOutgoing = false,
        conversationId = conversationId,
        callId = callId,
    )

    private fun serverHolds(id: String?) {
        coEvery { api.activeCallForConversation("conv-1") } returns ApiResponse(
            success = true,
            data = id?.let { ActiveCallSession(id = it, conversationId = "conv-1", mode = "p2p", status = "ringing") },
        )
    }

    @Test
    fun `answers the call the gateway holds as ongoing under this id`() = runTest {
        serverHolds("call-1")

        assertThat(gate.confirms(incoming())).isTrue()
    }

    @Test
    fun `refuses when the conversation has no ongoing call`() = runTest {
        serverHolds(null)

        assertThat(gate.confirms(incoming())).isFalse()
    }

    @Test
    fun `refuses an arbitrary call id that is not the ongoing call`() = runTest {
        serverHolds("call-1")

        assertThat(gate.confirms(incoming(callId = "forged"))).isFalse()
    }

    @Test
    fun `refuses when the probe fails`() = runTest {
        coEvery { api.activeCallForConversation("conv-1") } throws RuntimeException("offline")

        assertThat(gate.confirms(incoming())).isFalse()
    }

    @Test
    fun `never probes for an outgoing call, a blank id or a blank conversation`() = runTest {
        serverHolds("call-1")

        assertThat(gate.confirms(incoming().copy(isOutgoing = true))).isFalse()
        assertThat(gate.confirms(incoming(callId = ""))).isFalse()
        assertThat(gate.confirms(incoming(conversationId = " "))).isFalse()
        coVerify(exactly = 0) { api.activeCallForConversation(any()) }
    }
}
