package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import me.meeshy.sdk.model.call.CallDataProfile
import org.junit.Test
import org.webrtc.Priority
import org.webrtc.RtpParameters
import org.webrtc.RtpSender
import org.webrtc.rtpEncoding
import org.webrtc.rtpParameters

class CallSenderTunerTest {

    private fun parameters(encodings: Int): RtpParameters =
        rtpParameters(null, List(encodings) { rtpEncoding(null, null, null) })

    private class Sender(val sender: RtpSender, val written: io.mockk.CapturingSlot<RtpParameters>)

    private fun senderWith(params: RtpParameters): Sender {
        val written = slot<RtpParameters>()
        val sender = mockk<RtpSender>()
        every { sender.parameters } returns params
        every { sender.setParameters(capture(written)) } returns true
        return Sender(sender, written)
    }

    @Test
    fun `the video budget of a profile lands on every encoding`() {
        val budget = CallDataProfile.CELLULAR.budget.video
        val target = senderWith(parameters(encodings = 2))

        assertThat(CallSenderTuner.applyVideo(target.sender, budget)).isTrue()

        val written = target.written.captured
        assertThat(written.degradationPreference).isEqualTo(RtpParameters.DegradationPreference.MAINTAIN_FRAMERATE)
        written.encodings.forEach {
            assertThat(it.maxBitrateBps).isEqualTo(600_000)
            assertThat(it.maxFramerate).isEqualTo(24)
            assertThat(it.scaleResolutionDownBy).isEqualTo(1.5)
            assertThat(it.networkPriority).isEqualTo(Priority.HIGH)
        }
    }

    @Test
    fun `a lean profile keeps the resolution`() {
        val target = senderWith(parameters(encodings = 1))
        CallSenderTuner.applyVideo(target.sender, CallDataProfile.DATA_SAVER.budget.video)
        assertThat(target.written.captured.degradationPreference).isEqualTo(RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION)
    }

    @Test
    fun `the audio ceiling lands on every encoding with the floor and a high priority`() {
        val target = senderWith(parameters(encodings = 1))

        assertThat(CallSenderTuner.applyAudio(target.sender, 24_000)).isTrue()

        val encoding = target.written.captured.encodings.single()
        assertThat(encoding.maxBitrateBps).isEqualTo(24_000)
        assertThat(encoding.minBitrateBps).isEqualTo(16_000)
        assertThat(encoding.networkPriority).isEqualTo(Priority.HIGH)
    }

    @Test
    fun `the audio floor never exceeds a lower ceiling`() {
        val target = senderWith(parameters(encodings = 1))
        CallSenderTuner.applyAudio(target.sender, 12_000)
        assertThat(target.written.captured.encodings.single().minBitrateBps).isEqualTo(12_000)
    }

    @Test
    fun `a sender without encodings is left alone`() {
        val target = senderWith(parameters(encodings = 0))
        assertThat(CallSenderTuner.applyAudio(target.sender, 24_000)).isFalse()
        assertThat(CallSenderTuner.applyVideo(target.sender, CallDataProfile.WIFI.budget.video)).isFalse()
        assertThat(target.written.isCaptured).isFalse()
    }
}
