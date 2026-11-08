package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallVideoFallbackTest {

    @Test
    fun `a refused camera falls back with permissionDenied and warns the user`() {
        val fallback = CallVideoFallback.resolve(cameraGranted = false)

        assertThat(fallback).isEqualTo(CallVideoFallback.CameraPermissionDenied)
        assertThat(fallback!!.warnsUser).isTrue()
    }

    @Test
    fun `a missing camera falls back with noCamera and says nothing`() {
        val fallback = CallVideoFallback.resolve(cameraGranted = true, hasCamera = false)

        assertThat(fallback).isEqualTo(CallVideoFallback.NoCamera)
        assertThat(fallback!!.warnsUser).isFalse()
    }

    @Test
    fun `an emulator falls back silently even when the camera is refused`() {
        val fallback = CallVideoFallback.resolve(cameraGranted = false, isEmulator = true)

        assertThat(fallback).isEqualTo(CallVideoFallback.Emulator)
        assertThat(fallback!!.warnsUser).isFalse()
    }

    @Test
    fun `a usable camera needs no fallback`() {
        assertThat(CallVideoFallback.resolve(cameraGranted = true)).isNull()
    }
}
