package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class IncomingCallPermissionPolicyTest {

    @Test
    fun `a refused microphone hangs up instead of answering mute`() {
        assertThat(IncomingCallPermissionPolicy.decide(micGranted = false, cameraGranted = true, isVideo = true))
            .isEqualTo(IncomingCallAnswer.HangUp)
        assertThat(IncomingCallPermissionPolicy.decide(micGranted = false, cameraGranted = false, isVideo = false))
            .isEqualTo(IncomingCallAnswer.HangUp)
    }

    @Test
    fun `a refused camera answers in audio`() {
        assertThat(IncomingCallPermissionPolicy.decide(micGranted = true, cameraGranted = false, isVideo = true))
            .isEqualTo(IncomingCallAnswer.AnswerAudioOnly)
    }

    @Test
    fun `both granted answers the call as it was placed`() {
        assertThat(IncomingCallPermissionPolicy.decide(micGranted = true, cameraGranted = true, isVideo = true))
            .isEqualTo(IncomingCallAnswer.Answer)
    }

    @Test
    fun `an audio call never depends on the camera`() {
        assertThat(IncomingCallPermissionPolicy.decide(micGranted = true, cameraGranted = false, isVideo = false))
            .isEqualTo(IncomingCallAnswer.Answer)
    }
}
