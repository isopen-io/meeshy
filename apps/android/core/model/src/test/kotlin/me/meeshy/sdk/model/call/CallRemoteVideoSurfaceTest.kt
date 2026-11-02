package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRemoteVideoSurfaceTest {
    private fun resolve(hasTrack: Boolean, peerVideoEnabled: Boolean, waitElapsed: Boolean) =
        CallRemoteVideoSurface.resolve(hasTrack, peerVideoEnabled, waitElapsed)

    @Test
    fun `a track with the camera announced on is live`() {
        assertThat(resolve(true, true, false)).isEqualTo(CallRemoteVideoSurface.Live)
    }

    @Test
    fun `a track whose camera is announced off shows the camera-off avatar, never the frozen frame`() {
        assertThat(resolve(true, false, false)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `no track yet and a camera announced off is camera off at once`() {
        assertThat(resolve(false, false, false)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `no track and no announcement is connecting until the wait elapses`() {
        assertThat(resolve(false, true, false)).isEqualTo(CallRemoteVideoSurface.Connecting)
        assertThat(resolve(false, true, true)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `the wait is twelve seconds`() {
        assertThat(CallRemoteVideoSurface.WAIT_SECONDS).isEqualTo(12L)
    }

    @Test
    fun `the elapsed wait only counts for the same call once media is established`() {
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, "c1", "c1")).isTrue()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(false, "c1", "c1")).isFalse()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, "c1", "c2")).isFalse()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, null, null)).isFalse()
    }

    @Test
    fun `a peer escalating an audio call to video renders live as soon as its track arrives`() {
        assertThat(resolve(hasTrack = true, peerVideoEnabled = true, waitElapsed = false))
            .isEqualTo(CallRemoteVideoSurface.Live)
    }
}
