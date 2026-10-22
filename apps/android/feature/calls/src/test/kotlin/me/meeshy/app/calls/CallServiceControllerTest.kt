package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import org.junit.Test

class CallServiceControllerTest {

    private class FakeLauncher : CallServiceLauncher {
        var starts = 0
        var stops = 0
        override fun start() { starts += 1 }
        override fun stop() { stops += 1 }
    }

    private fun snapshot(phase: CallActivityPhase) = CallActivitySnapshot(
        phase = phase,
        title = "Alice",
        statusLabel = "",
        initials = "A",
        isVideo = false,
        isMuted = false,
        connectedSinceEpochMs = null,
        showsDurationInCompact = true,
        caption = null,
    )

    @Test
    fun `starts the service once for an outgoing ring, connecting and connected`() {
        val launcher = FakeLauncher()
        val controller = CallServiceController(launcher)
        listOf(CallActivityPhase.Ringing, CallActivityPhase.Connecting, CallActivityPhase.Connected)
            .forEach { controller.sync(snapshot(it)) }
        assertThat(launcher.starts).isEqualTo(1)
    }

    @Test
    fun `stops the service when nothing is left to show`() {
        val launcher = FakeLauncher()
        val controller = CallServiceController(launcher)
        controller.sync(snapshot(CallActivityPhase.Connected))
        controller.sync(null)
        assertThat(launcher.stops).isEqualTo(1)
    }

    @Test
    fun `stopping without a running service is a no-op`() {
        val launcher = FakeLauncher()
        CallServiceController(launcher).sync(null)
        assertThat(launcher.stops).isEqualTo(0)
    }

    @Test
    fun `the ended state leaves the service to retire itself and allows a new call to start it`() {
        val launcher = FakeLauncher()
        val controller = CallServiceController(launcher)
        controller.sync(snapshot(CallActivityPhase.Connected))
        controller.sync(snapshot(CallActivityPhase.Ended))
        assertThat(launcher.stops).isEqualTo(0)
        controller.sync(snapshot(CallActivityPhase.Connecting))
        assertThat(launcher.starts).isEqualTo(2)
    }

    @Test
    fun `the camera type is requested only for a video call with the permission`() {
        val camera = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        assertThat(CallForegroundTypes.resolve(isVideo = true, micGranted = true, cameraGranted = true) and camera).isEqualTo(camera)
        assertThat(CallForegroundTypes.resolve(isVideo = false, micGranted = true, cameraGranted = true) and camera).isEqualTo(0)
        assertThat(CallForegroundTypes.resolve(isVideo = true, micGranted = true, cameraGranted = false) and camera).isEqualTo(0)
    }

    @Test
    fun `the phone call type is always kept and the microphone follows its permission`() {
        val phone = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        val mic = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        val types = CallForegroundTypes.resolve(isVideo = false, micGranted = false, cameraGranted = false)
        assertThat(types).isEqualTo(phone)
        assertThat(CallForegroundTypes.resolve(false, true, false)).isEqualTo(phone or mic)
    }
}
