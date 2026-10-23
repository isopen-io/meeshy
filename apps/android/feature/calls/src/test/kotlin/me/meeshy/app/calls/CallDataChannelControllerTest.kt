package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallCaptionSegment
import me.meeshy.sdk.model.call.DataChannelCodec
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallDataChannelControllerTest {

    private class Rig(open: Boolean = true) {
        val messages = MutableSharedFlow<ByteArray>(extraBufferCapacity = 8)
        val sent = slot<ByteArray>()
        val engine: WebRtcEngine = mockk(relaxed = true) {
            every { dataChannelMessages } returns messages
            every { sendDataChannelMessage(capture(sent)) } returns open
        }
        val controller = CallDataChannelController(engine)
    }

    private fun caption() = CallCaptionSegment("u1", "Ada", isLocal = true, text = "bonjour")

    @Test
    fun `un bye entrant coupe l'appel avec sa raison`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        val byes = mutableListOf<String?>()
        rig.controller.observe(backgroundScope) { byes += it }

        rig.messages.emit(DataChannelCodec.encodeBye("hangup"))

        assertThat(byes).containsExactly("hangup")
    }

    @Test
    fun `un bye nu transmet une raison absente`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        val byes = mutableListOf<String?>()
        rig.controller.observe(backgroundScope) { byes += it }

        rig.messages.emit(DataChannelCodec.encodeBye())

        assertThat(byes).containsExactly(null)
    }

    @Test
    fun `le ping et un type inconnu d'une version future sont inertes`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        val byes = mutableListOf<String?>()
        val captions = mutableListOf<CallCaptionSegment>()
        rig.controller.observe(backgroundScope) { byes += it }
        backgroundScope.launch { rig.controller.captions.collect { captions += it } }

        rig.messages.emit(DataChannelCodec.encodePing())
        rig.messages.emit("""{"type":"emoji-burst","count":3}""".encodeToByteArray())
        rig.messages.emit("pas du json".encodeToByteArray())

        assertThat(byes).isEmpty()
        assertThat(captions).isEmpty()
    }

    @Test
    fun `une entree de sous-titres du pair est exposee en flux et jamais locale`() = runTest(UnconfinedTestDispatcher()) {
        val rig = Rig()
        val captions = mutableListOf<CallCaptionSegment>()
        rig.controller.observe(backgroundScope) {}
        backgroundScope.launch { rig.controller.captions.collect { captions += it } }

        rig.messages.emit(DataChannelCodec.encodeCaption(caption()))

        assertThat(captions).hasSize(1)
        assertThat(captions.single().text).isEqualTo("bonjour")
        assertThat(captions.single().isLocal).isFalse()
    }

    @Test
    fun `sendHangupBye envoie la trame bye sur le canal`() {
        val rig = Rig()

        val delivered = rig.controller.sendHangupBye("hangup")

        assertThat(delivered).isTrue()
        verify { rig.engine.sendDataChannelMessage(any()) }
        assertThat(rig.sent.captured.decodeToString()).contains("\"bye\"")
    }

    @Test
    fun `sendHangupBye rend false quand le canal n'est pas ouvert`() {
        assertThat(Rig(open = false).controller.sendHangupBye()).isFalse()
    }
}
