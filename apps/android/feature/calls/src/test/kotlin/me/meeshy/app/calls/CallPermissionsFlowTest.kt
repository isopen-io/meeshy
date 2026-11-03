package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.call.CallPreflightDecision
import me.meeshy.sdk.model.call.CallVideoFallback
import me.meeshy.sdk.model.call.IncomingCallAnswer
import org.junit.Test

class CallPermissionsFlowTest {

    private class Harness(private val answers: Map<PermissionNature, Boolean>) {
        val asked = mutableListOf<Pair<PermissionNature, Boolean>>()
        val preflight = CallPermissionPreflight { nature, announcesRefusal ->
            asked += nature to announcesRefusal
            answers[nature] == true
        }
    }

    private fun harness(mic: Boolean = true, camera: Boolean = true) =
        Harness(mapOf(PermissionNature.MICROPHONE to mic, PermissionNature.CAMERA to camera))

    @Test
    fun `an audio call explains and asks the microphone only`() = runTest {
        val h = harness()

        val decision = h.preflight.outgoing(isVideo = false)

        assertThat(decision).isEqualTo(CallPreflightDecision.Proceed(isVideo = false))
        assertThat(h.asked).containsExactly(PermissionNature.MICROPHONE to true)
    }

    @Test
    fun `a video call explains the microphone then the camera`() = runTest {
        val h = harness()

        val decision = h.preflight.outgoing(isVideo = true)

        assertThat(decision).isEqualTo(CallPreflightDecision.Proceed(isVideo = true))
        assertThat(h.asked.map { it.first })
            .containsExactly(PermissionNature.MICROPHONE, PermissionNature.CAMERA).inOrder()
    }

    @Test
    fun `a refused camera continues in audio and does not announce a second refusal`() = runTest {
        val h = harness(camera = false)

        val decision = h.preflight.outgoing(isVideo = true)

        assertThat(decision)
            .isEqualTo(CallPreflightDecision.Proceed(isVideo = false, fallback = CallVideoFallback.CameraPermissionDenied))
        assertThat(h.asked).contains(PermissionNature.CAMERA to false)
    }

    @Test
    fun `a permanently refused microphone cancels the call and never asks for the camera`() = runTest {
        val h = harness(mic = false)

        val decision = h.preflight.outgoing(isVideo = true)

        assertThat(decision).isEqualTo(CallPreflightDecision.MicrophoneDenied)
        assertThat(h.asked.map { it.first }).containsExactly(PermissionNature.MICROPHONE)
    }

    @Test
    fun `answering a video call without the camera answers in audio`() = runTest {
        assertThat(harness(camera = false).preflight.incoming(isVideo = true)).isEqualTo(IncomingCallAnswer.AnswerAudioOnly)
    }

    @Test
    fun `answering without the microphone hangs up`() = runTest {
        assertThat(harness(mic = false).preflight.incoming(isVideo = false)).isEqualTo(IncomingCallAnswer.HangUp)
    }

    @Test
    fun `answering an audio call with the microphone answers`() = runTest {
        assertThat(harness().preflight.incoming(isVideo = false)).isEqualTo(IncomingCallAnswer.Answer)
    }
}
