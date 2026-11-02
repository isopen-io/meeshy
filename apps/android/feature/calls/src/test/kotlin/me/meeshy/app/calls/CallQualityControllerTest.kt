package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallQualityReport
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

class CallQualityControllerTest {
    private val signals: CallSignalManager = mockk(relaxed = true)
    private val controller = CallQualityController(signals)

    private fun host(state: CallState, id: String = "call-1") = object : CallSessionHost {
        override val scope: CoroutineScope get() = error("unused")
        override val config: CallConfig get() = CallConfig.EMPTY
        override val callId = id
        override val selfId = "me"
        override val callState = state
        override val elapsedSeconds = 0L
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private val good = CallQualitySample(rttMs = 40.0, packetLoss = 0.0)
    private val bad = CallQualitySample(rttMs = 600.0, packetLoss = 0.0)

    @Test
    fun `chaque tick connecté émet un rapport de qualité`() {
        controller.onSample(host(CallState.Connected), good)
        verify(exactly = 1) { signals.emitQualityReport("call-1", any<CallQualityReport>()) }
    }

    @Test
    fun `rien ne part en reconnexion ni sans identifiant d'appel`() {
        controller.onSample(host(CallState.Reconnecting(1)), good)
        controller.onSample(host(CallState.Connected, id = ""), good)
        verify(exactly = 0) { signals.emitQualityReport(any(), any<CallQualityReport>()) }
    }

    @Test
    fun `le lien n'est dégradé qu'au deuxième tick dégradé et se rétablit aussitôt`() {
        val host = host(CallState.Connected)
        controller.onSample(host, bad)
        assertThat(controller.isLinkDegraded).isFalse()
        controller.onSample(host, bad)
        assertThat(controller.isLinkDegraded).isTrue()
        controller.onSample(host, good)
        assertThat(controller.isLinkDegraded).isFalse()
    }
}
