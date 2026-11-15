package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPreflightTest {

    @Test
    fun `a refused microphone cancels the call whatever its kind`() {
        assertThat(CallPreflight.decide(micGranted = false, cameraGranted = true, isVideo = false))
            .isEqualTo(CallPreflightDecision.MicrophoneDenied)
        assertThat(CallPreflight.decide(micGranted = false, cameraGranted = true, isVideo = true))
            .isEqualTo(CallPreflightDecision.MicrophoneDenied)
    }

    @Test
    fun `a refused camera dials audio only and says why`() {
        assertThat(CallPreflight.decide(micGranted = true, cameraGranted = false, isVideo = true))
            .isEqualTo(CallPreflightDecision.Proceed(isVideo = false, fallback = CallVideoFallback.CameraPermissionDenied))
    }

    @Test
    fun `an audio call never looks at the camera`() {
        assertThat(CallPreflight.decide(micGranted = true, cameraGranted = false, isVideo = false))
            .isEqualTo(CallPreflightDecision.Proceed(isVideo = false))
    }

    @Test
    fun `both permissions let a video call through unchanged`() {
        assertThat(CallPreflight.decide(micGranted = true, cameraGranted = true, isVideo = true))
            .isEqualTo(CallPreflightDecision.Proceed(isVideo = true))
    }
}
