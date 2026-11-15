package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallPreviewSocketTest {
    @Test
    fun `request and signal emit the contract shape`() {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket)
        manager.requestCallPreview("c1")
        assertThat(fake.last("call:preview-request").getString("callId")).isEqualTo("c1")
        manager.emitCallPreviewSignal("c1", "ice-candidate", "me", "peer", 2, mapOf("candidate" to "cand", "sdpMLineIndex" to 0, "sdpMid" to null))
        val payload = fake.last("call:preview-signal")
        val signal = payload.getJSONObject("signal")
        assertThat(payload.getString("callId")).isEqualTo("c1")
        assertThat(signal.getString("type")).isEqualTo("ice-candidate")
        assertThat(signal.getInt("negotiationId")).isEqualTo(2)
        assertThat(signal.getInt("sdpMLineIndex")).isEqualTo(0)
        assertThat(signal.getString("to")).isEqualTo("peer")
    }

    @Test
    fun `preview request and signal arrive`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        manager.previewRequested.test {
            fake.deliver("call:preview-requested", """{"callId":"c","userId":"u"}""")
            assertThat(awaitItem().userId).isEqualTo("u")
        }
        manager.previewSignals.test {
            fake.deliver("call:preview-signal", """{"callId":"c","signal":{"type":"answer","sdp":"v=0","negotiationId":1}}""")
            assertThat(awaitItem().signal.type).isEqualTo("answer")
        }
    }
}
