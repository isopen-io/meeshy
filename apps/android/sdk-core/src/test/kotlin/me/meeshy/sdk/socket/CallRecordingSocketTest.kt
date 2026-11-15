package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingRefusal
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallRecordingSocketTest {
    @Test
    fun `an audio request omits kind and returns the recording id`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true,"recordingId":"r1"}"""))
        val result = CallSocialSignalManager(fake.socket).requestCallRecording("c", CallRecordingKind.AUDIO)
        assertThat(result.getOrNull()).isEqualTo("r1")
        assertThat(fake.last("call:recording-request").has("kind")).isFalse()
    }

    @Test
    fun `a video request names its kind`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true,"recordingId":"r1"}"""))
        CallSocialSignalManager(fake.socket).requestCallRecording("c", CallRecordingKind.VIDEO)
        assertThat(fake.last("call:recording-request").getString("kind")).isEqualTo("video")
    }

    @Test
    fun `answer and stop carry the recording id and a refusal is typed`() = runTest {
        val ok = FakeCallSocket(ackReply = JSONObject("""{"success":true}"""))
        val manager = CallSocialSignalManager(ok.socket)
        assertThat(manager.answerCallRecording("c", "r1", true).isFailure).isFalse()
        assertThat(ok.last("call:recording-consent").getBoolean("accepted")).isTrue()
        assertThat(manager.stopCallRecording("c", "r1").isFailure).isFalse()
        assertThat(ok.last("call:recording-stop").getString("recordingId")).isEqualTo("r1")

        val refused = FakeCallSocket(ackReply = JSONObject("""{"success":false,"code":"RECORDING_EXPIRED"}"""))
        val error = CallSocialSignalManager(refused.socket).answerCallRecording("c", "r1", true).exceptionOrNull()
        assertThat((error as CallRecordingRefusal).reason).isEqualTo(CallRecordingRefusal.Reason.EXPIRED)
    }

    @Test
    fun `a request ack without a recording id success shape is still read, a missing socket is refused`() = runTest {
        val offline = FakeCallSocket(connected = false)
        val error = CallSocialSignalManager(offline.socket).requestCallRecording("c").exceptionOrNull()
        assertThat((error as CallRecordingRefusal).code).isEqualTo("NO_SOCKET")
    }

    @Test
    fun `requested started and stopped are exposed in order`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        manager.recordingEvents.test {
            fake.deliver("call:recording-requested", """{"callId":"c","recordingId":"r","requesterId":"u","requiredUserIds":["a"],"expiresAt":"2026-10-22T10:00:30Z","kind":"video"}""")
            fake.deliver("call:recording-started", """{"callId":"c","recordingId":"r","recorderId":"u","startedAt":"x","kind":"video"}""")
            fake.deliver("call:recording-stopped", """{"callId":"c","recordingId":"r","reason":"stopped","byUserId":"u","wasRecording":true}""")
            assertThat(awaitItem()).isInstanceOf(CallRecordingSocketEvent.Requested::class.java)
            assertThat(awaitItem()).isInstanceOf(CallRecordingSocketEvent.Started::class.java)
            assertThat((awaitItem() as CallRecordingSocketEvent.Stopped).event.wasRecording).isTrue()
        }
    }
}
