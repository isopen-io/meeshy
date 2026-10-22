package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallControlRefusal
import me.meeshy.sdk.model.call.CallLiveFrameReply
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallLiveFrameSocketTest {
    @Test
    fun `select is acknowledged and a refusal is typed`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":false,"code":"NOT_A_PARTICIPANT"}"""))
        val manager = CallSocialSignalManager(fake.socket)
        val refusal = manager.selectCallLiveFrame("c", "a.b").exceptionOrNull() as CallControlRefusal
        assertThat(refusal.reason).isEqualTo(CallControlRefusal.Reason.INSUFFICIENT_RIGHT)
    }

    @Test
    fun `frame-selected arrives with texts and reply`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        manager.frameSelected.test {
            fake.deliver("call:frame-selected", """{"callId":"c","userId":"u","frameId":"a.b","texts":{"name":"Ana"},"reply":"declined","at":"x"}""")
            val event = awaitItem()
            assertThat(event.texts?.name).isEqualTo("Ana")
            assertThat(event.reply).isEqualTo(CallLiveFrameReply.DECLINED)
        }
    }
}
