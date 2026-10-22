package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallFeedbackIssue
import me.meeshy.sdk.model.call.CallQualityFeedback
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallSocialSignalManagerTest {
    @Test
    fun `fire and forget emissions carry callId and the contract fields`() {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket)
        manager.emitToggleScreen("c", true)
        manager.emitTranscriptionActive("c", false)
        manager.emitTranscriptionSegment("c", mapOf("text" to "hi", "speakerId" to "u", "startMs" to 0, "endMs" to 10, "isFinal" to true, "confidence" to 0.9, "language" to "en"))
        manager.emitQualityFeedback(CallQualityFeedback.of("c", 4, listOf(CallFeedbackIssue.ECHO))!!)

        assertThat(fake.last("call:toggle-screen").getBoolean("enabled")).isTrue()
        assertThat(fake.last("call:transcription-active").getBoolean("active")).isFalse()
        val segment = fake.last("call:transcription-segment")
        assertThat(segment.getString("callId")).isEqualTo("c")
        assertThat(segment.getJSONObject("segment").getString("language")).isEqualTo("en")
        val feedback = fake.last("call:quality-feedback")
        assertThat(feedback.getInt("rating")).isEqualTo(4)
        assertThat(feedback.getJSONArray("issues").getString(0)).isEqualTo("echo")
    }

    @Test
    fun `transcription-active broadcast arrives and a malformed one is ignored`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        manager.transcriptionActive.test {
            fake.deliver("call:transcription-active", """{"callId":"c","speakerId":"s"}""")
            fake.deliver("call:transcription-active", """{"callId":"c","speakerId":"s","active":true}""")
            assertThat(awaitItem().active).isTrue()
        }
    }

    @Test
    fun `flows are hot without replay`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        fake.deliver("call:muted-by-moderator", """{"callId":"c","byUserId":"m"}""")
        manager.mutedByModerator.test { expectNoEvents() }
    }
}
